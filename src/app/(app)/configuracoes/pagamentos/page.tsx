import FormPagamentos from "@/components/configuracoes/FormPagamentos";
import { exigirPagina } from "@/lib/auth";
import { getConfigPagamento } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function PagamentosPage() {
  const sessao = await exigirPagina(["admin"]);
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-bold">Pagamentos</h1>
      <p className="mb-5 text-sm text-gray-600">Chave PIX do QR Code do PDV e taxas de cartão da sua loja.</p>
      <FormPagamentos inicial={await getConfigPagamento(sessao.tenantId)} />
    </main>
  );
}
