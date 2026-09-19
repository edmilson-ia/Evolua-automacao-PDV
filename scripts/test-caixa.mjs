// Testes da tarefa "Caixa": abertura/fechamento, sangria/suprimento, esperado x contado e isolamento.
// Uso (com o servidor rodando, migration 0008 aplicada):  node --env-file=.env.local scripts/test-caixa.mjs
// Cria lojas/usuários/dados "TESTE", apaga tudo por id no final e compara o banco antes x depois.
import { criarLoja, criarProduto, criarUsuario, login, chamar, enviar, check, executar, criados, db, sufixo } from "./_helpers.mjs";

const json = (r) => r.json().catch(() => null);
const din = (n) => Number(n).toFixed(2);

async function principal() {
  const L = await criarLoja(`teste-cx-${sufixo}`, `TESTE Loja Caixa ${sufixo}`, "#0f766e", { caixa_obrigatorio: true });
  const M = await criarLoja(`teste-cy-${sufixo}`, `TESTE Loja Outra ${sufixo}`, "#be123c");
  const tel = (n) => `1195570${n}${sufixo.slice(0, 3)}`;
  const adminL = await criarUsuario({ nome: `TESTE AdminL ${sufixo}`, telefone: tel(1), perfil: "admin", tenantId: L.id, slug: L.slug });
  const op1 = await criarUsuario({ nome: `TESTE Op1 ${sufixo}`, telefone: tel(2), perfil: "operador", tenantId: L.id, slug: L.slug });
  const op2 = await criarUsuario({ nome: `TESTE Op2 ${sufixo}`, telefone: tel(3), perfil: "operador", tenantId: L.id, slug: L.slug });
  const adminM = await criarUsuario({ nome: `TESTE AdminM ${sufixo}`, telefone: tel(4), perfil: "admin", tenantId: M.id, slug: M.slug });
  const pL = await criarProduto(L.id, `TESTE Produto L ${sufixo}`, `TESTE-L-${sufixo}`, { quantidade: 500 });
  const [cAdmin, c1, c2, cM] = await Promise.all([login(adminL, L.slug), login(op1, L.slug), login(op2, L.slug), login(adminM, M.slug)]);
  const qtdProduto = async () => Number((await db.from("produtos").select("quantidade").eq("id", pL).single()).data.quantidade);
  const vender = async (cookie, forma, qtd = 1) => {
    const r = await enviar(cookie, "/api/vendas", "POST", { itens: [{ produto_id: pL, quantidade: qtd }], forma_pagamento: forma, ...(forma === "dinheiro" ? { valor_recebido: 1000 } : {}) });
    const v = await json(r);
    if (v?.id) criados.vendas.push(v.id);
    return { status: r.status, v };
  };

  console.log("--- Loja com caixa obrigatório: abertura ---");
  const semCaixa = await vender(c1, "dinheiro");
  check("sem caixa aberto a venda é recusada (422)", semCaixa.status === 422 && /Abra o caixa/.test(semCaixa.v?.error ?? ""), JSON.stringify(semCaixa));
  check("GET /api/caixa: obrigatório e sem caixa", await chamar(c1, "/api/caixa").then(json).then((j) => j.obrigatorio === true && j.caixa === null));
  const rAbrir = await enviar(c1, "/api/caixa", "POST", { terminal: "Caixa 1", valor_inicial: 100 });
  const cx1 = (await json(rAbrir))?.id;
  check("operador 1 abre o caixa com R$ 100 (201)", rAbrir.status === 201 && !!cx1);
  check("mesmo operador não abre um segundo caixa (409)", (await enviar(c1, "/api/caixa", "POST", { terminal: "Caixa 9", valor_inicial: 0 })).status === 409);
  const terminalOcupado = await enviar(c2, "/api/caixa", "POST", { terminal: "caixa 1", valor_inicial: 0 });
  check("terminal já ocupado por outro operador é recusado (409, sem diferenciar maiúsculas)", terminalOcupado.status === 409, String(terminalOcupado.status));
  check("valor inicial negativo é recusado (400)", (await enviar(c2, "/api/caixa", "POST", { terminal: "Caixa 2", valor_inicial: -5 })).status === 400);
  check("terminal em branco é recusado (400)", (await enviar(c2, "/api/caixa", "POST", { terminal: "  ", valor_inicial: 0 })).status === 400);
  const rAbrir2 = await enviar(c2, "/api/caixa", "POST", { terminal: "Caixa 2", valor_inicial: 50 });
  const cx2 = (await json(rAbrir2))?.id;
  check("operador 2 abre o próprio caixa em outro terminal (201)", rAbrir2.status === 201 && !!cx2);

  console.log("\n--- Vendas ligadas ao caixa ---");
  const s1 = await vender(c1, "dinheiro", 2); // R$ 20
  const s2 = await vender(c1, "dinheiro", 3); // R$ 30
  const s3 = await vender(c1, "debito", 1); // R$ 10
  const s4 = await vender(c1, "credito", 2); // R$ 20
  const s5 = await vender(c1, "pix", 1); // R$ 10
  const s6 = await vender(c1, "dinheiro", 1); // R$ 10 (será cancelada)
  const sOp2 = await vender(c2, "dinheiro", 1); // R$ 10 no caixa do operador 2
  check("vendas do operador 1 entram (201)", [s1, s2, s3, s4, s5, s6].every((s) => s.status === 201));
  check("venda grava o caixa do operador que vendeu", s1.v.caixa_id === cx1 && sOp2.v.caixa_id === cx2);
  const cancel = await enviar(cAdmin, `/api/vendas/${s6.v.id}/cancelar`, "POST", { motivo: "TESTE cancelada" });
  check("venda cancelada com o caixa ainda aberto (200)", cancel.status === 200);

  console.log("\n--- Sangria e suprimento ---");
  const mov = (cookie, id, corpo) => enviar(cookie, `/api/caixa/${id}/movimentos`, "POST", corpo);
  check("sangria de R$ 30 (201)", (await mov(c1, cx1, { tipo: "sangria", valor: 30, motivo: "Depósito no banco" })).status === 201);
  check("suprimento de R$ 10 (201)", (await mov(c1, cx1, { tipo: "suprimento", valor: 10, motivo: "Reforço de caixa" })).status === 201);
  const grande = await mov(c1, cx1, { tipo: "sangria", valor: 999, motivo: "Muito grande" });
  check("sangria maior que o dinheiro do caixa é recusada (422)", grande.status === 422, `${grande.status} ${JSON.stringify(await json(grande))}`);
  check("valor zero é recusado (400)", (await mov(c1, cx1, { tipo: "sangria", valor: 0, motivo: "Zero" })).status === 400);
  check("motivo curto é recusado (400)", (await mov(c1, cx1, { tipo: "suprimento", valor: 5, motivo: "ab" })).status === 400);
  check("outro operador NÃO movimenta o caixa do colega (403)", (await mov(c2, cx1, { tipo: "suprimento", valor: 5, motivo: "Invasão" })).status === 403);
  check("administrador movimenta qualquer caixa da loja (201)", (await mov(cAdmin, cx1, { tipo: "suprimento", valor: 5, motivo: "Ajuste do admin" })).status === 201);
  check("a loja OUTRA não movimenta caixa de fora (404)", (await mov(cM, cx1, { tipo: "suprimento", valor: 5, motivo: "Invasão" })).status === 404);

  console.log("\n--- O esperado bate com as vendas do banco ---");
  const { data: resumo } = await db.rpc("caixa_resumo", { p_tenant_id: L.id, p_caixa_id: cx1 });
  const { data: vendasBanco } = await db.from("vendas").select("total, forma_pagamento, status").eq("caixa_id", cx1);
  const soma = (forma) => vendasBanco.filter((v) => v.status === "concluida" && v.forma_pagamento === forma).reduce((s, v) => s + Number(v.total), 0);
  check("vendas por forma no resumo = soma das vendas concluídas", din(resumo.vendas.dinheiro) === din(soma("dinheiro")) && din(resumo.vendas.debito) === din(soma("debito")) && din(resumo.vendas.credito) === din(soma("credito")) && din(resumo.vendas.pix) === din(soma("pix")), JSON.stringify(resumo));
  check("dinheiro R$ 50, débito 10, crédito 20, PIX 10 (canceladas fora)", resumo.vendas.dinheiro === 50 && resumo.vendas.debito === 10 && resumo.vendas.credito === 20 && resumo.vendas.pix === 10 && resumo.vendas.qtd === 5);
  check("a venda cancelada aparece à parte (1 venda, R$ 10)", resumo.canceladas.qtd === 1 && resumo.canceladas.total === 10);
  check("dinheiro esperado = 100 + 50 + 15 − 30 = R$ 135", resumo.esperado_dinheiro === 135, String(resumo.esperado_dinheiro));

  console.log("\n--- Fechamento cego ---");
  const htmlOp = await chamar(c1, `/caixa/${cx1}`).then((r) => r.text());
  check("operador com caixa aberto NÃO vê totais nem o esperado", htmlOp.includes("aparecem depois do fechamento") && !htmlOp.includes("Vendas do turno") && !htmlOp.includes("Esperado até agora"));
  const htmlAdmin = await chamar(cAdmin, `/caixa/${cx1}`).then((r) => r.text());
  check("administrador vê o resumo do caixa aberto", htmlAdmin.includes("Vendas do turno") && htmlAdmin.includes("Esperado até agora"));
  check("operador NÃO abre o relatório do caixa do colega (404)", (await chamar(c2, `/caixa/${cx1}`)).status === 404);
  check("a loja OUTRA não abre o relatório (404)", (await chamar(cM, `/caixa/${cx1}`)).status === 404);
  check("lista /caixa do operador 2 não mostra o caixa do operador 1", !(await chamar(c2, "/caixa").then((r) => r.text())).includes("Op1"));
  check("lista /caixa da loja outra não mostra caixas desta loja", !(await chamar(cM, "/caixa").then((r) => r.text())).includes("Caixa 1"));

  console.log("\n--- Fechamento ---");
  const fechar = (cookie, id, contados, extra = {}) => enviar(cookie, `/api/caixa/${id}/fechar`, "POST", { contados, ...extra });
  check("operador NÃO fecha o caixa do colega (403)", (await fechar(c2, cx1, { dinheiro: 135 })).status === 403);
  check("a loja OUTRA não fecha o caixa (404)", (await fechar(cM, cx1, { dinheiro: 135 })).status === 404);
  check("sem o dinheiro contado o fechamento é recusado (400)", (await fechar(c1, cx1, {})).status === 400);
  check("valor contado negativo é recusado (400)", (await fechar(c1, cx1, { dinheiro: -1 })).status === 400);
  const estoqueAntes = await qtdProduto();
  const rFecha = await fechar(c1, cx1, { dinheiro: 130, debito: 10, credito: 25 }, { observacao: "TESTE fechamento" });
  check("operador fecha o próprio caixa: R$ 130 contados (200)", rFecha.status === 200, JSON.stringify(await json(rFecha)));
  const { data: cxFechado } = await db.from("caixas").select("*").eq("id", cx1).single();
  const f = cxFechado.conferencia.formas;
  check("caixa fechado: contado 130, diferença −5", cxFechado.status === "fechado" && Number(cxFechado.valor_contado) === 130 && Number(cxFechado.diferenca) === -5);
  check("conferência: dinheiro esperado 135; débito bateu; crédito +5; PIX não conferido", f.dinheiro.esperado === 135 && f.dinheiro.diferenca === -5 && f.debito.diferenca === 0 && f.credito.diferenca === 5 && f.pix.contado === null && f.pix.diferenca === null, JSON.stringify(f));
  const { data: aud } = await db.from("auditoria").select("acao, detalhe").eq("entidade_id", cx1);
  const acoes = aud.map((a) => a.acao).sort();
  check("auditoria: abertura, sangria, 2 suprimentos e fechamento", ["caixa_aberto", "caixa_fechado", "caixa_sangria", "caixa_suprimento", "caixa_suprimento"].every((a, i) => acoes[i] === a), acoes.join(","));
  check("auditoria do fechamento guarda a diferença (−5)", aud.find((a) => a.acao === "caixa_fechado").detalhe.diferenca_dinheiro === -5);
  check("fechar duas vezes é recusado (409)", (await fechar(c1, cx1, { dinheiro: 135 })).status === 409);
  check("caixa fechado não aceita sangria (422)", (await mov(c1, cx1, { tipo: "sangria", valor: 1, motivo: "Depois de fechado" })).status === 422);
  const relFechado = await chamar(c1, `/caixa/${cx1}`).then((r) => r.text());
  check("relatório fechado mostra conferência, diferença e 'não conferido'", relFechado.includes("Conferência") && relFechado.includes("Bateu") && relFechado.includes("não conferido"));

  console.log("\n--- Depois de fechar ---");
  const depois = await vender(c1, "dinheiro");
  check("sem caixa aberto de novo, a venda é recusada (422)", depois.status === 422 && /Abra o caixa/.test(depois.v?.error ?? ""));
  const cancelaFechado = await enviar(cAdmin, `/api/vendas/${s3.v.id}/cancelar`, "POST", { motivo: "TESTE caixa fechado" });
  check("venda de caixa fechado NÃO pode ser cancelada (409)", cancelaFechado.status === 409 && /caixa já fechado/.test((await json(cancelaFechado))?.error ?? ""));
  const { data: s3Banco } = await db.from("vendas").select("status").eq("id", s3.v.id).single();
  check("a venda continua concluída e o estoque não voltou", s3Banco.status === "concluida" && (await qtdProduto()) === estoqueAntes);
  const rAdminFecha = await fechar(cAdmin, cx2, { dinheiro: 60, debito: null, credito: null, pix: null });
  check("administrador fecha o caixa de um operador (200): 50 + 10 = R$ 60 bateu", rAdminFecha.status === 200);
  const { data: cx2Banco } = await db.from("caixas").select("diferenca, fechado_por_nome").eq("id", cx2).single();
  check("fechamento pelo admin: diferença 0 e registra quem fechou", Number(cx2Banco.diferenca) === 0 && cx2Banco.fechado_por_nome === adminL.nome);
  const reabre = await enviar(c1, "/api/caixa", "POST", { terminal: "Caixa 1", valor_inicial: 20 });
  const cx3 = (await json(reabre))?.id;
  check("o terminal e o operador podem abrir um caixa novo depois de fechar (201)", reabre.status === 201 && !!cx3);

  console.log("\n--- Vendas e fechamento ao mesmo tempo (nenhuma venda pode escapar do relatório) ---");
  const cx4 = (await json(await enviar(c2, "/api/caixa", "POST", { terminal: "Caixa 4", valor_inicial: 0 })))?.id;
  const disparos = Array.from({ length: 10 }, () => vender(c2, "dinheiro"));
  const fechamento = fechar(cAdmin, cx4, { dinheiro: 0 });
  const resultados = await Promise.all([...disparos, fechamento]);
  const vendasOk = resultados.slice(0, 10).filter((r) => r.status === 201).length;
  const vendasRecusadas = resultados.slice(0, 10).filter((r) => r.status === 422 && /Abra o caixa/.test(r.v?.error ?? "")).length;
  const { data: cx4Banco } = await db.from("caixas").select("status, conferencia").eq("id", cx4).single();
  const { count: naoContadas } = await db.from("vendas").select("id", { count: "exact", head: true }).eq("caixa_id", cx4).eq("status", "concluida");
  check("o caixa fechou no meio das vendas", (await resultados[10]).status === 200 && cx4Banco.status === "fechado");
  check(`toda venda foi aceita (${vendasOk}) ou recusada por caixa fechado (${vendasRecusadas}), nenhuma outra falha`, vendasOk + vendasRecusadas === 10);
  check("as vendas ligadas ao caixa são EXATAMENTE as que entraram no relatório fechado", naoContadas === cx4Banco.conferencia.resumo.vendas.qtd, `${naoContadas} x ${cx4Banco.conferencia.resumo.vendas.qtd}`);

  console.log("\n--- Caixa opcional (loja com a opção desligada) ---");
  await enviar(cAdmin, "/api/configuracoes/pagamentos", "PUT", { pix_chave: "", pix_cidade: "", taxa_debito: 2, taxa_credito: 3.5, caixa_obrigatorio: false });
  check("GET /api/caixa mostra que não é obrigatório", await chamar(c1, "/api/caixa").then(json).then((j) => j.obrigatorio === false));
  const livre = await vender(c2, "dinheiro"); // op2 não tem caixa aberto
  check("sem caixa aberto a venda passa (201) e fica sem caixa", livre.status === 201 && livre.v.caixa_id === null, JSON.stringify(livre));
  const comCaixa = await vender(c1, "dinheiro"); // op1 tem o caixa cx3 aberto
  check("com caixa aberto a venda é ligada a ele mesmo sendo opcional", comCaixa.status === 201 && comCaixa.v.caixa_id === cx3);
  check("operador NÃO altera a regra do caixa (403)", (await enviar(c1, "/api/configuracoes/pagamentos", "PUT", { pix_chave: "", pix_cidade: "", taxa_debito: 2, taxa_credito: 3.5, caixa_obrigatorio: true })).status === 403);
  check("a regra da outra loja não mudou", (await db.from("tenants").select("caixa_obrigatorio").eq("id", M.id).single()).data.caixa_obrigatorio === false);
}

await executar(principal);
