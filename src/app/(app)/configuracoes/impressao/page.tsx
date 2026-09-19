import ConfigImpressao from "@/components/configuracoes/ConfigImpressao";
import { exigirPagina } from "@/lib/auth";
import { getBranding, getConfigImpressao } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ImpressaoPage() {
  const sessao = await exigirPagina(["admin"]);
  const [config, branding] = await Promise.all([getConfigImpressao(sessao.tenantId), getBranding(sessao.tenantId)]);
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-1 text-2xl font-bold">Impressão do cupom</h1>
      <p className="mb-5 text-sm text-gray-600">Largura do papel da impressora térmica e cupom de teste.</p>
      <ConfigImpressao inicial={config.largura_cupom} nomeFantasia={branding.nome_fantasia} />
    </main>
  );
}
