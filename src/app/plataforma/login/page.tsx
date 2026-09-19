import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import CartaoAuth from "@/components/auth/CartaoAuth";
import FormLogin from "@/components/auth/FormLogin";
import { getSessaoAtiva } from "@/lib/auth";
import { paginaInicial } from "@/lib/session";
import { listarSuperAdmins } from "@/lib/supabase/auth-admin";
import { BRANDING_PADRAO } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plataforma — Entrar" };

export default async function PlataformaLoginPage() {
  const sessao = await getSessaoAtiva();
  if (sessao?.perfil === "super_admin") redirect(paginaInicial(sessao.perfil));
  const semDono = (await listarSuperAdmins().catch(() => null))?.length === 0;

  return (
    <CartaoAuth branding={BRANDING_PADRAO} titulo="Entrar na plataforma" subtitulo="Gestão das lojas">
      {semDono && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Nenhum acesso da plataforma ainda.{" "}
          <Link href="/plataforma/setup" className="font-semibold underline">
            Criar o acesso do dono
          </Link>
          .
        </p>
      )}
      <FormLogin de={null} modo="login" />
    </CartaoAuth>
  );
}
