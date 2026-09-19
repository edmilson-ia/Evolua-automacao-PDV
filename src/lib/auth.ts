import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  COOKIE_SESSAO,
  DURACAO_SESSAO_S,
  lerToken,
  type PerfilLoja,
  type Sessao,
  type SessaoLoja,
  type SessaoPlataforma,
} from "@/lib/session";
import { lojaAtiva } from "@/lib/tenant";

/** Resultado das checagens de API: ou a sessão liberada, ou a resposta de erro pronta para devolver. */
export type Acesso<S> = { ok: true; sessao: S } | { ok: false; resposta: NextResponse };

const erro = (mensagem: string, status: number): { ok: false; resposta: NextResponse } => ({
  ok: false,
  resposta: NextResponse.json({ error: mensagem }, { status }),
});

/** Sessão do cookie, sem checar a loja. Prefira exigirApi/exigirPagina. */
export async function getSessao(): Promise<Sessao | null> {
  return lerToken((await cookies()).get(COOKIE_SESSAO)?.value);
}

/** Sessão válida E com a loja ativa: loja suspensa perde o acesso mesmo com o cookie ainda no prazo. */
export async function getSessaoAtiva(): Promise<Sessao | null> {
  const s = await getSessao();
  if (!s) return null;
  if (s.perfil !== "super_admin" && !(await lojaAtiva(s.tenantId))) return null;
  return s;
}

/** Para páginas da loja (server components): manda para o login ou para o PDV se faltar permissão. */
export async function exigirPagina(perfis?: PerfilLoja[]): Promise<SessaoLoja> {
  const s = await getSessaoAtiva();
  if (!s) redirect("/login");
  if (s.perfil === "super_admin") redirect("/plataforma");
  if (perfis && !perfis.includes(s.perfil)) redirect("/pdv");
  return s;
}

/** Para páginas da plataforma (/plataforma): só o super-admin. */
export async function exigirPaginaPlataforma(): Promise<SessaoPlataforma> {
  const s = await getSessao();
  if (!s) redirect("/plataforma/login");
  if (s.perfil !== "super_admin") redirect("/");
  return s;
}

/**
 * Para rotas de API da loja. O proxy já filtra antes, mas a API confere de novo: a checagem fica junto
 * dos dados. A loja (`sessao.tenantId`) vem do token assinado, nunca do corpo ou da URL.
 */
export async function exigirApi(perfis?: PerfilLoja[]): Promise<Acesso<SessaoLoja>> {
  const s = await getSessao();
  if (!s) return erro("Não autenticado", 401);
  if (s.perfil === "super_admin") return erro("Sem permissão", 403);
  if (perfis && !perfis.includes(s.perfil)) return erro("Sem permissão", 403);
  if (!(await lojaAtiva(s.tenantId))) return erro("Loja suspensa", 403);
  return { ok: true, sessao: s };
}

/** Para rotas de API da plataforma (/api/plataforma): só o super-admin. */
export async function exigirApiPlataforma(): Promise<Acesso<SessaoPlataforma>> {
  const s = await getSessao();
  if (!s) return erro("Não autenticado", 401);
  if (s.perfil !== "super_admin") return erro("Sem permissão", 403);
  return { ok: true, sessao: s };
}

export const opcoesCookieSessao = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: DURACAO_SESSAO_S,
};

export const opcoesCookieLoja = { ...opcoesCookieSessao, maxAge: 365 * 24 * 60 * 60 };
