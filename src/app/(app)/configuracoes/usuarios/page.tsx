import { headers } from "next/headers";
import GerenciarUsuarios from "@/components/auth/GerenciarUsuarios";
import LinkDaEquipe from "@/components/auth/LinkDaEquipe";
import { exigirPagina } from "@/lib/auth";
import { listarUsuariosDaLoja } from "@/lib/supabase/auth-admin";
import { getBranding } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const sessao = await exigirPagina(["admin"]);
  const [loja, cab] = await Promise.all([getBranding(sessao.tenantId), headers()]);
  // Endereço pelo qual o administrador está acessando (atrás do Traefik vem em x-forwarded-*)
  const host = cab.get("x-forwarded-host") ?? cab.get("host") ?? "localhost:3000";
  const protocolo = cab.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const linkDaEquipe = `${protocolo}://${host}/c/${loja.slug}/login`;
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-bold">Usuários</h1>
      <p className="mb-5 text-sm text-gray-600">
        O <strong>administrador</strong> acessa tudo. O <strong>operador (caixa)</strong> só usa o PDV e vê o histórico
        de vendas, sem preço de custo, estoque ou configurações.
      </p>
      <LinkDaEquipe link={linkDaEquipe} nomeLoja={loja.nome_fantasia} />
      <GerenciarUsuarios usuarios={await listarUsuariosDaLoja(sessao.tenantId)} meuId={sessao.id} />
    </main>
  );
}
