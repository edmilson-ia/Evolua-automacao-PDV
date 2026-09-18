import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApi, getSessao } from "@/lib/auth";
import { atualizarUsuario, listarUsuarios, removerUsuario } from "@/lib/supabase/auth-admin";
import { normalizarTelefone } from "@/lib/telefone";

type Ctx = { params: Promise<{ id: string }> };

const schema = z
  .object({
    senha: z.string().min(8, "A senha precisa de pelo menos 8 caracteres").max(72).optional(),
    perfil: z.enum(["admin", "operador"]).optional(),
    nome: z.string().trim().min(2).max(60).optional(),
    telefone: z.string().refine((v) => normalizarTelefone(v) !== null, "Telefone inválido: informe o DDD e o número").optional(),
  })
  .refine((d) => d.senha || d.perfil || d.nome || d.telefone, "Nada para alterar");

/** Impede ficar sem nenhum administrador. */
async function ultimoAdmin(id: string): Promise<boolean> {
  const admins = (await listarUsuarios()).filter((u) => u.perfil === "admin");
  return admins.length === 1 && admins[0].id === id;
}

export async function PUT(req: Request, { params }: Ctx) {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  if (parsed.data.perfil === "operador" && (await ultimoAdmin(id))) {
    return NextResponse.json({ error: "Este é o único administrador: não dá para rebaixá-lo" }, { status: 409 });
  }
  const r = await atualizarUsuario(id, {
    ...parsed.data,
    telefone: parsed.data.telefone ? (normalizarTelefone(parsed.data.telefone) ?? undefined) : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  return NextResponse.json(r.usuario);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const { id } = await params;
  if ((await getSessao())?.id === id) {
    return NextResponse.json({ error: "Você não pode excluir o seu próprio usuário" }, { status: 409 });
  }
  if (await ultimoAdmin(id)) {
    return NextResponse.json({ error: "Este é o único administrador: não dá para excluí-lo" }, { status: 409 });
  }
  const r = await removerUsuario(id);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
