// Acesso ao Supabase Auth pelo servidor (chave secreta). Nunca importar em componente de cliente.
// O login do sistema é o TELEFONE (guardado em user_metadata.telefone). O e-mail existe só porque o
// Supabase exige um por usuário: para usuários novos ele é gerado a partir do telefone + slug da loja.
// Perfil e loja (tenant_id) ficam em app_metadata, que o próprio usuário NÃO consegue editar.
import type { Perfil } from "@/lib/session";
import { emailInterno } from "@/lib/telefone";

type UsuarioBruto = {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at?: string | null;
  user_metadata?: { nome?: string; telefone?: string };
  app_metadata?: { perfil?: string; tenant_id?: string };
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
  /** Loja do usuário. null = super-admin (ou usuário sem loja, que não pode entrar). */
  tenantId: string | null;
  criado_em: string;
  ultimo_login: string | null;
};

const PERFIS: readonly string[] = ["admin", "operador", "super_admin"];

const mapear = (u: UsuarioBruto): UsuarioAuth => ({
  id: u.id,
  email: u.email ?? "",
  nome: u.user_metadata?.nome?.trim() || u.user_metadata?.telefone || u.email || "",
  telefone: u.user_metadata?.telefone ?? null,
  perfil: PERFIS.includes(u.app_metadata?.perfil ?? "") ? (u.app_metadata!.perfil as Perfil) : null,
  tenantId: u.app_metadata?.tenant_id ?? null,
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

const POR_PAGINA = 200;

/** Todos os usuários da instalação (todas as lojas), paginando. Uso interno: quem expõe filtra por loja. */
async function listarTodos(): Promise<UsuarioAuth[]> {
  const todos: UsuarioAuth[] = [];
  for (let pagina = 1; ; pagina++) {
    const res = await chamar(`/admin/users?page=${pagina}&per_page=${POR_PAGINA}`);
    if (!res.ok) throw new Error(`Falha ao listar usuários (${res.status})`);
    const { users } = (await res.json()) as { users: UsuarioBruto[] };
    todos.push(...users.map(mapear));
    if (users.length < POR_PAGINA) return todos;
  }
}

export async function listarUsuariosDaLoja(tenantId: string): Promise<UsuarioAuth[]> {
  return (await listarTodos()).filter((u) => u.tenantId === tenantId && u.perfil !== null && u.perfil !== "super_admin");
}

/** Usuários de todas as lojas agrupados por loja (só para o painel do dono da plataforma). */
export async function usuariosPorLoja(): Promise<Map<string, UsuarioAuth[]>> {
  const grupos = new Map<string, UsuarioAuth[]>();
  for (const u of await listarTodos()) {
    if (!u.tenantId || !u.perfil || u.perfil === "super_admin") continue;
    grupos.set(u.tenantId, [...(grupos.get(u.tenantId) ?? []), u]);
  }
  return grupos;
}

/** Usuários do dono da plataforma. */
export async function listarSuperAdmins(): Promise<UsuarioAuth[]> {
  return (await listarTodos()).filter((u) => u.perfil === "super_admin");
}

/**
 * Acha o usuário DA LOJA pelo telefone (login normal) ou pelo e-mail (acesso antigo, sem telefone).
 * tenantId null = super-admin. O telefone só é único dentro da loja.
 */
export async function buscarUsuario(
  tenantId: string | null,
  identificador: { telefone: string } | { email: string },
): Promise<UsuarioAuth | null> {
  const doEscopo = tenantId === null ? await listarSuperAdmins() : await listarUsuariosDaLoja(tenantId);
  if ("email" in identificador) return doEscopo.find((u) => u.email.toLowerCase() === identificador.email.toLowerCase()) ?? null;
  return doEscopo.find((u) => u.telefone === identificador.telefone) ?? null;
}

async function obterBruto(id: string): Promise<UsuarioBruto | null> {
  const res = await chamar(`/admin/users/${id}`);
  return res.ok ? ((await res.json()) as UsuarioBruto) : null;
}

export type ResultadoEscrita =
  | { ok: true; usuario?: UsuarioAuth }
  | { ok: false; erro: string; naoEncontrado?: boolean };

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
const NAO_ENCONTRADO = { ok: false, erro: "Usuário não encontrado", naoEncontrado: true } as const;

/** O usuário existe E pertence a esta loja? (isolamento: nunca mexer em usuário de outra loja pelo id) */
async function daLoja(id: string, tenantId: string | null): Promise<UsuarioBruto | null> {
  const u = await obterBruto(id);
  return u && (u.app_metadata?.tenant_id ?? null) === tenantId ? u : null;
}

export async function criarUsuario(d: {
  telefone: string;
  senha: string;
  nome: string;
  perfil: Perfil;
  /** null = super-admin. */
  tenantId: string | null;
  /** Slug da loja ("plataforma" para o super-admin): entra no e-mail interno. */
  slug: string;
}): Promise<ResultadoEscrita> {
  const escopo = d.tenantId === null ? await listarSuperAdmins() : await listarUsuariosDaLoja(d.tenantId);
  if (escopo.some((u) => u.telefone === d.telefone)) return { ok: false, erro: ERRO_TELEFONE_REPETIDO };
  const res = await chamar("/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: emailInterno(d.telefone, d.slug),
      password: d.senha,
      email_confirm: true,
      user_metadata: { nome: d.nome, telefone: d.telefone },
      app_metadata: { perfil: d.perfil, ...(d.tenantId ? { tenant_id: d.tenantId } : {}) },
    }),
  });
  if (!res.ok) return { ok: false, erro: await traduzirErro(res) };
  return { ok: true, usuario: mapear((await res.json()) as UsuarioBruto) };
}

export async function atualizarUsuario(
  id: string,
  tenantId: string | null,
  d: { senha?: string; nome?: string; perfil?: Perfil; telefone?: string },
): Promise<ResultadoEscrita> {
  const atual = await daLoja(id, tenantId);
  if (!atual) return NAO_ENCONTRADO;
  const body: Record<string, unknown> = {};
  if (d.senha) body.password = d.senha;
  // Mescla com o que já existe: não pode perder o tenant_id nem os outros campos
  if (d.perfil) body.app_metadata = { ...atual.app_metadata, perfil: d.perfil };
  if (d.nome || d.telefone) {
    if (d.telefone) {
      const escopo = tenantId === null ? await listarSuperAdmins() : await listarUsuariosDaLoja(tenantId);
      if (escopo.some((u) => u.id !== id && u.telefone === d.telefone)) return { ok: false, erro: ERRO_TELEFONE_REPETIDO };
    }
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

export async function removerUsuario(id: string, tenantId: string | null): Promise<ResultadoEscrita> {
  if (!(await daLoja(id, tenantId))) return NAO_ENCONTRADO;
  const res = await chamar(`/admin/users/${id}`, { method: "DELETE" });
  if (!res.ok) return { ok: false, erro: await traduzirErro(res) };
  return { ok: true };
}
