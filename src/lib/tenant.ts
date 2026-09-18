import { createServerClient } from "@/lib/supabase/server";

// MVP single-tenant: tenant fixo. Trocar por resolução via sessão/domínio quando entrar multi-tenant.
export const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";

export function getTenantId(): string {
  return DEFAULT_TENANT_ID;
}

export type Branding = {
  nome_fantasia: string;
  logo_url: string | null;
  icone_url: string | null;
  cor_primaria: string | null;
};

export const BRANDING_PADRAO: Branding = {
  nome_fantasia: "Evolua Automação",
  logo_url: null,
  icone_url: null,
  cor_primaria: "#2563eb",
};

export async function getBranding(): Promise<Branding> {
  try {
    const { data } = await createServerClient()
      .from("tenants")
      .select("nome_fantasia, logo_url, icone_url, cor_primaria")
      .eq("id", getTenantId())
      .single();
    return data ?? BRANDING_PADRAO;
  } catch {
    // Banco indisponível não pode derrubar o layout inteiro (nem o manifest do PWA)
    return BRANDING_PADRAO;
  }
}
