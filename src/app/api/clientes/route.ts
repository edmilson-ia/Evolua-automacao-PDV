import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { clienteSchema, COLUNAS_CLIENTE } from "@/types/cliente";

// Operador (caixa) busca e cadastra cliente no balcão; editar e excluir é só do administrador.
export async function GET(req: Request) {
  const acesso = await exigirApi();
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  // Tira caracteres que têm significado no filtro do PostgREST (vírgula, parênteses, %)
  const busca = (new URL(req.url).searchParams.get("q") ?? "").replace(/[,()%*]/g, " ").trim();
  let query = createServerClient()
    .from("clientes")
    .select(COLUNAS_CLIENTE)
    .eq("tenant_id", sessao.tenantId)
    .eq("ativo", true)
    .order("nome")
    .limit(200);
  if (busca) {
    const digitos = busca.replace(/\D/g, "");
    query = query.or(
      [`nome.ilike.%${busca}%`, `email.ilike.%${busca}%`, ...(digitos ? [`telefone.ilike.%${digitos}%`] : [])].join(","),
    );
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const acesso = await exigirApi();
  if (!acesso.ok) return acesso.resposta;
  const parsed = clienteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const { data, error } = await createServerClient()
    .from("clientes")
    .insert({ ...parsed.data, tenant_id: acesso.sessao.tenantId })
    .select(COLUNAS_CLIENTE)
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Já existe um cliente com este telefone" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
