// Sessão em cookie assinado (JWT HS256). Sem dependências de Next: pode rodar no proxy e nas rotas.
import { jwtVerify, SignJWT } from "jose";

export const COOKIE_SESSAO = "evolua_session";
/** Última loja usada neste aparelho (só o slug, nada sensível): o /login manda para a tela da loja. */
export const COOKIE_LOJA = "evolua_loja";
export const DURACAO_SESSAO_S = 12 * 60 * 60;

export type PerfilLoja = "admin" | "operador";
export type Perfil = PerfilLoja | "super_admin";

type Base = { id: string; email: string; nome: string };
/** Usuário de UMA loja. `tenantId` vem do token assinado: é a única fonte da loja nas rotas privadas. */
export type SessaoLoja = Base & { perfil: PerfilLoja; tenantId: string };
/** Dono da plataforma: não pertence a nenhuma loja. */
export type SessaoPlataforma = Base & { perfil: "super_admin"; tenantId: null };
export type Sessao = SessaoLoja | SessaoPlataforma;

/** Tela inicial de cada perfil. */
export const paginaInicial = (perfil: Perfil): string =>
  perfil === "super_admin" ? "/plataforma" : perfil === "admin" ? "/dashboard" : "/pdv";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function chave(): Uint8Array {
  const segredo = process.env.SESSION_SECRET;
  // Falhar alto: sem segredo forte o login não pode funcionar "de mentirinha"
  if (!segredo || segredo.length < 32) {
    throw new Error("Defina SESSION_SECRET (mínimo 32 caracteres) no .env.local");
  }
  return new TextEncoder().encode(segredo);
}

export async function criarToken(s: Sessao): Promise<string> {
  return new SignJWT({ email: s.email, nome: s.nome, perfil: s.perfil, ...(s.tenantId ? { tid: s.tenantId } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.id)
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SESSAO_S}s`)
    .sign(chave());
}

export async function lerToken(token?: string | null): Promise<Sessao | null> {
  if (!token) return null;
  const k = chave();
  try {
    const { payload } = await jwtVerify(token, k, { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const base = { id: payload.sub, email: String(payload.email ?? ""), nome: String(payload.nome ?? "") };
    if (payload.perfil === "super_admin") return { ...base, perfil: "super_admin", tenantId: null };
    if (payload.perfil !== "admin" && payload.perfil !== "operador") return null;
    // Token sem loja (emitido antes do multi-loja) não vale: a pessoa entra de novo
    if (typeof payload.tid !== "string" || !UUID.test(payload.tid)) return null;
    return { ...base, perfil: payload.perfil, tenantId: payload.tid };
  } catch {
    return null; // expirado, adulterado ou de outro segredo
  }
}
