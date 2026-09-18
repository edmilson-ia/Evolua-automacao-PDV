// Testes da tarefa "Quem vendeu" (operador em vendas/movimentos, permissões e auditoria).
// Uso (com o servidor rodando):  node --env-file=.env.local scripts/test-quem-vendeu.mjs
// Cria só dados "TESTE" (produto, usuários, vendas) e apaga TUDO por id no final.
// Nunca imprime chaves e nunca mexe em dados reais.
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const TENANT = "00000000-0000-0000-0000-000000000001";
const URL_SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(URL_SB, KEY, { auth: { persistSession: false } });
const SENHA = "TesteSenha#2026";
const sufixo = Date.now().toString().slice(-6);

let ok = 0;
let falhas = 0;
function check(nome, cond, extra = "") {
  if (cond) ok++;
  else falhas++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${nome}${!cond && extra ? `  -> ${extra}` : ""}`);
}

async function estadoReal() {
  const cont = async (t) => (await db.from(t).select("id", { count: "exact", head: true })).count;
  const { data: fantas } = await db.from("produtos").select("id, nome, quantidade, preco_venda").ilike("nome", "fanta%").order("id");
  const users = await fetch(`${URL_SB}/auth/v1/admin/users?per_page=200`, { headers: { apikey: KEY } }).then((r) => r.json());
  return {
    produtos: await cont("produtos"),
    vendas: await cont("vendas"),
    movimentos: await cont("movimentos_estoque"),
    auditoria: await cont("auditoria"),
    usuarios: users.users.map((u) => u.id).sort(),
    fantas: JSON.stringify(fantas),
  };
}

async function criarUsuario(nome, telefone, perfil) {
  const r = await fetch(`${URL_SB}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `${telefone}@tel.evolua.test`,
      password: SENHA,
      email_confirm: true,
      user_metadata: { nome, telefone },
      app_metadata: { perfil },
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Falha ao criar usuário de teste: ${j.msg ?? r.status}`);
  return { id: j.id, nome, telefone };
}

async function login(u) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identificador: u.telefone, senha: SENHA }),
  });
  if (!r.ok) throw new Error(`Login de teste falhou (${r.status})`);
  return r.headers.getSetCookie()[0].split(";")[0];
}

const chamar = (cookie, caminho, init = {}) =>
  fetch(`${BASE}${caminho}`, {
    redirect: "manual",
    ...init,
    headers: { cookie, "Content-Type": "application/json", ...init.headers },
  });

let antes;
const criados = { usuarios: [], vendas: [], produto: null };

async function limpar() {
  // ordem importa: itens_venda referencia produtos; vendas apagam os itens em cascata
  const alvos = [...criados.vendas, ...(criados.produto ? [criados.produto] : [])];
  if (alvos.length) await db.from("auditoria").delete().in("entidade_id", alvos);
  if (criados.vendas.length) await db.from("vendas").delete().in("id", criados.vendas);
  if (criados.produto) await db.from("produtos").delete().eq("id", criados.produto); // movimentos em cascata
  for (const id of criados.usuarios) await fetch(`${URL_SB}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: { apikey: KEY } });
}

