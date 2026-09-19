import type { SupabaseClient } from "@supabase/supabase-js";
import { erroDeGravacao } from "@/lib/produtoErros";
import { TAMANHO_LOTE, type ErroLinha, type LinhaPlano, type Plano } from "./tipos";

export type Autor = { tenantId: string; id: string; nome: string };

export type Resultado = {
  criados: number;
  atualizados: number;
  reativados: number;
  categoriasCriadas: number;
  erros: ErroLinha[];
};

const em_blocos = <T,>(lista: T[], n: number) =>
  Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

async function idsDasCategorias(db: SupabaseClient, tenantId: string, novas: string[]) {
  let criadas = 0;
  for (const nome of novas) {
    const { error } = await db.from("categorias").insert({ tenant_id: tenantId, nome });
    if (!error) criadas++;
    else if (error.code !== "23505") throw new Error(`Falha ao criar a categoria "${nome}": ${error.message}`);
  }
  const { data, error } = await db.from("categorias").select("id, nome").eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return { criadas, mapa: new Map((data ?? []).map((c) => [c.nome.toLowerCase(), c.id as string])) };
}

/** Campos da planilha → colunas da tabela. Só entra o que foi mapeado (categoria já vira categoria_id). */
function colunas(item: LinhaPlano, categorias: Map<string, string>) {
  const d = item.dados;
  const c: Record<string, unknown> = {};
  if (d.nome !== undefined) c.nome = d.nome;
  if (d.categoria !== undefined) c.categoria_id = d.categoria ? (categorias.get(d.categoria.toLowerCase()) ?? null) : null;
  if (d.preco_custo !== undefined) c.preco_custo = d.preco_custo;
  if (d.preco_venda !== undefined) c.preco_venda = d.preco_venda;
  if (d.estoque_minimo !== undefined) c.estoque_minimo = d.estoque_minimo;
  if (d.unidade !== undefined) c.unidade = d.unidade;
  if (d.descricao !== undefined) c.descricao = d.descricao;
  if (d.codigo_barras !== undefined) c.codigo_barras = d.codigo_barras;
  return c;
}

/** Aplica o plano. A loja vem SEMPRE do autor (sessão). Estoque só muda por registrar_movimento. */
export async function aplicar(db: SupabaseClient, autor: Autor, plano: Plano): Promise<Resultado> {
  const { tenantId } = autor;
  const resultado: Resultado = { criados: 0, atualizados: 0, reativados: 0, categoriasCriadas: 0, erros: [] };
  const falha = (i: LinhaPlano, erro: string) => resultado.erros.push({ linha: i.linha, sku: i.dados.sku, erro });

  const { criadas, mapa: categorias } = await idsDasCategorias(db, tenantId, plano.categoriasNovas);
  resultado.categoriasCriadas = criadas;

  // Produtos que já precisam de ajuste de estoque: [produto_id, item]
  const ajustes: { id: string; item: LinhaPlano }[] = [];

  // 1) Criar, em lotes. Estoque inicial entra depois, como movimento (o produto nasce com 0).
  const novos = plano.itens.filter((i) => i.acao === "criar");
  for (const lote of em_blocos(novos, TAMANHO_LOTE)) {
    const linhas = lote.map((i) => ({
      tenant_id: tenantId, sku: i.dados.sku, preco_custo: 0, quantidade: 0, ...colunas(i, categorias),
    }));
    const { data, error } = await db.from("produtos").insert(linhas).select("id, sku");
    if (!error) {
      const ids = new Map((data ?? []).map((p) => [p.sku as string, p.id as string]));
      for (const i of lote) {
        resultado.criados++;
        if (i.dados.quantidade) ajustes.push({ id: ids.get(i.dados.sku)!, item: i });
      }
      continue;
    }
    // O lote todo foi recusado (nada gravado): tenta linha a linha para apontar a que falhou
    for (const [k, i] of lote.entries()) {
      const um = await db.from("produtos").insert(linhas[k]).select("id").single();
      if (um.error) falha(i, erroDeGravacao(um.error).message);
      else {
        resultado.criados++;
        if (i.dados.quantidade) ajustes.push({ id: um.data.id, item: i });
      }
    }
  }

  // 2) Atualizar / reativar (só os campos mapeados), 10 por vez
  const existentes = plano.itens.filter((i) => i.acao !== "criar");
  for (const grupo of em_blocos(existentes, 10)) {
    await Promise.all(
      grupo.map(async (i) => {
        const campos = { ...colunas(i, categorias), ...(i.acao === "reativar" ? { ativo: true } : {}), atualizado_em: new Date().toISOString() };
        const { error } = await db.from("produtos").update(campos).eq("id", i.produtoId!).eq("tenant_id", tenantId);
        if (error) return falha(i, erroDeGravacao(error).message);
        if (i.acao === "reativar") resultado.reativados++;
        else resultado.atualizados++;
        if (i.dados.quantidade !== undefined && i.dados.quantidade !== i.quantidadeAtual) ajustes.push({ id: i.produtoId!, item: i });
      }),
    );
  }

  // 3) Estoque: diferença entre a planilha (contagem) e o sistema, como movimento auditado
  for (const grupo of em_blocos(ajustes, 10)) {
    await Promise.all(
      grupo.map(async ({ id, item }) => {
        const atual = item.quantidadeAtual ?? 0;
        const contagem = item.dados.quantidade!;
        const delta = contagem - atual;
        if (delta === 0) return;
        const { error } = await db.rpc("registrar_movimento", {
          p_tenant_id: tenantId,
          p_produto_id: id,
          p_tipo: delta > 0 ? "entrada" : "saida",
          p_quantidade: Math.abs(delta),
          p_motivo: item.acao === "criar" ? "Importação de planilha (estoque inicial)" : `Importação de planilha (contagem ${contagem}, sistema ${atual})`,
          p_operador_id: autor.id,
          p_operador_nome: autor.nome,
        });
        if (error) falha(item, `Produto gravado, mas o estoque não foi ajustado: ${error.message}`);
      }),
    );
  }

  resultado.erros.sort((a, b) => a.linha - b.linha);
  await db.from("auditoria").insert({
    tenant_id: tenantId,
    acao: "importacao_produtos",
    entidade: "produto",
    operador_id: autor.id,
    operador_nome: autor.nome,
    detalhe: { criados: resultado.criados, atualizados: resultado.atualizados, reativados: resultado.reativados, categorias_criadas: criadas, erros: resultado.erros.length },
  });
  return resultado;
}
