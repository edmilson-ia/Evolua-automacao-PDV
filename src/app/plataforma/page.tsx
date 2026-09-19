import type { Metadata } from "next";
import LogoutButton from "@/components/auth/LogoutButton";
import GerenciarLojas, { type LojaAdmin } from "@/components/plataforma/GerenciarLojas";
import { exigirPaginaPlataforma } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { usuariosPorLoja } from "@/lib/supabase/auth-admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plataforma — Lojas" };

export default async function PlataformaPage() {
  const sessao = await exigirPaginaPlataforma();
  const [{ data: lojas }, usuarios] = await Promise.all([
    createServerClient().from("tenants").select("id, slug, nome_fantasia, ativo, teste_ate, criado_em").order("criado_em"),
    usuariosPorLoja(),
  ]);

  const lista: LojaAdmin[] = (lojas ?? []).map((l) => ({
    ...l,
    usuarios: (usuarios.get(l.id) ?? []).map((u) => ({ id: u.id, nome: u.nome, telefone: u.telefone, perfil: u.perfil })),
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-3 sm:px-6">
          <span className="font-bold text-brand">Plataforma · Lojas</span>
          <span className="flex items-center gap-3">
            <span className="hidden text-sm text-gray-600 sm:inline">{sessao.nome}</span>
            <LogoutButton
              destino="/plataforma/login"
              className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50"
            />
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-6">
        <GerenciarLojas lojas={lista} />
      </main>
    </div>
  );
}