async function main() {
  antes = await estadoReal();
  console.log(`Antes: ${antes.produtos} produtos, ${antes.vendas} vendas, ${antes.usuarios.length} usuários\n`);

  const admin = await criarUsuario(`TESTE Admin ${sufixo}`, `1195550${sufixo.slice(0, 4)}`, "admin");
  criados.usuarios.push(admin.id);
  const opA = await criarUsuario(`TESTE Op A ${sufixo}`, `1195551${sufixo.slice(0, 4)}`, "operador");
  criados.usuarios.push(opA.id);
  const opB = await criarUsuario(`TESTE Op B ${sufixo}`, `1195552${sufixo.slice(0, 4)}`, "operador");
  criados.usuarios.push(opB.id);

  const { data: prod, error: errProd } = await db
    .from("produtos")
    .insert({ tenant_id: TENANT, nome: `TESTE produto ${sufixo}`, sku: `TESTE-${sufixo}`, preco_custo: 4, preco_venda: 10, quantidade: 100 })
    .select("id")
    .single();
  if (errProd) throw new Error(`Falha ao criar produto de teste: ${errProd.message}`);
  criados.produto = prod.id;
  const qtdProduto = async () => Number((await db.from("produtos").select("quantidade").eq("id", prod.id).single()).data.quantidade);

  const [cAdmin, cA, cB] = await Promise.all([login(admin), login(opA), login(opB)]);
  const venda = (cookie, extra = {}) =>
    chamar(cookie, "/api/vendas", {
      method: "POST",
      body: JSON.stringify({ itens: [{ produto_id: prod.id, quantidade: 2 }], forma_pagamento: "dinheiro", ...extra }),
    });

  // ---- 1. venda grava o operador da SESSÃO (mesmo que o corpo tente forjar outro) ----
  const rA = await venda(cA, { operador_id: opB.id, operador_nome: "Forjado" });
  const vA = await rA.json();
  check("operador A consegue vender (201)", rA.status === 201, JSON.stringify(vA));
  criados.vendas.push(vA.id);
  check("venda grava operador_id e nome da sessão", vA.operador_id === opA.id && vA.operador_nome === opA.nome);
  check("corpo forjado (operador_id de outro) é ignorado", vA.operador_id !== opB.id && vA.operador_nome !== "Forjado");

  const rB = await venda(cB);
  const vB = await rB.json();
  criados.vendas.push(vB.id);
  check("operador B vende e grava seu operador", rB.status === 201 && vB.operador_id === opB.id);

  const rAdm = await venda(cAdmin);
  const vAdm = await rAdm.json();
  criados.vendas.push(vAdm.id);
  check("admin vende e grava seu operador", rAdm.status === 201 && vAdm.operador_id === admin.id);

  const { data: movsVenda } = await db.from("movimentos_estoque").select("operador_id, operador_nome").eq("venda_id", vA.id);
  check("movimento de estoque da venda herda o operador", movsVenda?.length === 1 && movsVenda[0].operador_id === opA.id);
  check("estoque baixou 6 (3 vendas x 2)", (await qtdProduto()) === 94);

  // ---- 2. operador vê só as próprias vendas; admin vê tudo ----
  const listaA = await (await chamar(cA, "/api/vendas")).json();
  check("GET /api/vendas do operador A só traz vendas dele", listaA.length > 0 && listaA.every((v) => v.operador_id === opA.id), `${listaA.length} linhas`);
  check("operador A não vê a venda do B", !listaA.some((v) => v.id === vB.id));
  const listaAdm = await (await chamar(cAdmin, "/api/vendas")).json();
  check("admin vê as vendas de todos", [vA.id, vB.id, vAdm.id].every((id) => listaAdm.some((v) => v.id === id)));

  const htmlA = await (await chamar(cA, "/pdv/vendas")).text();
  check("página /pdv/vendas do operador A mostra ele e não mostra o B", htmlA.includes(opA.nome) && !htmlA.includes(opB.nome));
  const htmlAdm = await (await chamar(cAdmin, "/pdv/vendas")).text();
  check("página /pdv/vendas do admin mostra os dois operadores", htmlAdm.includes(opA.nome) && htmlAdm.includes(opB.nome));

  // ---- 3. permissões: operador não cancela nem mexe no estoque ----
  const cancelaOp = await chamar(cA, `/api/vendas/${vA.id}/cancelar`, { method: "POST", body: JSON.stringify({ motivo: "teste" }) });
  check("operador NÃO cancela venda (403)", cancelaOp.status === 403, String(cancelaOp.status));
  const movOp = await chamar(cA, "/api/movimentos", { method: "POST", body: JSON.stringify({ produto_id: prod.id, tipo: "entrada", quantidade: 1 }) });
  check("operador NÃO registra movimento de estoque (403)", movOp.status === 403, String(movOp.status));
  const movOpGet = await chamar(cA, "/api/movimentos");
  check("operador NÃO lê movimentos (403)", movOpGet.status === 403, String(movOpGet.status));
  check("estoque intacto após tentativas do operador", (await qtdProduto()) === 94);

  // ---- 4. cancelamento e movimento manual: operador + auditoria ----
  const cancelaAdm = await chamar(cAdmin, `/api/vendas/${vA.id}/cancelar`, { method: "POST", body: JSON.stringify({ motivo: "TESTE cancelamento" }) });
  check("admin cancela venda (200)", cancelaAdm.status === 200, await cancelaAdm.text());
  const { data: vCancel } = await db.from("vendas").select("status, cancelada_por").eq("id", vA.id).single();
  check("venda cancelada guarda quem cancelou", vCancel.status === "cancelada" && vCancel.cancelada_por === admin.nome);
  check("cancelamento devolveu o estoque (96)", (await qtdProduto()) === 96);
  const { data: aud1 } = await db.from("auditoria").select("*").eq("entidade_id", vA.id).eq("acao", "venda_cancelada");
  check(
    "auditoria do cancelamento (quem cancelou, quem vendeu, motivo)",
    aud1?.length === 1 && aud1[0].operador_id === admin.id && aud1[0].detalhe.vendido_por === opA.nome && aud1[0].detalhe.motivo === "TESTE cancelamento",
  );

  const movAdm = await chamar(cAdmin, "/api/movimentos", { method: "POST", body: JSON.stringify({ produto_id: prod.id, tipo: "entrada", quantidade: 5, motivo: "TESTE" }) });
  check("admin registra entrada de estoque (201)", movAdm.status === 201, await movAdm.text());
  const { data: mov } = await db.from("movimentos_estoque").select("operador_id, operador_nome").eq("produto_id", prod.id).eq("motivo", "TESTE").single();
  check("movimento manual grava o operador", mov?.operador_id === admin.id && mov?.operador_nome === admin.nome);
  const { data: aud2 } = await db.from("auditoria").select("*").eq("entidade_id", prod.id).eq("acao", "movimento_estoque");
  check("auditoria do movimento manual", aud2?.length === 1 && aud2[0].operador_id === admin.id && aud2[0].detalhe.tipo === "entrada");
  check("estoque 101 após entrada de 5", (await qtdProduto()) === 101);

  // ---- 5. as funções SQL recusam chamada sem operador ----
  const semOp = await db.rpc("fechar_venda", {
    p_tenant_id: TENANT, p_itens: [{ produto_id: prod.id, quantidade: 1 }], p_forma_pagamento: "dinheiro",
    p_desconto: 0, p_valor_recebido: null, p_operador_id: null, p_operador_nome: null,
  });
  check("fechar_venda sem operador é recusada", semOp.error?.message?.includes("Operador obrigatório") === true, semOp.error?.message);
  check("nada mudou no estoque após a recusa (101)", (await qtdProduto()) === 101);

  // ---- 6. dashboard mostra vendas por operador ----
  const htmlDash = await (await chamar(cAdmin, "/dashboard")).text();
  check("dashboard lista vendas por operador", htmlDash.includes("Vendas por operador") && htmlDash.includes(opB.nome));
}

let erro = null;
try {
  await main();
} catch (e) {
  erro = e;
} finally {
  await limpar();
}
const depois = await estadoReal();
if (erro) console.error(`\nERRO: ${erro.message}`);
console.log(`\nResultado: ${ok} passaram, ${falhas} falharam${erro ? " (interrompido por erro)" : ""}`);
console.log(`Depois: ${depois.produtos} produtos, ${depois.vendas} vendas, ${depois.usuarios.length} usuários`);
const igual = antes && JSON.stringify(antes) === JSON.stringify(depois);
console.log(igual ? "Banco idêntico ao de antes (dados reais intactos, testes removidos)" : "ATENÇÃO: o banco não voltou ao estado inicial, confira!");
if (!igual) falhas++;
process.exit(falhas || erro ? 1 : 0);
