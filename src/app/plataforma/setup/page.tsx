import { redirect } from "next/navigation";
import type { Metadata } from "next";
import CartaoAuth from "@/components/auth/CartaoAuth";
import FormLogin from "@/components/auth/FormLogin";
import { listarSuperAdmins } from "@/lib/supabase/auth-admin";
import { BRANDING_PADRAO } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plataforma — Primeiro acesso" };

// Só existe até o dono da plataforma ser criado; depois disso volta para o login.
export default async function PlataformaSetupPage() {
  const donos = await listarSuperAdmins().catch(() => null);
  if (donos && donos.length > 0) redirect("/plataforma/login");

  return (
    <CartaoAuth branding={BRANDING_PADRAO} titulo="Criar acesso do dono" subtitulo="Primeiro acesso à plataforma">
      <FormLogin de={null} modo="setup" />
    </CartaoAuth>
  );
}
