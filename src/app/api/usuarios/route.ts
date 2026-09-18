import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApi } from "@/lib/auth";
import { criarUsuario, listarUsuarios } from "@/lib/supabase/auth-admin";
import { normalizarTelefone } from "@/lib/telefone";

const schema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(60),
  telefone: z.string().refine((v) => normalizarTelefone(v) !== null, "Telefone inválido: informe o DDD e o número"),
  senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(72),
  perfil: z.enum(["admin", "operador"]),
});

export async function GET() {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  return NextResponse.json(await listarUsuarios());
}

export async function POST(req: Request) {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  const r = await criarUsuario({ ...parsed.data, telefone: normalizarTelefone(parsed.data.telefone)! });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json(r.usuario, { status: 201 });
}
