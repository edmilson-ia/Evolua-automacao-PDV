import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import type { TaxasCartao } from "@/lib/taxas";
import { estadoDoTeste, type EstadoTeste } from "@/lib/teste";

// Não existe "loja padrão": nas rotas privadas a loja vem SEMPRE da sessão (sessao.tenantId);
// nas telas públicas, do slug da URL (getLojaPorSlug).

export type Branding = {
  slug: string;
  nome_fantasia: string;
  logo_url: string | null;
  icone_url: string | null;
  cor_primaria: string | null;
};

export const BRANDING_PADRAO: Branding = {
  slug: "",
  nome_fantasia: "Evolua Automação",
  logo_url: null,
  icone_url: null,
  cor_primaria: "#2563eb",
};

const COLUNAS_BRANDING = "slug, nome_fantasia, logo_url, icone_url, cor_primaria";

/** Marca da loja. Sem loja (tela sem sessão) ou banco indisponível: marca padrão. */
export async function getBranding(tenantId: string | null): Promise<Branding> {
  if (!tenantId) return BRANDING_PADRAO;
  try {
    const { data } = await createServerClient().from("tenants").select(COLUNAS_BRANDING).eq("id", tenantId).single();
    return data ?? BRANDING_PADRAO;
  } catch {
    // Banco indisponível não pode derrubar o layout inteiro (nem o manifest do PWA)
    return BRANDING_PADRAO;
  }
}

/** `ativo` já considera o período de teste: teste vencido = inativa. `teste_vencido` diferencia da suspensão manual. */
export type LojaPublica = Branding & { id: string; ativo: boolean; teste_vencido: boolean };

/** Loja pelo slug da URL (telas públicas). null = não existe. Quem chama decide o que fazer com loja suspensa ou com teste vencido. */
export const getLojaPorSlug = cache(async (slug: string): Promise<LojaPublica | null> => {
  const { data } = await createServerClient()
    .from("tenants")
    .select(`id, ativo, teste_ate, ${COLUNAS_BRANDING}`)
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  if (!data) return null;
  const { ativo, teste_ate, ...resto } = data;
  const vencido = estadoDoTeste(teste_ate).modo === "vencido";
  return { ...resto, ativo: ativo === true && !vencido, teste_vencido: ativo === true && vencido };
});

/** Situação do teste grátis da loja (para os avisos nas telas). Loja sem prazo = definitiva. */
export const getTeste = cache(async (tenantId: string): Promise<EstadoTeste> => {
  const { data } = await createServerClient().from("tenants").select("teste_ate").eq("id", tenantId).maybeSingle();
  return estadoDoTeste(data?.teste_ate);
});

export type ConfigPagamento = { pix_chave: string; pix_cidade: string; caixa_obrigatorio: boolean } & TaxasCartao;

/** PIX, taxas de cartão e regra do caixa da loja (dados internos: nunca vão para telas públicas). */
export async function getConfigPagamento(tenantId: string): Promise<ConfigPagamento> {
  const { data } = await createServerClient()
    .from("tenants")
    .select("pix_chave, pix_cidade, taxa_debito, taxa_credito, caixa_obrigatorio")
    .eq("id", tenantId)
    .single();
  return {
    pix_chave: data?.pix_chave ?? "",
    pix_cidade: data?.pix_cidade ?? "",
    caixa_obrigatorio: data?.caixa_obrigatorio === true,
    debito: Number(data?.taxa_debito ?? 0),
    credito: Number(data?.taxa_credito ?? 0),
  };
}

/** Largura do papel do cupom (impressora térmica): 58 ou 80 mm. */
export async function getConfigImpressao(tenantId: string): Promise<{ largura_cupom: 58 | 80 }> {
  const { data } = await createServerClient().from("tenants").select("largura_cupom").eq("id", tenantId).single();
  return { largura_cupom: data?.largura_cupom === 58 ? 58 : 80 };
}

// Loja suspensa deve perder o acesso logo, mesmo com sessão (JWT) ainda válida: confere a cada
// requisição, com cache curto para não pesar no banco.
const CACHE_ATIVA_MS = 30_000;
// Guardado no globalThis: rotas e páginas podem ser compiladas em pacotes separados (no desenvolvimento), e "ativar/prorrogar/
// suspender" precisa limpar o MESMO cache que o resto do servidor consulta.
type EntradaCache = { ativo: boolean; ate: number };
const cacheAtiva: Map<string, EntradaCache> = ((globalThis as { __evoluaCacheLojaAtiva?: Map<string, EntradaCache> }).__evoluaCacheLojaAtiva ??= new Map());

export async function lojaAtiva(tenantId: string): Promise<boolean> {
  const c = cacheAtiva.get(tenantId);
  if (c && c.ate > Date.now()) return c.ativo;
  const { data } = await createServerClient().from("tenants").select("ativo, teste_ate").eq("id", tenantId).maybeSingle();
  // Suspensa à mão OU teste grátis vencido: em qualquer caso perde o acesso (nada é apagado)
  const ativo = data?.ativo === true && estadoDoTeste(data.teste_ate).modo !== "vencido";
  cacheAtiva.set(tenantId, { ativo, ate: Date.now() + CACHE_ATIVA_MS });
  return ativo;
}

/** Suspender/reativar precisa valer já na instância que fez a mudança. */
export function esquecerCacheLoja(tenantId: string): void {
  cacheAtiva.delete(tenantId);
}
