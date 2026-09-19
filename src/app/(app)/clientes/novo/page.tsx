import FormCliente from "@/components/clientes/FormCliente";
import { exigirPagina } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NovoClientePage() {
  await exigirPagina(); // admin e operador
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-4 text-2xl font-bold">Novo cliente</h1>
      <FormCliente />
    </main>
  );
}
