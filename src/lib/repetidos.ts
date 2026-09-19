import type { SupabaseClient } from "@supabase/supabase-js";
import { chaveNome } from "@/lib/nome";

export type ProdutoRepetido = {
  id: string;
  nome: string;
  sku: string;
  preco_custo: number;
  preco_venda: number;
  quantidade: number;
  unidade: string;
  criado_em: string;
  vendas: number;
};

/** Todos os produtos ATIVOS de uma loja, lendo em páginas (o Supabase limita 1.000 linhas por consulta). */
export async function produtosAtivos<T>(db: SupabaseClient, tenantId: string, colunas: string): Promise<T[]> {
  const todos: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db
      .from("produtos")
      .select(colunas)
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("criado_em")
      .order("id")
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    todos.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return todos;
  }
}

/** Grupos de produtos ativos com o mesmo nome (2 ou mais), do mais antigo ao mais novo. Só da loja informada. */
export async function gruposRepetidos(db: SupabaseClient, tenantId: string, comVendas = false): Promise<ProdutoRepetido[][]> {
  const produtos = await produtosAtivos<Omit<ProdutoRepetido, "vendas">>(
    db, tenantId, "id, nome, sku, preco_custo, preco_venda, quantidade, unidade, criado_em",
  );
  const porNome = new Map<string, Omit<ProdutoRepetido, "vendas">[]>();
  for (const p of produtos) {
    const k = chaveNome(p.nome);
    porNome.set(k, [...(porNome.get(k) ?? []), p]);
  }
  const grupos = [...porNome.values()].filter((g) => g.length > 1);

  const comHistorico = new Set<string>();
  if (comVendas && grupos.length) {
    const ids = grupos.flat().map((p) => p.id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db.from("itens_venda").select("produto_id").in("produto_id", ids.slice(i, i + 100));
      if (error) throw new Error(error.message);
      for (const r of data ?? []) comHistorico.add(r.produto_id);
    }
  }
  return grupos
    .map((g) => g.map((p) => ({ ...p, preco_custo: Number(p.preco_custo), preco_venda: Number(p.preco_venda), quantidade: Number(p.quantidade), vendas: comHistorico.has(p.id) ? 1 : 0 })))
    .sort((a, b) => a[0].nome.localeCompare(b[0].nome, "pt-BR"));
}
