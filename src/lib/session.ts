// Sessão em cookie assinado (JWT HS256). Sem dependências de Next: pode rodar no proxy e nas rotas.
import { jwtVerify, SignJWT } from "jose";

export const COOKIE_SESSAO = "evolua_session";
export const DURACAO_SESSAO_S = 12 * 60 * 60;

export type Perfil = "admin" | "operador";
export type Sessao = { id: string; email: string; nome: string; perfil: Perfil };

function chave(): Uint8Array {
  const segredo = process.env.SESSION_SECRET;
  // Falhar alto: sem segredo forte o login não pode funcionar "de mentirinha"
  if (!segredo || segredo.length < 32) {
    throw new Error("Defina SESSION_SECRET (mínimo 32 caracteres) no .env.local");
  }
  return new TextEncoder().encode(segredo);
}

export async function criarToken(s: Sessao): Promise<string> {
  return new SignJWT({ email: s.email, nome: s.nome, perfil: s.perfil })
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
    if (payload.perfil !== "admin" && payload.perfil !== "operador") return null;
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      nome: String(payload.nome ?? ""),
      perfil: payload.perfil,
    };
  } catch {
    return null; // expirado, adulterado ou de outro segredo
  }
}
