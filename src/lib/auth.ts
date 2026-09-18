import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { COOKIE_SESSAO, DURACAO_SESSAO_S, lerToken, type Perfil, type Sessao } from "@/lib/session";

export async function getSessao(): Promise<Sessao | null> {
  return lerToken((await cookies()).get(COOKIE_SESSAO)?.value);
}

/** Para páginas (server components): manda para o login ou para o PDV se faltar permissão. */
export async function exigirPagina(perfis?: Perfil[]): Promise<Sessao> {
  const s = await getSessao();
  if (!s) redirect("/login");
  if (perfis && !perfis.includes(s.perfil)) redirect("/pdv");
  return s;
}

/**
 * Para rotas de API. Retorna uma resposta de erro (401/403) ou null se estiver liberado.
 * O proxy já filtra antes, mas a API confere de novo: a checagem fica junto dos dados.
 */
export async function exigirApi(perfis?: Perfil[]): Promise<NextResponse | null> {
  const s = await getSessao();
  if (!s) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (perfis && !perfis.includes(s.perfil)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  return null;
}

export const opcoesCookieSessao = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: DURACAO_SESSAO_S,
};
