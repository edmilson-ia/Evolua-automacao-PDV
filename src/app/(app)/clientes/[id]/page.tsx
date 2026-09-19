import { notFound } from "next/navigation";
import FormCliente from "@/components/clientes/FormCliente";
import { exigirPagina } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { COLUNAS_CLIENTE, type Cliente } from "@/types/cliente";

export const dynamic = "force-dynamic";

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirPagina(["admin"]);
  const { id } = await params;
  const { data } = await createServerClient()
    .from("clientes")
    .select(COLUNAS_CLIENTE)
    .eq("id", id)
    .eq("tenant_id", sessao.tenantId)
    .eq("ativo", true)
    .maybeSingle();
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-4 text-2xl font-bold">Editar cliente</h1>
      <FormCliente cliente={data as Cliente} />
    </main>
  );
}
