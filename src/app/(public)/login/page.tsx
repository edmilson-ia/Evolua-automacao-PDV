import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import CartaoAuth from "@/components/auth/CartaoAuth";
import FormLogin from "@/components/auth/FormLogin";
import { getSessao } from "@/lib/auth";
import { listarUsuarios } from "@/lib/supabase/auth-admin";
import { getBranding } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  const sessao = await getSessao();
  if (sessao) redirect(sessao.perfil === "admin" ? "/dashboard" : "/pdv");

  const [{ de }, branding, usuarios] = await Promise.all([
    searchParams,
    getBranding(),
    listarUsuarios().catch(() => null),
  ]);

  return (
    <CartaoAuth branding={branding} titulo="Entrar" subtitulo="PDV e controle de estoque">
      {usuarios && usuarios.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Nenhum usuário cadastrado ainda.{" "}
          <Link href="/setup" className="font-semibold underline">
            Configure o administrador
          </Link>
          .
        </p>
      )}
      <FormLogin de={de ?? null} modo="login" />
    </CartaoAuth>
  );
}
