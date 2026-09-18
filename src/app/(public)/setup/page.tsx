import { redirect } from "next/navigation";
import type { Metadata } from "next";
import CartaoAuth from "@/components/auth/CartaoAuth";
import FormLogin from "@/components/auth/FormLogin";
import { listarUsuarios } from "@/lib/supabase/auth-admin";
import { getBranding } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Primeiro acesso" };

// Só existe até o primeiro administrador ser criado; depois disso volta para o login.
export default async function SetupPage() {
  const usuarios = await listarUsuarios().catch(() => null);
  if (usuarios && usuarios.length > 0) redirect("/login");

  return (
    <CartaoAuth branding={await getBranding()} titulo="Criar administrador" subtitulo="Primeiro acesso ao sistema">
      <FormLogin de={null} modo="setup" />
    </CartaoAuth>
  );
}
