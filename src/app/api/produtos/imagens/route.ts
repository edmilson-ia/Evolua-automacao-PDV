import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApi } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { baixarImagem } from "@/lib/imagens/baixar";
import { converterParaWebp } from "@/lib/imagens/processar";
import { prefixoImagensDaLoja } from "@/lib/storage";

// Cada chamada baixa poucas fotos (a tela manda em lotes): 8 fotos, 4 por vez, cada uma com no máximo 12 s
export const maxDuration = 60;
const POR_VEZ = 4;

const schema = z.object({
  itens: z
    .array(z.object({ produto_id: z.string().uuid(), url: z.string().trim().min(1).max(2000) }))
    .min(1, "Nenhuma foto no lote")
    .max(8, "No máximo 8 fotos por chamada"),
  substituir: z.boolean().default(false),
});

type Resultado = { produto_id: string; status: "ok" | "mantida" | "erro"; erro?: string };

const ehErroDeImagem = (e: unknown): e is Error => e instanceof Error && e.name === "ErroImagem";

/**
 * Baixa a foto de cada link, reprocessa (WEBP, até 1200 px) e grava na pasta da loja. Só admin. A loja vem da
 * sessão e o produto precisa ser dela; o link só é acessado com as proteções de src/lib/imagens/baixar.ts.
 */
export async function POST(req: Request) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { itens, substituir } = parsed.data;
  const db = createServerClient();
  const prefixoLoja = prefixoImagensDaLoja(sessao.tenantId);
  const prefixoBucket = prefixoLoja.slice(0, prefixoLoja.lastIndexOf(sessao.tenantId));

  async function um(item: (typeof itens)[number]): Promise<Resultado> {
    const falha = (erro: string): Resultado => ({ produto_id: item.produto_id, status: "erro", erro });
    const { data: produto } = await db
      .from("produtos")
      .select("id, imagem_url")
      .eq("id", item.produto_id)
      .eq("tenant_id", sessao.tenantId)
      .eq("ativo", true)
      .maybeSingle();
    if (!produto) return falha("Produto não encontrado");
    if (produto.imagem_url && !substituir) return { produto_id: produto.id, status: "mantida" };
    try {
      const webp = await converterParaWebp(await baixarImagem(item.url));
      const caminho = `${sessao.tenantId}/produtos/${crypto.randomUUID()}.webp`;
      const { error: erroUpload } = await db.storage.from("produtos").upload(caminho, webp, { contentType: "image/webp" });
      if (erroUpload) return falha("Não foi possível guardar a imagem");
      const url = db.storage.from("produtos").getPublicUrl(caminho).data.publicUrl;
      const { error: erroUpdate } = await db
        .from("produtos")
        .update({ imagem_url: url, atualizado_em: new Date().toISOString() })
        .eq("id", produto.id)
        .eq("tenant_id", sessao.tenantId);
      if (erroUpdate) {
        await db.storage.from("produtos").remove([caminho]);
        return falha("Não foi possível salvar a imagem no produto");
      }
      // Trocou a foto: apaga o arquivo antigo se ele era da pasta desta loja
      if (produto.imagem_url?.startsWith(prefixoLoja)) {
        await db.storage.from("produtos").remove([produto.imagem_url.slice(prefixoBucket.length)]);
      }
      return { produto_id: produto.id, status: "ok" };
    } catch (e) {
      return falha(ehErroDeImagem(e) ? e.message : "Não foi possível baixar a imagem deste link");
    }
  }

  const resultados: Resultado[] = [];
  for (let i = 0; i < itens.length; i += POR_VEZ) {
    resultados.push(...(await Promise.all(itens.slice(i, i + POR_VEZ).map(um))));
  }
  return NextResponse.json({ resultados });
}
