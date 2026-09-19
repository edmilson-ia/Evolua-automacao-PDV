import { montarManifest } from "@/lib/pwa";
import { getLojaPorSlug } from "@/lib/tenant";

// Manifest do app instalado, POR LOJA: nome, cor e ícones da marca da loja do endereço.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const loja = await getLojaPorSlug((await params).slug);
  if (!loja?.ativo) return new Response("Loja não encontrada", { status: 404 });
  return Response.json(montarManifest(loja), { headers: { "Content-Type": "application/manifest+json" } });
}
