import FormProduto from "@/components/estoque/FormProduto";
import { exigirPagina } from "@/lib/auth";
import { listarCategorias } from "@/lib/categorias";

export const dynamic = "force-dynamic";

export default async function NovoProdutoPage() {
  const sessao = await exigirPagina(["admin"]);
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-4">Novo produto</h1>
      <FormProduto categorias={await listarCategorias(sessao.tenantId)} />
    </main>
  );
}
