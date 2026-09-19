import type { SupabaseClient } from "@supabase/supabase-js";

type Exemplo = { nome: string; categoria: string; custo: number; venda: number; qtd: number; minimo: number };

// Produtos genéricos (sem marca) para a loja de demonstração não nascer vazia
const EXEMPLOS: Exemplo[] = [
  { nome: "Refrigerante Cola 2L", categoria: "Bebidas", custo: 6.2, venda: 9.9, qtd: 24, minimo: 6 },
  { nome: "Refrigerante Laranja 2L", categoria: "Bebidas", custo: 5.8, venda: 8.9, qtd: 18, minimo: 6 },
  { nome: "Água Mineral 500ml", categoria: "Bebidas", custo: 1.2, venda: 2.5, qtd: 60, minimo: 12 },
  { nome: "Água com Gás 500ml", categoria: "Bebidas", custo: 1.6, venda: 3.5, qtd: 36, minimo: 12 },
  { nome: "Suco de Uva 1L", categoria: "Bebidas", custo: 5.5, venda: 8.9, qtd: 20, minimo: 6 },
  { nome: "Cerveja Lata 350ml", categoria: "Bebidas", custo: 2.9, venda: 4.5, qtd: 96, minimo: 24 },
  { nome: "Energético 269ml", categoria: "Bebidas", custo: 5.4, venda: 8.9, qtd: 3, minimo: 6 },
  { nome: "Arroz Tipo 1 5kg", categoria: "Mercearia", custo: 19.0, venda: 26.9, qtd: 15, minimo: 5 },
  { nome: "Feijão Carioca 1kg", categoria: "Mercearia", custo: 5.9, venda: 8.5, qtd: 22, minimo: 8 },
  { nome: "Açúcar Refinado 1kg", categoria: "Mercearia", custo: 3.4, venda: 5.2, qtd: 30, minimo: 10 },
  { nome: "Café Torrado 500g", categoria: "Mercearia", custo: 12.5, venda: 18.9, qtd: 14, minimo: 5 },
  { nome: "Macarrão Espaguete 500g", categoria: "Mercearia", custo: 3.0, venda: 4.8, qtd: 40, minimo: 10 },
  { nome: "Óleo de Soja 900ml", categoria: "Mercearia", custo: 5.5, venda: 7.9, qtd: 25, minimo: 8 },
  { nome: "Detergente 500ml", categoria: "Limpeza", custo: 1.7, venda: 2.9, qtd: 48, minimo: 12 },
  { nome: "Sabão em Pó 1kg", categoria: "Limpeza", custo: 9.9, venda: 14.9, qtd: 16, minimo: 6 },
  { nome: "Água Sanitária 1L", categoria: "Limpeza", custo: 3.1, venda: 5.5, qtd: 20, minimo: 6 },
  { nome: "Chocolate ao Leite 90g", categoria: "Snacks", custo: 4.6, venda: 7.5, qtd: 35, minimo: 10 },
  { nome: "Biscoito Recheado 130g", categoria: "Snacks", custo: 2.1, venda: 3.9, qtd: 50, minimo: 12 },
  { nome: "Batata Chips 90g", categoria: "Snacks", custo: 5.2, venda: 8.9, qtd: 28, minimo: 8 },
  { nome: "Bala de Goma 100g", categoria: "Snacks", custo: 2.0, venda: 3.9, qtd: 0, minimo: 6 },
];

/** Cria categorias e ~20 produtos de exemplo na loja (para demonstrar o sistema a um cliente). Devolve quantos criou. */
export async function criarProdutosDeExemplo(db: SupabaseClient, tenantId: string): Promise<number> {
  const nomes = [...new Set(EXEMPLOS.map((e) => e.categoria))];
  const { data: cats, error: erroCats } = await db
    .from("categorias")
    .insert(nomes.map((nome) => ({ tenant_id: tenantId, nome })))
    .select("id, nome");
  if (erroCats) throw new Error(erroCats.message);
  const idDaCategoria = new Map((cats ?? []).map((c) => [c.nome as string, c.id as string]));

  const { data, error } = await db
    .from("produtos")
    .insert(
      EXEMPLOS.map((e, i) => ({
        tenant_id: tenantId,
        sku: `EX-${String(i + 1).padStart(3, "0")}`,
        nome: e.nome,
        categoria_id: idDaCategoria.get(e.categoria) ?? null,
        preco_custo: e.custo,
        preco_venda: e.venda,
        quantidade: e.qtd,
        estoque_minimo: e.minimo,
        unidade: "un",
        visivel_catalogo: true,
      })),
    )
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
