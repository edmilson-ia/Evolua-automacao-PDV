import { notFound } from "next/navigation";
import { exigirPagina } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import type { Produto } from "@/types/produto";
import FormProduto from "@/components/estoque/FormProduto";
import { listarCategorias } from "@/lib/categorias";

export const dynamic = "force-dynamic";

export default async function EditarProdutoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await exigirPagina(["admin"]);
  const { id } = await params;
  const { data } = await createServerClient()
    .from("produtos")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", sessao.tenantId)
    .single();
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-4">Editar produto</h1>
      <FormProduto produto={data as Produto} categorias={await listarCategorias(sessao.tenantId)} />
    </main>
  );
}
