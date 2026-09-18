import { createServerClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";
import type { Categoria } from "@/types/produto";

export async function listarCategorias(): Promise<Categoria[]> {
  const { data } = await createServerClient()
    .from("categorias")
    .select("id, nome")
    .eq("tenant_id", getTenantId())
    .order("nome");
  return data ?? [];
}
