// Testes da exclusão em massa de produtos (POST /api/produtos/excluir + seleção na tela do Estoque):
// permissões, isolamento entre lojas, validação, exclusão lógica (venda e histórico ficam), auditoria.
// Uso (servidor rodando): node --env-file=.env.local scripts/test-excluir-selecionados.mjs
// Cria lojas/usuários/dados "TESTE", apaga tudo por id e compara o banco antes x depois.
import { criarLoja, criarProduto, criarUsuario, login, chamar, enviar, check, executar, criados, db, sufixo } from "./_helpers.mjs";

const json = (r) => r.json().catch(() => null);

async function principal() {
  const A = await criarLoja(`teste-xa-${sufixo}`, `TESTE Loja Excluir A ${sufixo}`, "#0f766e");
  const B = await criarLoja(`teste-xb-${sufixo}`, `TESTE Loja Excluir B ${sufixo}`, "#be123c");
  const tel = (n) => `1195540${n}${sufixo.slice(0, 3)}`;
  const adminA = await criarUsuario({ nome: `TESTE AdminA ${sufixo}`, telefone: tel(1), perfil: "admin", tenantId: A.id, slug: A.slug });
  const opA = await criarUsuario({ nome: `TESTE OpA ${sufixo}`, telefone: tel(2), perfil: "operador", tenantId: A.id, slug: A.slug });
  const adminB = await criarUsuario({ nome: `TESTE AdminB ${sufixo}`, telefone: tel(3), perfil: "admin", tenantId: B.id, slug: B.slug });
  const [cA, cOp, cB] = await Promise.all([login(adminA, A.slug), login(opA, A.slug), login(adminB, B.slug)]);

  const zeros = [];
  for (let i = 1; i <= 5; i++) zeros.push(await criarProduto(A.id, `TESTE Zero ${i} ${sufixo}`, `TESTE-Z${i}-${sufixo}`, { quantidade: 0 }));
  const comEstoque = await criarProduto(A.id, `TESTE Com Estoque ${sufixo}`, `TESTE-CE-${sufixo}`, { quantidade: 7 });
  const daB = await criarProduto(B.id, `TESTE Zero da B ${sufixo}`, `TESTE-ZB-${sufixo}`, { quantidade: 0 });
  const ativo = async (id) => (await db.from("produtos").select("ativo").eq("id", id).single()).data.ativo;
  const excluir = (cookie, ids) => enviar(cookie, "/api/produtos/excluir", "POST", { ids });

  console.log("--- Acesso e validação ---");
  check("sem login não exclui", (await excluir(null, [zeros[0]])).status !== 200);
  check("operador não exclui (403)", (await excluir(cOp, [zeros[0]])).status === 403 && (await ativo(zeros[0])) === true);
  check("lista vazia é recusada (400)", (await excluir(cA, [])).status === 400);
  check("id que não é uuid é recusado (400)", (await excluir(cA, ["x"])).status === 400);
  check("mais de 1000 ids é recusado (400)", (await excluir(cA, Array.from({ length: 1001 }, () => zeros[0]))).status === 400);
  check("corpo sem 'ids' é recusado (400)", (await enviar(cA, "/api/produtos/excluir", "POST", {})).status === 400);

  console.log("\n--- Isolamento entre lojas ---");
  const alheio = await json(await excluir(cA, [daB]));
  check("admin da A não exclui produto da B (0 excluídos, 1 ignorado)", alheio?.excluidos === 0 && alheio?.ignorados === 1 && (await ativo(daB)) === true, JSON.stringify(alheio));
  const deOutraLoja = await json(await excluir(cB, [zeros[4]]));
  check("admin da B não exclui produto da A", deOutraLoja?.excluidos === 0 && (await ativo(zeros[4])) === true, JSON.stringify(deOutraLoja));
  const misto = await json(await excluir(cA, [zeros[0], daB]));
  check("lote misto: só o da própria loja é excluído", misto?.excluidos === 1 && (await ativo(zeros[0])) === false && (await ativo(daB)) === true, JSON.stringify(misto));

  console.log("\n--- Exclusão em massa ---");
  const lote = await json(await excluir(cA, [zeros[1], zeros[2], zeros[3], zeros[1]]));
  check("exclui vários de uma vez (ids repetidos contam uma vez)", lote?.excluidos === 3 && (await ativo(zeros[1])) === false && (await ativo(zeros[2])) === false && (await ativo(zeros[3])) === false, JSON.stringify(lote));
  check("produto que NÃO foi selecionado continua (com estoque e zero restante)", (await ativo(comEstoque)) === true && (await ativo(zeros[4])) === true);
  const repetir = await json(await excluir(cA, [zeros[1]]));
  check("excluir de novo o mesmo produto não conta (0 excluídos)", repetir?.excluidos === 0 && repetir?.ignorados === 1);
  const linha = (await db.from("produtos").select("id, quantidade").eq("id", zeros[1]).single()).data;
  check("é exclusão LÓGICA: a linha continua no banco (histórico preservado)", linha?.id === zeros[1]);

  const aud = (await db.from("auditoria").select("detalhe, operador_id").eq("tenant_id", A.id).eq("acao", "exclusao_em_massa")).data ?? [];
  check("auditoria registra quem excluiu e os ids (dá para desfazer)", aud.length === 2 && aud.every((a) => a.operador_id === adminA.id) && aud.some((a) => a.detalhe?.ids?.includes(zeros[2])), JSON.stringify(aud)?.slice(0, 200));

  const vencidos = await json(await excluir(cA, zeros.slice(4)));
  check("limpa o último com estoque 0", vencidos?.excluidos === 1);

  console.log("\n--- Tela do Estoque ---");
  const r = await chamar(cA, "/estoque");
  const html = r.status === 200 ? await r.text() : "";
  check("Estoque mostra os botões de seleção em massa", r.status === 200 && /Selecionar todos com estoque 0/.test(html) && /Selecionar todos os produtos da lista/.test(html));
  check("a lista traz uma caixa de seleção por produto", html.includes(`Selecionar TESTE Com Estoque ${sufixo}`));
  check("produto excluído não aparece mais na lista", !html.includes(`TESTE Zero 2 ${sufixo}`));
  check("operador não abre o Estoque (redireciona)", (await chamar(cOp, "/estoque")).status !== 200);
  void criados;
}

await executar(principal);
