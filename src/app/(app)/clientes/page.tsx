import Link from "next/link";
import ExcluirClienteButton from "@/components/clientes/ExcluirClienteButton";
import { exigirPagina } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { formatarTelefone } from "@/lib/telefone";
import { COLUNAS_CLIENTE, type Cliente } from "@/types/cliente";

export const dynamic = "force-dynamic";

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sessao = await exigirPagina(); // admin e operador
  const podeEditar = sessao.perfil === "admin";
  const { q } = await searchParams;
  // Sem caracteres que têm significado no filtro do PostgREST (vírgula, parênteses, %)
  const busca = (q ?? "").replace(/[,()%*]/g, " ").trim();

  let query = createServerClient()
    .from("clientes")
    .select(COLUNAS_CLIENTE)
    .eq("tenant_id", sessao.tenantId)
    .eq("ativo", true)
    .order("nome")
    .limit(200);
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    query = query.or(
      [`nome.ilike.%${busca}%`, `email.ilike.%${busca}%`, ...(digitos ? [`telefone.ilike.%${digitos}%`] : [])].join(","),
    );
  }
  const clientes = ((await query).data ?? []) as Cliente[];

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-gray-600">Cadastro de clientes da loja.</p>
        </div>
        <Link href="/clientes/novo" className="rounded-lg bg-brand px-4 py-2 font-medium text-white">
          + Novo cliente
        </Link>
      </div>

      <form className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nome, telefone ou e-mail"
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
        />
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">Telefone</th>
              <th className="p-3">E-mail</th>
              <th className="p-3">Endereço</th>
              {podeEditar && <th className="p-3" />}
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id} className="border-t border-gray-100 align-top">
                <td className="p-3 font-medium">{c.nome}</td>
                <td className="whitespace-nowrap p-3">{c.telefone ? formatarTelefone(c.telefone) : "—"}</td>
                <td className="p-3">{c.email ?? "—"}</td>
                <td className="p-3 text-gray-600">{c.endereco ?? "—"}</td>
                {podeEditar && (
                  <td className="space-x-3 whitespace-nowrap p-3 text-right">
                    <Link href={`/clientes/${c.id}`} className="text-brand hover:underline">Editar</Link>
                    <ExcluirClienteButton id={c.id} nome={c.nome} />
                  </td>
                )}
              </tr>
            ))}
            {clientes.length === 0 && (
              <tr>
                <td colSpan={podeEditar ? 5 : 4} className="p-6 text-center text-gray-500">
                  {busca ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
