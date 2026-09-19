import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import CartaoAuth from "@/components/auth/CartaoAuth";
import FormCodigoLoja from "@/components/auth/FormCodigoLoja";
import { getSessaoAtiva } from "@/lib/auth";
import { slugSchema } from "@/lib/loja";
import { COOKIE_LOJA, paginaInicial } from "@/lib/session";
import { BRANDING_PADRAO } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar" };

// Porta de entrada sem loja no endereço: manda para o login da última loja usada neste aparelho;
// se não houver (ou a pessoa pedir para trocar), pergunta o endereço da loja.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ de?: string; trocar?: string }> }) {
  const sessao = await getSessaoAtiva();
  if (sessao) redirect(paginaInicial(sessao.perfil));

  const { de, trocar } = await searchParams;
  const ultima = slugSchema.safeParse((await cookies()).get(COOKIE_LOJA)?.value);
  if (ultima.success && !trocar) redirect(`/c/${ultima.data}/login${de ? `?de=${encodeURIComponent(de)}` : ""}`);

  return (
    <CartaoAuth branding={BRANDING_PADRAO} titulo="Qual é a sua loja?" subtitulo="PDV e controle de estoque">
      <FormCodigoLoja />
    </CartaoAuth>
  );
}
