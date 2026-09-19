import FormBranding from "@/components/branding/FormBranding";
import { exigirPagina } from "@/lib/auth";
import { getBranding } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  const sessao = await exigirPagina(["admin"]);
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-bold">Marca do cliente</h1>
      <p className="mb-5 text-sm text-gray-600">
        Personalize nome, logo, cor e ícone. Vale para o sistema, o catálogo público e o app instalado.
      </p>
      <FormBranding inicial={await getBranding(sessao.tenantId)} />
    </main>
  );
}
