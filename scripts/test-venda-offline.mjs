// Testes da tarefa "Venda sem internet" (lado do servidor): chave de idempotência, venda offline com estoque
// negativo, hora real da venda, caixa, operador e isolamento entre lojas. A fila e o envio no navegador
// (IndexedDB) NÃO são cobertos aqui: ver o roteiro manual no CLAUDE.md/README.
// Uso (servidor rodando, migration 0010 aplicada):  node --env-file=.env.local scripts/test-venda-offline.mjs
// Cria lojas/usuários/dados "TESTE", apaga tudo por id no final e compara o banco antes x depois.
import { criarLoja, criarProduto, criarUsuario, login, chamar, enviar, check, executar, criados, db, sufixo } from "./_helpers.mjs";

const json = (r) => r.json().catch(() => null);
const uuid = () => crypto.randomUUID();
const dia = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

async function principal() {
  const A = await criarLoja(`teste-oa-${sufixo}`, `TESTE Loja Offline A ${sufixo}`, "#0f766e");
  const B = await criarLoja(`teste-ob-${sufixo}`, `TESTE Loja Offline B ${sufixo}`, "#be123c");
  const C = await criarLoja(`teste-oc-${sufixo}`, `TESTE Loja Offline Caixa ${sufixo}`, "#4338ca", { caixa_obrigatorio: true });
  const tel = (n) => `1195570${n}${sufixo.slice(0, 3)}`;
  const adminA = await criarUsuario({ nome: `TESTE AdminA ${sufixo}`, telefone: tel(1), perfil: "admin", tenantId: A.id, slug: A.slug });
  const op1 = await criarUsuario({ nome: `TESTE Op1 ${sufixo}`, telefone: tel(2), perfil: "operador", tenantId: A.id, slug: A.slug });
  const op2 = await criarUsuario({ nome: `TESTE Op2 ${sufixo}`, telefone: tel(3), perfil: "operador", tenantId: A.id, slug: A.slug });
  const adminB = await criarUsuario({ nome: `TESTE AdminB ${sufixo}`, telefone: tel(4), perfil: "admin", tenantId: B.id, slug: B.slug });
  const opC = await criarUsuario({ nome: `TESTE OpC ${sufixo}`, telefone: tel(5), perfil: "operador", tenantId: C.id, slug: C.slug });
  const [cAdmin, c1, c2, cB, cC] = await Promise.all([login(adminA, A.slug), login(op1, A.slug), login(op2, A.slug), login(adminB, B.slug), login(opC, C.slug)]);

  const p = await criarProduto(A.id, `TESTE Off Produto ${sufixo}`, `TESTE-OFF-${sufixo}`, { quantidade: 10, preco_venda: 10 });
  const pBaixo = await criarProduto(A.id, `TESTE Off Baixo ${sufixo}`, `TESTE-OFB-${sufixo}`, { quantidade: 1, preco_venda: 20 });
  const pB = await criarProduto(B.id, `TESTE Off Produto B ${sufixo}`, `TESTE-OFP-${sufixo}`, { quantidade: 50, preco_venda: 7 });
  const pC = await criarProduto(C.id, `TESTE Off Produto C ${sufixo}`, `TESTE-OFC-${sufixo}`, { quantidade: 5, preco_venda: 5 });

  const estoque = async (id) => Number((await db.from("produtos").select("quantidade").eq("id", id).single()).data.quantidade);
  const vendasComChave = async (tenant, chave) => (await db.from("vendas").select("id, offline, operador_id, criado_em, caixa_id, sincronizada_em").eq("tenant_id", tenant).eq("chave_idempotencia", chave)).data ?? [];
  const movDaVenda = async (id) => (await db.from("movimentos_estoque").select("motivo, criado_em, quantidade").eq("venda_id", id)).data ?? [];
  const vender = async (cookie, produto, quantidade, extra = {}) => {
    const r = await enviar(cookie, "/api/vendas", "POST", { itens: [{ produto_id: produto, quantidade }], forma_pagamento: "dinheiro", valor_recebido: 1000, ...extra });
    const v = await json(r);
    if (v?.id) criados.vendas.push(v.id);
    return { status: r.status, v };
  };

  console.log("--- Compatibilidade: venda normal sem os campos novos ---");
  const normal = await vender(c1, p, 1);
  check("venda online sem chave continua funcionando (201)", normal.status === 201 && normal.v?.offline === false, JSON.stringify(normal.v)?.slice(0, 120));
  check("estoque baixou 1 (10 → 9)", (await estoque(p)) === 9);

  console.log("\n--- Chave de idempotência: a mesma venda enviada de novo não duplica ---");
  const k1 = uuid();
  const a = await vender(c1, p, 2, { chave: k1 });
  const b = await vender(c1, p, 2, { chave: k1 });
  check("1º envio cria a venda (201)", a.status === 201 && !!a.v?.id);
  check("2º envio com a MESMA chave devolve a mesma venda (201, mesmo id)", b.status === 201 && b.v?.id === a.v?.id, JSON.stringify(b));
  check("estoque baixou UMA vez só (9 → 7)", (await estoque(p)) === 7);
  check("existe 1 venda e 1 movimento para a chave", (await vendasComChave(A.id, k1)).length === 1 && (await movDaVenda(a.v.id)).length === 1);

  const k2 = uuid();
  const rajada = await Promise.all(Array.from({ length: 6 }, () => vender(c1, p, 1, { chave: k2 })));
  const ids = new Set(rajada.map((r) => r.v?.id));
  check("6 envios SIMULTÂNEOS com a mesma chave viram 1 venda (todos 201, mesmo id)", rajada.every((r) => r.status === 201) && ids.size === 1, JSON.stringify(rajada.map((r) => r.status)));
  check("estoque baixou só 1 (7 → 6) e há 1 venda para a chave", (await estoque(p)) === 6 && (await vendasComChave(A.id, k2)).length === 1);

  const kConflito = uuid();
  await vender(c1, p, 1, { chave: kConflito });
  const outroOp = await vender(c2, p, 1, { chave: kConflito });
  check("chave já usada por OUTRO operador é recusada (422) e nada é gravado", outroOp.status === 422 && /outro operador/.test(outroOp.v?.error ?? "") && (await vendasComChave(A.id, kConflito)).length === 1);

  const kB = uuid();
  const vB = await vender(cB, pB, 1, { chave: kB });
  const vB2 = await vender(cB, pB, 1, { chave: kB });
  const kMesma = uuid();
  const daA = await vender(c1, p, 1, { chave: kMesma });
  const daB = await vender(cB, pB, 1, { chave: kMesma });
  check("a mesma chave em OUTRA loja é outra venda (chave é única por loja)", daA.status === 201 && daB.status === 201 && daA.v.id !== daB.v.id);
  check("reenvio na loja B também não duplica", vB.v?.id === vB2.v?.id);
  check("chave que não é uuid é recusada (400)", (await vender(c1, p, 1, { chave: "abc" })).status === 400);

  console.log("\n--- Venda offline com estoque insuficiente: aceita e deixa negativo ---");
  const antes = await estoque(pBaixo);
  const semSinal = await vender(c1, pBaixo, 3);
  check("SEM o sinal offline, estoque insuficiente continua recusando (422)", semSinal.status === 422 && /Estoque insuficiente/.test(semSinal.v?.error ?? "") && (await estoque(pBaixo)) === antes);
  const kOff = uuid();
  const off = await vender(c1, pBaixo, 3, { chave: kOff, offline: true });
  check("COM o sinal offline a venda é aceita (201) e marcada offline", off.status === 201 && off.v?.offline === true, JSON.stringify(off));
  check("estoque ficou negativo (1 - 3 = -2)", (await estoque(pBaixo)) === -2);
  const linha = (await vendasComChave(A.id, kOff))[0];
  check("venda guarda offline=true e a hora do envio (sincronizada_em)", linha?.offline === true && !!linha?.sincronizada_em);
  const mov = await movDaVenda(off.v.id);
  check("movimento de estoque traz o motivo 'offline'", mov.length === 1 && /offline/.test(mov[0].motivo));
  const aud = (await db.from("auditoria").select("detalhe, operador_id").eq("tenant_id", A.id).eq("acao", "venda_offline").eq("entidade_id", off.v.id)).data ?? [];
  check("auditoria registra a venda offline com o produto que ficou sem estoque", aud.length === 1 && aud[0].detalhe?.estoque_negativo?.[0]?.vendido === 3 && aud[0].operador_id === op1.id, JSON.stringify(aud));
  check("o operador é o da SESSÃO (não vem do corpo)", linha?.operador_id === op1.id);

  const cancel = await enviar(cAdmin, `/api/vendas/${off.v.id}/cancelar`, "POST", { motivo: "TESTE cancelar venda offline" });
  check("admin cancela a venda offline e o estoque volta (-2 → 1)", cancel.status === 200 && (await estoque(pBaixo)) === 1, `${cancel.status} ${await estoque(pBaixo)}`);

  console.log("\n--- Hora real da venda ---");
  const duasHoras = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const kHora = uuid();
  const vHora = await vender(c1, p, 1, { chave: kHora, offline: true, criado_em: duasHoras });
  const linhaHora = (await vendasComChave(A.id, kHora))[0];
  check("offline: criado_em da venda é o da hora real informada", vHora.status === 201 && Math.abs(new Date(linhaHora.criado_em) - new Date(duasHoras)) < 1000, linhaHora?.criado_em);
  const movHora = await movDaVenda(vHora.v.id);
  check("o movimento de estoque usa a mesma hora real", Math.abs(new Date(movHora[0].criado_em) - new Date(duasHoras)) < 1000);
  const dias = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  const kDias = uuid();
  const vDias = await vender(c1, p, 1, { chave: kDias, offline: true, criado_em: dias });
  const doDia = await json(await chamar(c1, `/api/vendas?data=${dia(dias)}`));
  check("venda de 2 dias atrás aparece no histórico DAQUELE dia", vDias.status === 201 && Array.isArray(doDia) && doDia.some((x) => x.id === vDias.v.id));
  check("mais de 7 dias atrás é recusado (422)", (await vender(c1, p, 1, { chave: uuid(), offline: true, criado_em: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString() })).status === 422);
  check("hora no futuro (10 min) é recusada (422)", (await vender(c1, p, 1, { chave: uuid(), offline: true, criado_em: new Date(Date.now() + 10 * 60 * 1000).toISOString() })).status === 422);
  const kIgn = uuid();
  const vIgn = await vender(c1, p, 1, { chave: kIgn, criado_em: dias });
  const linhaIgn = (await vendasComChave(A.id, kIgn))[0];
  check("SEM o sinal offline o criado_em enviado é ignorado (vale a hora do servidor)", vIgn.status === 201 && Math.abs(new Date(linhaIgn.criado_em) - Date.now()) < 60_000);
  check("criado_em fora do formato é recusado (400)", (await vender(c1, p, 1, { chave: uuid(), offline: true, criado_em: "ontem" })).status === 400);

  console.log("\n--- Isolamento entre lojas ---");
  const kIso = uuid();
  const iso = await vender(c1, pB, 1, { chave: kIso, offline: true });
  check("produto de OUTRA loja não pode ser vendido, nem offline (422)", iso.status === 422 && /Produto não encontrado/.test(iso.v?.error ?? ""));
  check("nada foi gravado (a venda inteira é desfeita) e o estoque da loja B não mudou", (await vendasComChave(A.id, kIso)).length === 0 && (await estoque(pB)) === 48, `${await estoque(pB)}`);

  console.log("\n--- Caixa obrigatório ---");
  const kCx = uuid();
  const semCaixa = await vender(cC, pC, 1, { chave: kCx, offline: true });
  check("venda offline sem caixa aberto (loja com caixa obrigatório) fica recusada (422, 'Abra o caixa')", semCaixa.status === 422 && /Abra o caixa/.test(semCaixa.v?.error ?? "") && (await vendasComChave(C.id, kCx)).length === 0);
  const abriu = await enviar(cC, "/api/caixa", "POST", { terminal: "Caixa TESTE", valor_inicial: 0 });
  const caixaId = (await json(abriu))?.id;
  check("operador abre o caixa (201)", abriu.status === 201 && !!caixaId);
  const comCaixa = await vender(cC, pC, 1, { chave: kCx, offline: true });
  const linhaCx = (await vendasComChave(C.id, kCx))[0];
  check("com o caixa aberto, o MESMO reenvio agora entra e liga ao caixa", comCaixa.status === 201 && linhaCx?.caixa_id === caixaId, JSON.stringify(linhaCx));
  check("estoque da loja do caixa baixou 1 (5 → 4)", (await estoque(pC)) === 4);
}

await executar(principal);
