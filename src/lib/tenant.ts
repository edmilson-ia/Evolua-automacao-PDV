import { cache } from "react";
import { createServerClient } from "@/lib/supabase/server";
import type { TaxasCartao } from "@/lib/taxas";

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

export type LojaPublica = Branding & { id: string; ativo: boolean };

/** Loja pelo slug da URL (telas públicas). null = não existe. Quem chama decide o que fazer com loja suspensa. */
export const getLojaPorSlug = cache(async (slug: string): Promise<LojaPublica | null> => {
  const { data } = await createServerClient()
    .from("tenants")
    .select(`id, ativo, ${COLUNAS_BRANDING}`)
    .eq("slug", slug.toLowerCase())
    .maybeSingle();
  return data ?? null;
});

export type ConfigPagamento = { pix_chave: string; pix_cidade: string } & TaxasCartao;

/** PIX e taxas de cartão da loja (dados internos: nunca vão para telas públicas). */
export async function getConfigPagamento(tenantId: string): Promise<ConfigPagamento> {
  const { data } = await createServerClient()
    .from("tenants")
    .select("pix_chave, pix_cidade, taxa_debito, taxa_credito")
    .eq("id", tenantId)
    .single();
  return {
    pix_chave: data?.pix_chave ?? "",
    pix_cidade: data?.pix_cidade ?? "",
    debito: Number(data?.taxa_debito ?? 0),
    credito: Number(data?.taxa_credito ?? 0),
  };
}

// Loja suspensa deve perder o acesso logo, mesmo com sessão (JWT) ainda válida: confere a cada
// requisição, com cache curto para não pesar no banco.
const CACHE_ATIVA_MS = 30_000;
const cacheAtiva = new Map<string, { ativo: boolean; ate: number }>();

export async function lojaAtiva(tenantId: string): Promise<boolean> {
  const c = cacheAtiva.get(tenantId);
  if (c && c.ate > Date.now()) return c.ativo;
  const { data } = await createServerClient().from("tenants").select("ativo").eq("id", tenantId).maybeSingle();
  const ativo = data?.ativo === true;
  cacheAtiva.set(tenantId, { ativo, ate: Date.now() + CACHE_ATIVA_MS });
  return ativo;
}

/** Suspender/reativar precisa valer já na instância que fez a mudança. */
export function esquecerCacheLoja(tenantId: string): void {
  cacheAtiva.delete(tenantId);
}
