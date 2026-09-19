import type { Metadata } from "next";
import Pdv from "@/components/pdv/Pdv";
import { exigirPagina } from "@/lib/auth";
import { getBranding, getConfigPagamento } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const sessao = await exigirPagina();
  const { nome_fantasia } = await getBranding(sessao.tenantId);
  return { title: `PDV — ${nome_fantasia}` };
}

// Modo caixa: tela cheia, sem o menu do painel (fica no hambúrguer do próprio PDV).
export default async function PdvPage() {
  const sessao = await exigirPagina(); // admin e operador
  const [branding, config] = await Promise.all([getBranding(sessao.tenantId), getConfigPagamento(sessao.tenantId)]);
  const pix = { chave: config.pix_chave, cidade: config.pix_cidade };
  return <Pdv branding={branding} pix={pix} operador={sessao.nome} perfil={sessao.perfil} />;
}
