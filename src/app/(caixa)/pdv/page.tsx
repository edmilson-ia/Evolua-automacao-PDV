import type { Metadata } from "next";
import Pdv from "@/components/pdv/Pdv";
import { exigirPagina } from "@/lib/auth";
import { getBranding } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { nome_fantasia } = await getBranding();
  return { title: `PDV — ${nome_fantasia}` };
}

// Modo caixa: tela cheia, sem o menu do painel (fica no hambúrguer do próprio PDV).
export default async function PdvPage() {
  const sessao = await exigirPagina(); // admin e operador
  // MVP: chave PIX em variável de ambiente. Com multi-tenant, passa para a tabela `tenants`.
  const pix = { chave: process.env.PIX_KEY ?? "", cidade: process.env.PIX_CITY ?? "" };
  return <Pdv branding={await getBranding()} pix={pix} operador={sessao.nome} perfil={sessao.perfil} />;
}
