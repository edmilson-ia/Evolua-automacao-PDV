import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import CartaoAuth from "@/components/auth/CartaoAuth";
import FormLogin from "@/components/auth/FormLogin";
import { getSessaoAtiva } from "@/lib/auth";
import { paginaInicial } from "@/lib/session";
import { getLojaPorSlug } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar" };

export default async function LojaLoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ de?: string }>;
}) {
  const loja = await getLojaPorSlug((await params).slug);
  if (!loja) notFound();

  // Já logado NESTA loja: vai direto para a tela inicial. Sessão de outra loja não conta.
  const sessao = await getSessaoAtiva();
  if (sessao && sessao.perfil !== "super_admin" && sessao.tenantId === loja.id) redirect(paginaInicial(sessao.perfil));

  if (!loja.ativo) {
    return (
      <CartaoAuth branding={loja} titulo="Loja suspensa" subtitulo="PDV e controle de estoque">
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          O acesso desta loja está suspenso no momento. Fale com o suporte para regularizar.
        </p>
      </CartaoAuth>
    );
  }

  return (
    <CartaoAuth branding={loja} titulo="Entrar" subtitulo="PDV e controle de estoque">
      <FormLogin de={(await searchParams).de ?? null} modo="login" loja={loja.slug} />
      <p className="mt-5 text-center text-xs text-gray-500">
        Não é a sua loja?{" "}
        <Link href="/login?trocar=1" className="font-medium text-brand hover:underline">
          Trocar de loja
        </Link>
      </p>
    </CartaoAuth>
  );
}
