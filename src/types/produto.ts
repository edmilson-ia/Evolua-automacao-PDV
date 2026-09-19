import { z } from "zod";
import { erroCodigoBarras, normalizarCodigoBarras } from "@/lib/codigoBarras";

export const produtoSchema = z.object({
  nome: z.string().min(1, "Nome obrigatório"),
  sku: z.string().min(1, "SKU obrigatório"),
  codigo_barras: z
    .preprocess((v) => (typeof v === "string" ? normalizarCodigoBarras(v) : v), z.string().nullable().optional())
    .superRefine((v, ctx) => {
      const erro = v ? erroCodigoBarras(v) : null;
      if (erro) ctx.addIssue({ code: "custom", message: erro });
    }),
  categoria_id: z.string().uuid().nullable().optional(),
  descricao: z.string().nullable().optional(),
  imagem_url: z.string().url().nullable().optional(),
  preco_custo: z.coerce.number().min(0),
  preco_venda: z.coerce.number().min(0),
  quantidade: z.coerce.number().min(0).default(0),
  estoque_minimo: z.coerce.number().min(0).default(0),
  unidade: z.string().min(1).default("un"),
  visivel_catalogo: z.boolean().default(true),
});

export type ProdutoInput = z.infer<typeof produtoSchema>;

export type Produto = ProdutoInput & {
  id: string;
  tenant_id: string;
  ativo: boolean;
};

export type Categoria = { id: string; nome: string };
