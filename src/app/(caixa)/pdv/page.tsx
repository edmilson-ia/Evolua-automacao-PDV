import type { Metadata } from "next";
import Pdv from "@/components/pdv/Pdv";
import { exigirPagina } from "@/lib/auth";
import { getCaixaAberto } from "@/lib/caixa";
import { getBranding, getConfigImpressao, getConfigPagamento } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const sessao = await exigirPagina();
  const { nome_fantasia } = await getBranding(sessao.tenantId);
  return { title: `PDV — ${nome_fantasia}` };
}

// Modo caixa: tela cheia, sem o menu do painel (fica no hambúrguer do próprio PDV).
export default async function PdvPage() {
  const sessao = await exigirPagina(); // admin e operador
  const [branding, config, caixa, impressao] = await Promise.all([
    getBranding(sessao.tenantId),
    getConfigPagamento(sessao.tenantId),
    getCaixaAberto(sessao.tenantId, sessao.id),
    getConfigImpressao(sessao.tenantId),
  ]);
  const pix = { chave: config.pix_chave, cidade: config.pix_cidade };
  return <Pdv branding={branding} pix={pix} operador={sessao.nome} perfil={sessao.perfil} caixa={caixa} caixaObrigatorio={config.caixa_obrigatorio} larguraCupom={impressao.largura_cupom} tenantId={sessao.tenantId} operadorId={sessao.id} />;
}
