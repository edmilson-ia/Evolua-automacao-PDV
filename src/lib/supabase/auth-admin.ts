// Acesso ao Supabase Auth pelo servidor (chave secreta). Nunca importar em componente de cliente.
// O login do sistema é o TELEFONE (guardado em user_metadata.telefone). O e-mail existe só porque o
// Supabase exige um por usuário: para usuários novos ele é gerado a partir do telefone (emailInterno).
import type { Perfil } from "@/lib/session";
import { emailInterno, normalizarTelefone } from "@/lib/telefone";

type UsuarioBruto = {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string | null;
  user_metadata?: { nome?: string; telefone?: string };
  app_metadata?: { perfil?: string };
};

export type UsuarioAuth = {
  id: string;
  /** E-mail interno do Supabase (não é o login). */
  email: string;
  nome: string;
  /** Só dígitos com DDD, ex.: 11987654321. null = usuário antigo, ainda sem telefone cadastrado. */
  telefone: string | null;
  /** null = usuário sem perfil do sistema (ex.: cadastrado por fora): não pode entrar. */
  perfil: Perfil | null;
  criado_em: string;
  ultimo_login: string | null;
};

const mapear = (u: UsuarioBruto): UsuarioAuth => ({
  id: u.id,
  email: u.email ?? "",
  nome: u.user_metadata?.nome?.trim() || u.user_metadata?.telefone || u.email || "",
  telefone: u.user_metadata?.telefone ?? null,
  perfil: u.app_metadata?.perfil === "admin" || u.app_metadata?.perfil === "operador" ? u.app_metadata.perfil : null,
  criado_em: u.created_at,
  ultimo_login: u.last_sign_in_at ?? null,
});

function chamar(path: string, init: RequestInit = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY");
  return fetch(`${url}/auth/v1${path}`, {
    ...init,
    cache: "no-store",
    headers: { apikey: key, "Content-Type": "application/json", ...init.headers },
  });
}

/** Confere e-mail (interno) + senha. Devolve o usuário, ou null se as credenciais estiverem erradas. */
export async function verificarSenha(email: string, senha: string): Promise<UsuarioAuth | null> {
  const res = await chamar("/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password: senha }) });
  if (res.status === 400 || res.status === 401 || res.status === 422) return null;
  if (!res.ok) throw new Error(`Falha na autenticação (${res.status})`);
  return mapear(((await res.json()) as { user: UsuarioBruto }).user);
}

export async function listarUsuarios(): Promise<UsuarioAuth[]> {
  const res = await chamar("/admin/users?per_page=200");
  if (!res.ok) throw new Error(`Falha ao listar usuários (${res.status})`);
  return ((await res.json()) as { users: UsuarioBruto[] }).users.map(mapear);
}

/** Acha o usuário pelo telefone (login normal) ou pelo e-mail (acesso antigo). */
export async function buscarPorIdentificador(identificador: string): Promise<UsuarioAuth | null> {
  const usuarios = await listarUsuarios();
  const id = identificador.trim();
  if (id.includes("@")) return usuarios.find((u) => u.email.toLowerCase() === id.toLowerCase()) ?? null;
  const tel = normalizarTelefone(id);
  return tel ? (usuarios.find((u) => u.telefone === tel) ?? null) : null;
}

async function obterBruto(id: string): Promise<UsuarioBruto | null> {
  const res = await chamar(`/admin/users/${id}`);
  return res.ok ? ((await res.json()) as UsuarioBruto) : null;
}

export type ResultadoEscrita = { ok: true; usuario?: UsuarioAuth } | { ok: false; erro: string };

async function traduzirErro(res: Response): Promise<string> {
  const j = (await res.json().catch(() => null)) as { error_code?: string; msg?: string } | null;
  switch (j?.error_code) {
    case "email_exists":
    case "user_already_exists":
      return "Já existe um usuário com este telefone";
    case "weak_password":
      return "Senha fraca: use pelo menos 8 caracteres, misturando letras e números";
    default:
      return j?.msg ?? "Não foi possível concluir a operação";
  }
}

const ERRO_TELEFONE_REPETIDO = "Já existe um usuário com este telefone";

export async function criarUsuario(d: { telefone: string; senha: string; nome: string; perfil: Perfil }): Promise<ResultadoEscrita> {
  if ((await listarUsuarios()).some((u) => u.telefone === d.telefone)) return { ok: false, erro: ERRO_TELEFONE_REPETIDO };
  const res = await chamar("/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: emailInterno(d.telefone),
      password: d.senha,
      email_confirm: true,
      user_metadata: { nome: d.nome, telefone: d.telefone },
      app_metadata: { perfil: d.perfil },
    }),
  });
  if (!res.ok) return { ok: false, erro: await traduzirErro(res) };
  return { ok: true, usuario: mapear((await res.json()) as UsuarioBruto) };
}

export async function atualizarUsuario(
  id: string,
  d: { senha?: string; nome?: string; perfil?: Perfil; telefone?: string },
): Promise<ResultadoEscrita> {
  const body: Record<string, unknown> = {};
  if (d.senha) body.password = d.senha;
  if (d.perfil) body.app_metadata = { perfil: d.perfil };
  if (d.nome || d.telefone) {
    if (d.telefone && (await listarUsuarios()).some((u) => u.id !== id && u.telefone === d.telefone)) {
      return { ok: false, erro: ERRO_TELEFONE_REPETIDO };
    }
    // Mescla com o que já existe para não apagar os outros campos do usuário
    const atual = await obterBruto(id);
    if (!atual) return { ok: false, erro: "Usuário não encontrado" };
    body.user_metadata = {
      ...atual.user_metadata,
      ...(d.nome ? { nome: d.nome } : {}),
      ...(d.telefone ? { telefone: d.telefone } : {}),
    };
  }
  const res = await chamar(`/admin/users/${id}`, { method: "PUT", body: JSON.stringify(body) });
  if (!res.ok) return { ok: false, erro: await traduzirErro(res) };
  return { ok: true, usuario: mapear((await res.json()) as UsuarioBruto) };
}

export async function removerUsuario(id: string): Promise<ResultadoEscrita> {
  const res = await chamar(`/admin/users/${id}`, { method: "DELETE" });
  if (!res.ok) return { ok: false, erro: await traduzirErro(res) };
  return { ok: true };
}
