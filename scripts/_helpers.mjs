// Utilidades dos scripts de teste de integração (rodam contra o servidor local + Supabase real).
// Regras: só cria dados "TESTE", registra TUDO o que cria e apaga por id no final. Nunca imprime chaves.
import { createClient } from "@supabase/supabase-js";

export const BASE = process.env.BASE_URL ?? "http://localhost:3000";
export const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const TENANT_EVOLUA = "00000000-0000-0000-0000-000000000001";
export const SENHA = "TesteSenha#2026";
export const sufixo = Date.now().toString().slice(-6);
export const db = createClient(URL_SB, KEY, { auth: { persistSession: false } });

// ---------- resultado ----------
let ok = 0;
let falhas = 0;
export function check(nome, cond, extra = "") {
  if (cond) ok++;
  else falhas++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${nome}${!cond && extra ? `  -> ${extra}` : ""}`);
}
export const contagem = () => ({ ok, falhas });
export const marcarFalha = () => void falhas++;

// ---------- estado do banco (antes x depois) ----------
const auth = (path, init = {}) =>
  fetch(`${URL_SB}/auth/v1${path}`, { ...init, headers: { apikey: KEY, "Content-Type": "application/json", ...init.headers } });

export async function todosUsuarios() {
  const todos = [];
  for (let pagina = 1; ; pagina++) {
    const { users } = await (await auth(`/admin/users?page=${pagina}&per_page=200`)).json();
    todos.push(...users);
    if (users.length < 200) return todos;
  }
}

export async function estadoReal() {
  const cont = async (t) => (await db.from(t).select("id", { count: "exact", head: true })).count;
  const { data: fantas } = await db.from("produtos").select("id, nome, quantidade, preco_venda").ilike("nome", "fanta%").order("id");
  const { data: lojas } = await db.from("tenants").select("id, slug, nome_fantasia, ativo, pix_chave, pix_cidade, taxa_debito, taxa_credito");
  return {
    tenants: JSON.stringify(lojas?.sort((a, b) => a.id.localeCompare(b.id))),
    produtos: await cont("produtos"),
    categorias: await cont("categorias"),
    vendas: await cont("vendas"),
    movimentos: await cont("movimentos_estoque"),
    auditoria: await cont("auditoria"),
    clientes: await cont("clientes"),
    usuarios: (await todosUsuarios()).map((u) => u.id).sort(),
    fantas: JSON.stringify(fantas),
  };
}

// ---------- tudo o que o teste cria (para apagar por id) ----------
export const criados = { usuarios: [], lojas: [], vendas: [], produtos: [], clientes: [], arquivos: [] };

export async function criarLoja(slug, nome, cor, extra = {}) {
  const { data, error } = await db.from("tenants").insert({ slug, nome_fantasia: nome, cor_primaria: cor, ...extra }).select("id").single();
  if (error) throw new Error(`Falha ao criar loja de teste: ${error.message}`);
  criados.lojas.push(data.id);
  return { id: data.id, slug, nome, cor };
}

/** perfil: admin | operador | super_admin (tenantId null). */
export async function criarUsuario({ nome, telefone, perfil, tenantId, slug }) {
  const r = await auth("/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: `${telefone}@${slug}.evolua.test`,
      password: SENHA,
      email_confirm: true,
      user_metadata: { nome, telefone },
      app_metadata: { perfil, ...(tenantId ? { tenant_id: tenantId } : {}) },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Falha ao criar usuário de teste: ${j.msg ?? r.status}`);
  criados.usuarios.push(j.id);
  return { id: j.id, nome, telefone, tenantId };
}

export async function criarProduto(tenantId, nome, sku, extra = {}) {
  const { data, error } = await db
    .from("produtos")
    .insert({ tenant_id: tenantId, nome, sku, preco_custo: 4, preco_venda: 10, quantidade: 100, ...extra })
    .select("id")
    .single();
  if (error) throw new Error(`Falha ao criar produto de teste: ${error.message}`);
  criados.produtos.push(data.id);
  return data.id;
}

export async function login(usuario, slug, senha = SENHA) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...(slug ? { loja: slug } : {}), identificador: usuario.telefone, senha }),
  });
  if (!r.ok) throw new Error(`Login de teste falhou (${r.status})`);
  return r.headers.getSetCookie()[0].split(";")[0];
}

export const chamar = (cookie, caminho, init = {}) =>
  fetch(`${BASE}${caminho}`, {
    redirect: "manual",
    ...init,
    headers: { ...(cookie ? { cookie } : {}), ...(init.body && typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });

export const enviar = (cookie, caminho, metodo, corpo) => chamar(cookie, caminho, { method: metodo, body: JSON.stringify(corpo) });

// ---------- limpeza (só o que foi criado aqui, por id) ----------
export async function limpar() {
  if (criados.vendas.length) await db.from("vendas").delete().in("id", criados.vendas);
  if (criados.clientes.length) await db.from("clientes").delete().in("id", criados.clientes);
  if (criados.produtos.length) await db.from("produtos").delete().in("id", criados.produtos);
  if (criados.arquivos.length) await db.storage.from("produtos").remove(criados.arquivos);
  // Lojas criadas pelo teste: apagar a loja leva junto categorias, movimentos e auditoria dela (cascata por id)
  if (criados.lojas.length) {
    // usuários criados pela API (onboarding) também são da loja de teste
    for (const u of await todosUsuarios()) if (criados.lojas.includes(u.app_metadata?.tenant_id)) criados.usuarios.push(u.id);
    await db.from("auditoria").delete().in("tenant_id", criados.lojas);
    await db.from("vendas").delete().in("tenant_id", criados.lojas); // antes dos caixas (vendas.caixa_id)
    await db.from("tenants").delete().in("id", criados.lojas);
  }
  for (const id of new Set(criados.usuarios)) await auth(`/admin/users/${id}`, { method: "DELETE" });
}

/** Roda o teste, sempre limpa, compara o banco antes x depois e sai com o código certo. */
export async function executar(principal) {
  const antes = await estadoReal();
  console.log(`Antes: ${antes.produtos} produtos, ${antes.vendas} vendas, ${antes.clientes} clientes, ${antes.usuarios.length} usuários\n`);
  let erro = null;
  try {
    await principal();
  } catch (e) {
    erro = e;
  } finally {
    await limpar();
  }
  const depois = await estadoReal();
  if (erro) console.error(`\nERRO: ${erro.message}${erro.cause ? ` (${erro.cause.code ?? erro.cause.message})` : ""}`);
  const igual = JSON.stringify(antes) === JSON.stringify(depois);
  if (!igual) falhas++;
  console.log(`\nResultado: ${ok} passaram, ${falhas} falharam${erro ? " (interrompido por erro)" : ""}`);
  console.log(`Depois: ${depois.produtos} produtos, ${depois.vendas} vendas, ${depois.clientes} clientes, ${depois.usuarios.length} usuários`);
  console.log(igual ? "Banco idêntico ao de antes (dados reais intactos, testes removidos)" : "ATENÇÃO: o banco não voltou ao estado inicial, confira!");
  process.exit(falhas || erro ? 1 : 0);
}
