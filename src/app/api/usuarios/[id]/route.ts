import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApi } from "@/lib/auth";
import { atualizarUsuario, listarUsuariosDaLoja, removerUsuario, type ResultadoEscrita } from "@/lib/supabase/auth-admin";
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

/** Impede ficar sem nenhum administrador na loja. */
async function ultimoAdmin(tenantId: string, id: string): Promise<boolean> {
  const admins = (await listarUsuariosDaLoja(tenantId)).filter((u) => u.perfil === "admin");
  return admins.length === 1 && admins[0].id === id;
}

const falha = (r: Extract<ResultadoEscrita, { ok: false }>) =>
  NextResponse.json({ error: r.erro }, { status: r.naoEncontrado ? 404 : 400 });

export async function PUT(req: Request, { params }: Ctx) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
  }
  if (parsed.data.perfil === "operador" && (await ultimoAdmin(sessao.tenantId, id))) {
    return NextResponse.json({ error: "Este é o único administrador: não dá para rebaixá-lo" }, { status: 409 });
  }
  const r = await atualizarUsuario(id, sessao.tenantId, {
    ...parsed.data,
    telefone: parsed.data.telefone ? (normalizarTelefone(parsed.data.telefone) ?? undefined) : undefined,
  });
  if (!r.ok) return falha(r);
  return NextResponse.json(r.usuario);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;
  const { id } = await params;
  if (sessao.id === id) {
    return NextResponse.json({ error: "Você não pode excluir o seu próprio usuário" }, { status: 409 });
  }
  if (await ultimoAdmin(sessao.tenantId, id)) {
    return NextResponse.json({ error: "Este é o único administrador: não dá para excluí-lo" }, { status: 409 });
  }
  const r = await removerUsuario(id, sessao.tenantId);
  if (!r.ok) return falha(r);
  return new NextResponse(null, { status: 204 });
}
