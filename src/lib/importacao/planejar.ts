import type { SupabaseClient } from "@supabase/supabase-js";
import { chaveNome } from "@/lib/nome";
import { produtosAtivos } from "@/lib/repetidos";
import type { ErroLinha, LinhaPlano, LinhaValidada, Plano } from "./tipos";

type Existente = { id: string; sku: string; ativo: boolean; quantidade: number };

const em_blocos = <T,>(lista: T[], n: number) =>
  Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

/**
 * Transforma as linhas validadas num plano (criar / atualizar / reativar), lendo o banco SÓ da loja informada.
 * Não grava nada: serve tanto para a prévia quanto para a confirmação.
 */
export async function planejar(db: SupabaseClient, tenantId: string, validadas: LinhaValidada[]): Promise<Plano> {
  const erros: ErroLinha[] = [];
  const boas: LinhaValidada[] = [];
  for (const v of validadas) {
    if (v.erros.length) erros.push(...v.erros.map((erro) => ({ linha: v.linha, sku: v.dados.sku, erro })));
    else boas.push(v);
  }

  // Produtos que já existem na loja (inclusive os excluídos: o SKU é único por loja)
  const existentes = new Map<string, Existente>();
  for (const bloco of em_blocos(boas.map((b) => b.dados.sku).filter(Boolean), 100)) {
    const { data, error } = await db
      .from("produtos")
      .select("id, sku, ativo, quantidade")
      .eq("tenant_id", tenantId)
      .in("sku", bloco);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) existentes.set(p.sku, { ...p, quantidade: Number(p.quantidade) });
  }

  const { data: cats, error: errCats } = await db.from("categorias").select("nome").eq("tenant_id", tenantId);
  if (errCats) throw new Error(errCats.message);
  const categoriasDaLoja = new Set((cats ?? []).map((c) => c.nome.toLowerCase()));
  const novas = new Map<string, string>(); // minúsculo → nome como veio na planilha

  // Linhas sem SKU ganham um código automático (AUTO-000001...), continuando a numeração da loja
  const semSku = boas.filter((b) => !b.dados.sku);
  let proximoAuto = 0;
  if (semSku.length) {
    const { data: ultimo, error: errAuto } = await db
      .from("produtos")
      .select("sku")
      .eq("tenant_id", tenantId)
      .like("sku", "AUTO-%")
      .order("sku", { ascending: false })
      .limit(1);
    if (errAuto) throw new Error(errAuto.message);
    proximoAuto = Number(ultimo?.[0]?.sku.slice(5)) || 0;
  }

  // Nomes que já existem (produtos ativos) e nomes já vistos neste arquivo, para marcar os repetidos
  const ativosPorNome = new Map<string, { id: string; nome: string; sku: string }>();
  for (const p of await produtosAtivos<{ id: string; nome: string; sku: string }>(db, tenantId, "id, nome, sku")) {
    if (!ativosPorNome.has(chaveNome(p.nome))) ativosPorNome.set(chaveNome(p.nome), p);
  }
  const vistosNoArquivo = new Map<string, number>();

  let semPreco = 0;
  const itens: LinhaPlano[] = [];
  for (const v of boas) {
    if (!v.dados.sku) v.dados.sku = `AUTO-${String(++proximoAuto).padStart(6, "0")}`;
    const ex = existentes.get(v.dados.sku);
    if (!ex) {
      // Produto novo: o que faltar assume um padrão (nome = SKU, preço de venda = 0)
      v.dados.nome ??= v.dados.sku;
      if (v.dados.preco_venda === undefined) {
        v.dados.preco_venda = 0;
        semPreco++;
      }
    }
    const cat = v.dados.categoria;
    const categoriaNova = !!cat && !categoriasDaLoja.has(cat.toLowerCase());
    if (categoriaNova && cat) novas.set(cat.toLowerCase(), cat);
    const acao = !ex ? "criar" : ex.ativo ? "atualizar" : "reativar";
    let repetido: LinhaPlano["repetido"] = null;
    if (v.dados.nome) {
      const chave = chaveNome(v.dados.nome);
      const noEstoque = ativosPorNome.get(chave);
      if (acao !== "atualizar") {
        if (noEstoque && noEstoque.id !== ex?.id) repetido = { motivo: "estoque", com: `${noEstoque.nome.trim()} (SKU ${noEstoque.sku})` };
        else if (vistosNoArquivo.has(chave)) repetido = { motivo: "arquivo", com: `linha ${vistosNoArquivo.get(chave)}` };
      }
      if (!vistosNoArquivo.has(chave)) vistosNoArquivo.set(chave, v.linha);
    }
    itens.push({
      linha: v.linha,
      acao,
      repetido,
      dados: v.dados,
      produtoId: ex?.id ?? null,
      quantidadeAtual: ex ? ex.quantidade : null,
      categoriaNova,
    });
  }

  erros.sort((a, b) => a.linha - b.linha);
  const conta = (acao: LinhaPlano["acao"]) => itens.filter((i) => i.acao === acao).length;
  return {
    itens,
    erros,
    categoriasNovas: [...novas.values()],
    avisos: { semSku: semSku.length, semPreco },
    totais: { criar: conta("criar"), atualizar: conta("atualizar"), reativar: conta("reativar"), erros: erros.length, repetidos: itens.filter((i) => i.repetido).length },
  };
}

/**
 * Tira do plano as linhas repetidas, exceto as que o usuário pediu para importar mesmo assim (`manter`).
 * Sem a lista, o padrão é PULAR todas: quem não escolheu nada nunca cria produto duplicado sem querer.
 */
export function descartarRepetidos(plano: Plano, manter: Set<number>): { plano: Plano; pulados: number } {
  const itens = plano.itens.filter((i) => !i.repetido || manter.has(i.linha));
  const novas = new Map<string, string>();
  for (const i of itens) if (i.categoriaNova && i.dados.categoria) novas.set(i.dados.categoria.toLowerCase(), i.dados.categoria);
  const conta = (acao: LinhaPlano["acao"]) => itens.filter((i) => i.acao === acao).length;
  return {
    pulados: plano.itens.length - itens.length,
    plano: {
      ...plano,
      itens,
      categoriasNovas: [...novas.values()],
      totais: { ...plano.totais, criar: conta("criar"), atualizar: conta("atualizar"), reativar: conta("reativar"), repetidos: itens.filter((i) => i.repetido).length },
    },
  };
}
