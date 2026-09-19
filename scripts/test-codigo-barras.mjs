// Testes da tarefa "Impressora e leitor": código de barras (dígito verificador, único por loja, busca, importação)
// e largura do cupom por loja (58/80 mm). Uso (servidor rodando, migration 0009 aplicada):
//   node --env-file=.env.local scripts/test-codigo-barras.mjs
// Cria lojas/usuários/dados "TESTE", apaga tudo por id no final e compara o banco antes x depois.
import { criarLoja, criarUsuario, login, chamar, enviar, check, executar, db, sufixo } from "./_helpers.mjs";

const json = (r) => r.json().catch(() => null);
const EAN13 = "7894900011517";
const EAN8 = "96385074";
const UPCA = "036000291452";

async function principal() {
  const A = await criarLoja(`teste-ba-${sufixo}`, `TESTE Loja Barras A ${sufixo}`, "#0f766e");
  const B = await criarLoja(`teste-bb-${sufixo}`, `TESTE Loja Barras B ${sufixo}`, "#be123c");
  const tel = (n) => `1195590${n}${sufixo.slice(0, 3)}`;
  const adminA = await criarUsuario({ nome: `TESTE AdminA ${sufixo}`, telefone: tel(1), perfil: "admin", tenantId: A.id, slug: A.slug });
  const opA = await criarUsuario({ nome: `TESTE OpA ${sufixo}`, telefone: tel(2), perfil: "operador", tenantId: A.id, slug: A.slug });
  const adminB = await criarUsuario({ nome: `TESTE AdminB ${sufixo}`, telefone: tel(3), perfil: "admin", tenantId: B.id, slug: B.slug });
  const [cA, cOp, cB] = await Promise.all([login(adminA, A.slug), login(opA, A.slug), login(adminB, B.slug)]);
  const sku = (n) => `TESTE-BAR-${sufixo}-${n}`;
  const novo = (cookie, n, extra = {}) =>
    enviar(cookie, "/api/produtos", "POST", { nome: `TESTE Barras ${n}`, sku: sku(n), preco_custo: 4, preco_venda: 10, quantidade: 5, ...extra });

  console.log("--- Validação do código de barras ---");
  const semCodigo = await novo(cA, 1);
  check("produto sem código de barras continua sendo criado (201)", semCodigo.status === 201 && (await json(semCodigo)).codigo_barras == null);
  const ok13 = await novo(cA, 2, { codigo_barras: EAN13 });
  const p2 = await json(ok13);
  check("EAN-13 válido é aceito (201)", ok13.status === 201 && p2.codigo_barras === EAN13);
  const ruim13 = await novo(cA, 3, { codigo_barras: "7894900011518" });
  check("EAN-13 com dígito verificador errado é recusado (400)", ruim13.status === 400 && /dígito verificador/.test((await json(ruim13))?.error ?? ""));
  check("EAN-8 válido é aceito", (await novo(cA, 4, { codigo_barras: EAN8 })).status === 201);
  check("UPC-A (12 dígitos) válido é aceito", (await novo(cA, 5, { codigo_barras: UPCA })).status === 201);
  check("UPC-A com dígito errado é recusado (400)", (await novo(cA, 6, { codigo_barras: "036000291453" })).status === 400);
  check("código interno com letras (sem padrão EAN) é aceito", (await novo(cA, 7, { codigo_barras: "INT-0001" })).status === 201);
  check("código com caracteres inválidos é recusado (400)", (await novo(cA, 8, { codigo_barras: "abc/123" })).status === 400);
  check("código longo demais (31) é recusado (400)", (await novo(cA, 9, { codigo_barras: "A".repeat(31) })).status === 400);
  check("código em branco vira 'sem código' (201)", (await novo(cA, 10, { codigo_barras: "   " })).status === 201);

  console.log("\n--- Único por loja ---");
  const dup = await novo(cA, 11, { codigo_barras: EAN13 });
  check("mesmo código na mesma loja é recusado (409)", dup.status === 409 && /Código de barras já cadastrado/.test((await json(dup))?.error ?? ""));
  const comEspaco = await novo(cA, 12, { codigo_barras: "789 4900 011517" });
  check("espaços são ignorados (mesmo código) → 409", comEspaco.status === 409);
  const naB = await novo(cB, 13, { codigo_barras: EAN13 });
  check("o mesmo código em OUTRA loja é permitido (201)", naB.status === 201);
  const pB = await json(naB);
  check("produto da loja A não foi afetado pelo da B", (await db.from("produtos").select("id").eq("tenant_id", A.id).eq("codigo_barras", EAN13)).data?.length === 1);
  const outro = await json(await novo(cA, 14, { codigo_barras: "5901234123457" }));
  const putMesmo = await enviar(cA, `/api/produtos/${p2.id}`, "PUT", { nome: p2.nome, sku: p2.sku, codigo_barras: EAN13, preco_custo: 4, preco_venda: 10 });
  check("editar um produto mantendo o próprio código funciona (200)", putMesmo.status === 200);
  const putConflito = await enviar(cA, `/api/produtos/${outro.id}`, "PUT", { nome: outro.nome, sku: outro.sku, codigo_barras: EAN13, preco_custo: 4, preco_venda: 10 });
  check("editar para o código de OUTRO produto é recusado (409)", putConflito.status === 409);
  check("excluir o produto libera o código", (await chamar(cA, `/api/produtos/${p2.id}`, { method: "DELETE" })).status === 204 && (await novo(cA, 15, { codigo_barras: EAN13 })).status === 201);

  console.log("\n--- Busca (PDV e Estoque) ---");
  const achaOp = await json(await chamar(cOp, `/api/produtos?q=${EAN13}`));
  check("operador acha o produto pelo código de barras (bipe)", achaOp?.length === 1 && achaOp[0].codigo_barras === EAN13 && achaOp[0].sku === sku(15), JSON.stringify(achaOp)?.slice(0, 200));
  check("operador NÃO recebe preço de custo", achaOp?.[0] && !("preco_custo" in achaOp[0]));
  const achaParcial = await json(await chamar(cA, "/api/produtos?q=01234123"));
  check("busca parcial do admin também acha por código", Array.isArray(achaParcial) && achaParcial.some((p) => p.codigo_barras === "5901234123457"));
  const achaB = await json(await chamar(cB, `/api/produtos?q=${EAN13}`));
  check("a loja B só enxerga o produto dela com esse código", achaB?.length === 1 && achaB[0].id === pB.id);
  const est = await chamar(cA, `/estoque?q=${EAN13}`);
  check("página de Estoque busca por código de barras", est.status === 200 && (await est.text()).includes(sku(15)));

  console.log("\n--- Importação de planilha com código de barras ---");
  const csv = Buffer.from(
    [
      "sku;nome;ean",
      `${sku(20)};TESTE Imp Valido;7891000100103`,
      `${sku(21)};TESTE Imp Digito Ruim;7891000100104`,
      `${sku(22)};TESTE Imp Repetido no Arquivo;7891000100103`,
      `${sku(23)};TESTE Imp Ja Existe;5901234123457`,
      `${sku(15)};TESTE Barras 15 Atualizado;${EAN13}`,
      `${sku(24)};TESTE Imp Sem Codigo;`,
    ].join("\r\n"),
  );
  const imp = async (modo, mapa) => {
    const form = new FormData();
    form.set("arquivo", new File([csv], "barras.csv"));
    form.set("modo", modo);
    if (mapa) form.set("mapeamento", JSON.stringify(mapa));
    const r = await chamar(cA, "/api/produtos/importar", { method: "POST", body: form });
    return { status: r.status, j: await json(r) };
  };
  const lido = await imp("ler");
  check("coluna 'ean' é reconhecida como código de barras", lido.j?.sugestao?.codigo_barras === 2, JSON.stringify(lido.j?.sugestao));
  const previa = await imp("previa", lido.j.sugestao);
  const err = (l) => previa.j?.erros?.find((e) => e.linha === l)?.erro ?? "";
  check("prévia: dígito verificador inválido vira erro (linha 3)", /dígito verificador/.test(err(3)), err(3));
  check("prévia: código repetido no arquivo vira erro (linha 4)", /repetido.*linha 2/.test(err(4)), err(4));
  check("prévia: código que já é de outro produto vira erro (linha 5)", /já usado por/.test(err(5)), err(5));
  check("prévia: o próprio produto (mesmo SKU) mantém o código sem erro; total 3 erros", previa.j?.totais?.erros === 3 && previa.j?.totais?.atualizar === 1 && previa.j?.totais?.criar === 2, JSON.stringify(previa.j?.totais));
  const conf = await imp("confirmar", lido.j.sugestao);
  check("confirmar: 2 criados e 1 atualizado", conf.j?.criados === 2 && conf.j?.atualizados === 1, JSON.stringify(conf.j));
  const gravado = (await db.from("produtos").select("sku, codigo_barras").eq("tenant_id", A.id).in("sku", [sku(20), sku(24), sku(15)])).data ?? [];
  const cod = (n) => gravado.find((p) => p.sku === sku(n))?.codigo_barras;
  check("códigos gravados: válido entrou, linha sem código ficou vazia, atualizado manteve", cod(20) === "7891000100103" && cod(24) == null && cod(15) === EAN13, JSON.stringify(gravado));

  console.log("\n--- Largura do cupom por loja ---");
  const larguraDe = async (id) => (await db.from("tenants").select("largura_cupom").eq("id", id).single()).data.largura_cupom;
  check("padrão é 80 mm", (await larguraDe(A.id)) === 80 && (await larguraDe(B.id)) === 80);
  check("operador não muda a largura (403)", (await enviar(cOp, "/api/configuracoes/impressao", "PUT", { largura_cupom: 58 })).status === 403);
  check("admin muda para 58 mm", (await enviar(cA, "/api/configuracoes/impressao", "PUT", { largura_cupom: 58 })).status === 200 && (await larguraDe(A.id)) === 58);
  check("a outra loja continua em 80 mm (isolamento)", (await larguraDe(B.id)) === 80);
  check("largura inválida é recusada (400)", (await enviar(cA, "/api/configuracoes/impressao", "PUT", { largura_cupom: 60 })).status === 400 && (await larguraDe(A.id)) === 58);
  check("sem login não muda a largura", (await enviar(null, "/api/configuracoes/impressao", "PUT", { largura_cupom: 58 })).status !== 200);
  const pagina = await chamar(cA, "/configuracoes/impressao");
  const html = pagina.status === 200 ? await pagina.text() : "";
  check("tela Configurações → Impressão abre para o admin", pagina.status === 200 && /Largura do papel/.test(html) && /Imprimir cupom de teste/.test(html));
  check("operador não abre a tela de Impressão (redireciona)", (await chamar(cOp, "/configuracoes/impressao")).status !== 200);
  const pdv = await chamar(cOp, "/pdv");
  check("o PDV do operador continua abrindo com a largura configurada", pdv.status === 200);
}

await executar(principal);
