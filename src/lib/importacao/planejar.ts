import type { SupabaseClient } from "@supabase/supabase-js";
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
  for (const bloco of em_blocos(boas.map((b) => b.dados.sku), 100)) {
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

  const itens: LinhaPlano[] = [];
  for (const v of boas) {
    const ex = existentes.get(v.dados.sku);
    if (!ex && (v.dados.nome === undefined || v.dados.preco_venda === undefined)) {
      const falta = v.dados.nome === undefined ? "Nome" : "Preço de venda";
      erros.push({ linha: v.linha, sku: v.dados.sku, erro: `${falta} obrigatório para produto novo (SKU não cadastrado)` });
      continue;
    }
    const cat = v.dados.categoria;
    const categoriaNova = !!cat && !categoriasDaLoja.has(cat.toLowerCase());
    if (categoriaNova && cat) novas.set(cat.toLowerCase(), cat);
    itens.push({
      linha: v.linha,
      acao: !ex ? "criar" : ex.ativo ? "atualizar" : "reativar",
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
    totais: { criar: conta("criar"), atualizar: conta("atualizar"), reativar: conta("reativar"), erros: erros.length },
  };
}
