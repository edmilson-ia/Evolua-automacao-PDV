import GerenciarUsuarios from "@/components/auth/GerenciarUsuarios";
import { exigirPagina } from "@/lib/auth";
import { listarUsuariosDaLoja } from "@/lib/supabase/auth-admin";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const sessao = await exigirPagina(["admin"]);
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-bold">Usuários</h1>
      <p className="mb-5 text-sm text-gray-600">
        O <strong>administrador</strong> acessa tudo. O <strong>operador (caixa)</strong> só usa o PDV e vê o histórico
        de vendas, sem preço de custo, estoque ou configurações.
      </p>
      <GerenciarUsuarios usuarios={await listarUsuariosDaLoja(sessao.tenantId)} meuId={sessao.id} />
    </main>
  );
}
