import { createServerClient } from "@/lib/supabase/server";
import type { Categoria } from "@/types/produto";

export async function listarCategorias(tenantId: string): Promise<Categoria[]> {
  const { data } = await createServerClient()
    .from("categorias")
    .select("id, nome")
    .eq("tenant_id", tenantId)
    .order("nome");
  return data ?? [];
}
