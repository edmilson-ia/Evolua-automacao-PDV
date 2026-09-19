import Link from "next/link";
import { exigirPagina } from "@/lib/auth";
import ImportarProdutos from "@/components/estoque/ImportarProdutos";

export default async function ImportarPage() {
  await exigirPagina(["admin"]);
  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link href="/estoque" className="text-sm text-brand hover:underline">‹ Voltar ao estoque</Link>
      <h1 className="mt-2 mb-1 text-2xl font-bold">Importar produtos por planilha</h1>
      <p className="mb-5 text-sm text-gray-600">
        Envie um arquivo CSV ou XLSX. Produtos com o mesmo SKU são atualizados; os demais são criados.
        Nada é gravado antes de você conferir a prévia.
      </p>
      <ImportarProdutos />
    </main>
  );
}
