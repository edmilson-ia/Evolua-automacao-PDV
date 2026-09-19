// Testes da tarefa "Importar produtos por planilha": CSV (UTF-8/ISO-8859-1) e XLSX, prévia sem gravar, cria/atualiza/reativa
// por SKU, erros por linha, categorias, estoque como movimento, limites e isolamento entre lojas.
// Uso (com o servidor rodando):  node --env-file=.env.local scripts/test-importar.mjs
// Cria lojas/usuários/dados "TESTE", apaga tudo por id no final e compara o banco antes x depois.
import ExcelJS from "exceljs";
import { criarLoja, criarProduto, criarUsuario, login, chamar, check, executar, db, sufixo } from "./_helpers.mjs";

const json = (r) => r.json().catch(() => null);
const CAB = "sku;nome;categoria;preco_custo;preco_venda;quantidade;estoque_minimo;unidade;descricao";
const MAPA_TUDO = { sku: 0, nome: 1, categoria: 2, preco_custo: 3, preco_venda: 4, quantidade: 5, estoque_minimo: 6, unidade: 7, descricao: 8 };

async function enviar(cookie, buf, modo, mapa, nome = "planilha.csv") {
  const form = new FormData();
  form.set("arquivo", new File([buf], nome));
  form.set("modo", modo);
  if (mapa) form.set("mapeamento", JSON.stringify(mapa));
  const r = await chamar(cookie, "/api/produtos/importar", { method: "POST", body: form });
  return { status: r.status, j: await json(r) };
}

async function principal() {
  const A = await criarLoja(`teste-ia-${sufixo}`, `TESTE Loja Import A ${sufixo}`, "#0f766e");
  const B = await criarLoja(`teste-ib-${sufixo}`, `TESTE Loja Import B ${sufixo}`, "#be123c");
  const tel = (n) => `1195580${n}${sufixo.slice(0, 3)}`;
  const adminA = await criarUsuario({ nome: `TESTE AdminA ${sufixo}`, telefone: tel(1), perfil: "admin", tenantId: A.id, slug: A.slug });
  const opA = await criarUsuario({ nome: `TESTE OpA ${sufixo}`, telefone: tel(2), perfil: "operador", tenantId: A.id, slug: A.slug });
  const adminB = await criarUsuario({ nome: `TESTE AdminB ${sufixo}`, telefone: tel(3), perfil: "admin", tenantId: B.id, slug: B.slug });
  const [cA, cOp, cB] = await Promise.all([login(adminA, A.slug), login(opA, A.slug), login(adminB, B.slug)]);
  const sku = (i) => `TESTE-I-${sufixo}-${i}`;
  const cont = async (tabela, tenant, filtro = (q) => q) =>
    (await filtro(db.from(tabela).select("id", { count: "exact", head: true }).eq("tenant_id", tenant))).count;

  // Já existem na loja A: sku 1 (ativo, estoque 100, custo 4) e sku 2 (EXCLUÍDO, estoque 100). Na loja B: sku 5 com dados próprios.
  const p1 = await criarProduto(A.id, "TESTE Antigo 1", sku(1), { preco_custo: 4, preco_venda: 1, quantidade: 100 });
  const p2 = await criarProduto(A.id, "TESTE Antigo 2", sku(2), { quantidade: 100, ativo: false });
  const pB = await criarProduto(B.id, "TESTE Produto da B", sku(5), { preco_custo: 8, preco_venda: 77, quantidade: 9 });

  // ---------- planilha de 500 linhas com erros propositais ----------
  const cats = ["Bebidas", "bebidas", "Limpeza", "Água & Gelo"];
  const preco = (i) => ["12,50", "1.250,00", "R$ 3,5"][i % 3];
  const erros = new Set([20, 30, ...Array.from({ length: 10 }, (_, k) => (k + 1) * 50)]);
  const linhas = [CAB];
  for (let i = 1; i <= 500; i++) {
    let s = sku(i), nome = `TESTE Produto ${i}`, pv = preco(i);
    if (i === 7) s = ""; // sem SKU: ganha AUTO-000001
    if (i === 20) s = sku(19); // repetido na planilha
    if (i === 30) pv = "-5,00";
    if (i === 31) nome = ""; // sem nome: usa o SKU
    if (i === 33) pv = ""; // sem preço de venda: entra com 0
    if (i % 50 === 0) pv = "abc";
    linhas.push([s, nome, cats[i % 4], "5,00", pv, i % 7, 2, "un", ""].join(";"));
  }
  const csv = Buffer.from("﻿" + linhas.join("\r\n"), "utf-8");
  const validos = Array.from({ length: 500 }, (_, k) => k + 1).filter((i) => !erros.has(i));
  const novos = validos.filter((i) => i !== 1 && i !== 2);

  console.log("--- Acesso ---");
  check("sem login não importa", (await enviar(null, csv, "ler")).status !== 200);
  check("operador não importa (403)", (await enviar(cOp, csv, "ler")).status === 403);
  check("operador não baixa o modelo (403)", (await chamar(cOp, "/api/produtos/importar/modelo")).status === 403);
  const modelo = await chamar(cA, "/api/produtos/importar/modelo");
  check("admin baixa o modelo CSV", modelo.status === 200 && (await modelo.text()).includes("sku;nome;categoria"));

  console.log("\n--- Ler e sugerir colunas ---");
  const lido = await enviar(cA, csv, "ler");
  check("lê 500 linhas e 9 colunas", lido.status === 200 && lido.j.total === 500 && lido.j.colunas.length === 9, JSON.stringify(lido.j)?.slice(0, 150));
  check("sugere o mapeamento pelo cabeçalho", JSON.stringify(lido.j?.sugestao) === JSON.stringify(MAPA_TUDO), JSON.stringify(lido.j?.sugestao));

  console.log("\n--- Prévia (não grava nada) ---");
  const antes = { produtos: await cont("produtos", A.id), categorias: await cont("categorias", A.id), mov: await cont("movimentos_estoque", A.id) };
  const previa = await enviar(cA, csv, "previa", MAPA_TUDO);
  const t = previa.j?.totais;
  check("prévia: 486 novos, 1 atualiza, 1 reativa, 12 erros (só valores impossíveis de adivinhar)", t?.criar === novos.length && t?.atualizar === 1 && t?.reativar === 1 && t?.erros === erros.size, JSON.stringify(t));
  check("prévia: 3 categorias novas (Bebidas/bebidas contam uma vez)", previa.j?.categoriasNovas?.length === 3, JSON.stringify(previa.j?.categoriasNovas));
  const msg = (linha) => previa.j?.erros?.find((e) => e.linha === linha)?.erro ?? "";
  check("erro: SKU repetido (linha 21)", /repetido.*linha 20/.test(msg(21)), msg(21));
  check("avisos da prévia: 1 sem SKU e 1 sem preço", previa.j?.avisos?.semSku === 1 && previa.j?.avisos?.semPreco === 1, JSON.stringify(previa.j?.avisos));
  check("erro: preço negativo (linha 31)", /negativo/.test(msg(31)), msg(31));
  check("erro: preço inválido (linha 51)", /inválido/.test(msg(51)), msg(51));
  const depoisPrevia = { produtos: await cont("produtos", A.id), categorias: await cont("categorias", A.id), mov: await cont("movimentos_estoque", A.id) };
  check("prévia não gravou nada (produtos, categorias, movimentos)", JSON.stringify(antes) === JSON.stringify(depoisPrevia), JSON.stringify(depoisPrevia));

  console.log("\n--- Validações da requisição ---");
  check("mapeamento sem coluna de SKU é aceito (200)", (await enviar(cA, csv, "previa", { ...MAPA_TUDO, sku: null })).status === 200);
  check("coluna que não existe é recusada (400)", (await enviar(cA, csv, "previa", { ...MAPA_TUDO, nome: 30 })).status === 400);
  const grande = Buffer.from(CAB + "\r\n" + Array.from({ length: 2001 }, (_, i) => `X${i};n;;1;1;1;1;un;`).join("\r\n"));
  check("mais de 2000 linhas é recusado (413)", (await enviar(cA, grande, "ler")).status === 413);
  check("arquivo acima de 5 MB é recusado (413)", (await enviar(cA, Buffer.alloc(5 * 1024 * 1024 + 1, 97), "ler")).status === 413);
  check("arquivo vazio é recusado (400)", (await enviar(cA, Buffer.alloc(0), "ler")).status === 400);

  console.log("\n--- Importação de verdade ---");
  const conf = await enviar(cA, csv, "confirmar", MAPA_TUDO);
  const r = conf.j;
  check("confirmar: 486 criados, 1 atualizado, 1 reativado", r?.criados === novos.length && r?.atualizados === 1 && r?.reativados === 1, JSON.stringify(r)?.slice(0, 200));
  check("confirmar: nenhum erro de gravação (as linhas ruins nem entram)", Array.isArray(r?.erros) && r.erros.length === 0, JSON.stringify(r?.erros)?.slice(0, 200));
  check("confirmar: 3 categorias criadas", r?.categoriasCriadas === 3);
  check("loja A ficou com 488 produtos (486 novos + 2 existentes)", (await cont("produtos", A.id)) === validos.length);
  check("sem duplicar: uma categoria por nome (3)", (await cont("categorias", A.id)) === 3);
  const { data: cs } = await db.from("categorias").select("nome").eq("tenant_id", A.id);
  check("categoria usa a 1ª grafia e acentos corretos", cs.some((c) => c.nome === "Água & Gelo") && cs.some((c) => c.nome === "bebidas") && !cs.some((c) => c.nome === "Bebidas"), JSON.stringify(cs));

  const linhaDoBanco = async (i) => (await db.from("produtos").select("*").eq("tenant_id", A.id).eq("sku", sku(i)).single()).data;
  const n3 = await linhaDoBanco(3), n1 = await linhaDoBanco(1), n2 = await linhaDoBanco(2);
  check("preços BR lidos certo (12,50 / 1.250,00 / R$ 3,5)", Number(n3.preco_venda) === 12.5 && Number(n1.preco_venda) === 1250 && Number((await linhaDoBanco(2)).preco_venda) === 3.5, `${n3.preco_venda}/${n1.preco_venda}/${n2.preco_venda}`);
  check("novo: custo, mínimo, unidade e categoria gravados", Number(n3.preco_custo) === 5 && Number(n3.estoque_minimo) === 2 && n3.unidade === "un" && !!n3.categoria_id && n3.ativo === true);
  check("existente (sku 1) foi ATUALIZADO, sem duplicar (mesmo id)", n1.id === p1 && n1.nome === "TESTE Produto 1" && Number(n1.preco_custo) === 5);
  check("excluído (sku 2) foi REATIVADO (mesmo id)", n2.id === p2 && n2.ativo === true && n2.nome === "TESTE Produto 2");
  check("estoque: novo entra pelo movimento (qtd = planilha)", Number(n3.quantidade) === 3 && Number((await linhaDoBanco(4)).quantidade) === 4);
  check("estoque: existente vira a contagem da planilha (100 → 1 e 100 → 2)", Number(n1.quantidade) === 1 && Number(n2.quantidade) === 2, `${n1.quantidade}/${n2.quantidade}`);
  const esperadoMov = novos.filter((i) => i % 7 !== 0).length + 2; // novos com qtd>0 + os 2 ajustes
  const movs = await cont("movimentos_estoque", A.id);
  check("movimentos de estoque registrados com o motivo da importação", movs === esperadoMov, `${movs} != ${esperadoMov}`);
  const { data: umMov } = await db.from("movimentos_estoque").select("operador_nome, motivo, tipo").eq("tenant_id", A.id).eq("produto_id", p1).single();
  check("movimento guarda quem importou e o motivo", umMov?.operador_nome === adminA.nome && /Importação/.test(umMov?.motivo ?? "") && umMov?.tipo === "saida", JSON.stringify(umMov));
  check("auditoria registra a importação", (await cont("auditoria", A.id, (q) => q.eq("acao", "importacao_produtos"))) === 1);

  const s7 = (await db.from("produtos").select("sku, nome").eq("tenant_id", A.id).like("sku", "AUTO-%")).data ?? [];
  check("linha sem SKU ganhou AUTO-000001 e manteve o nome da planilha", s7.length === 1 && s7[0].sku === "AUTO-000001" && s7[0].nome === "TESTE Produto 7", JSON.stringify(s7));
  const n31 = await linhaDoBanco(31), n33 = await linhaDoBanco(33);
  check("linha sem nome usa o SKU como nome; sem preço entra com R$ 0,00", n31.nome === sku(31) && Number(n33.preco_venda) === 0 && n33.nome === "TESTE Produto 33", `${n31.nome}/${n33.preco_venda}`);

  console.log("\n--- Isolamento entre lojas ---");
  const b = (await db.from("produtos").select("nome, preco_custo, preco_venda, quantidade, ativo").eq("id", pB).single()).data;
  check("produto da loja B com o mesmo SKU NÃO foi alterado", b.nome === "TESTE Produto da B" && Number(b.preco_venda) === 77 && Number(b.preco_custo) === 8 && Number(b.quantidade) === 9);
  check("loja B continua com 1 produto, 0 categorias e 0 movimentos", (await cont("produtos", B.id)) === 1 && (await cont("categorias", B.id)) === 0 && (await cont("movimentos_estoque", B.id)) === 0);
  const previaB = await enviar(cB, csv, "previa", MAPA_TUDO);
  check("para a loja B o mesmo arquivo enxerga só o SKU 5 como existente (484 novos, 1 atualiza)", previaB.j?.totais?.atualizar === 1 && previaB.j?.totais?.criar === validos.length - 1 && previaB.j?.totais?.reativar === 0, JSON.stringify(previaB.j?.totais));

  console.log("\n--- Rodar de novo (idempotência) ---");
  const de_novo = (await enviar(cA, csv, "confirmar", MAPA_TUDO)).j;
  check("2ª importação: só a linha SEM SKU cria outro (AUTO-000002); o resto atualiza", de_novo?.criados === 1 && de_novo?.atualizados === validos.length - 1 && de_novo?.reativados === 0, JSON.stringify(de_novo)?.slice(0, 150));
  check("2ª importação: nada duplicado além da linha sem SKU; categorias e movimentos iguais", (await cont("produtos", A.id)) === validos.length + 1 && (await cont("categorias", A.id)) === 3 && (await cont("movimentos_estoque", A.id)) === esperadoMov);

  console.log("\n--- Atualização só dos campos mapeados ---");
  const parcial = Buffer.from(`codigo;produto;valor\r\n${sku(3)};TESTE Renomeado;99,90\r\n`);
  const lidoP = await enviar(cA, parcial, "ler");
  check("cabeçalhos alternativos (codigo/produto/valor) são reconhecidos", lidoP.j?.sugestao?.sku === 0 && lidoP.j?.sugestao?.nome === 1 && lidoP.j?.sugestao?.preco_venda === 2, JSON.stringify(lidoP.j?.sugestao));
  const rp = (await enviar(cA, parcial, "confirmar", lidoP.j.sugestao)).j;
  const n3b = await linhaDoBanco(3);
  check("atualiza nome e preço de venda", rp?.atualizados === 1 && n3b.nome === "TESTE Renomeado" && Number(n3b.preco_venda) === 99.9, JSON.stringify(rp));
  check("NÃO mexe no que não foi mapeado (custo, estoque, mínimo, categoria)", Number(n3b.preco_custo) === 5 && Number(n3b.quantidade) === 3 && Number(n3b.estoque_minimo) === 2 && n3b.categoria_id === n3.categoria_id);

  console.log("\n--- Sem nenhuma obrigação ---");
  const semSku = Buffer.from("nome;preco\r\nTESTE Sem SKU;5,00\r\n");
  const rs = (await enviar(cA, semSku, "confirmar", { nome: 0, preco_venda: 1 })).j;
  const auto = (await db.from("produtos").select("sku, nome, preco_venda").eq("tenant_id", A.id).eq("nome", "TESTE Sem SKU")).data ?? [];
  check("planilha SEM coluna de SKU cria o produto com código automático", rs?.criados === 1 && auto.length === 1 && /^AUTO-\d{6}$/.test(auto[0].sku) && Number(auto[0].preco_venda) === 5, JSON.stringify(auto));
  const soSku = Buffer.from(`sku\r\n${sku(950)}\r\n`);
  const rk = (await enviar(cA, soSku, "confirmar", { sku: 0 })).j;
  const k = await linhaDoBanco(950);
  check("planilha só com a coluna SKU cria o produto (nome = SKU, preço 0, estoque 0)", rk?.criados === 1 && k.nome === sku(950) && Number(k.preco_venda) === 0 && Number(k.quantidade) === 0, JSON.stringify(rk));
  const comObs = Buffer.from(`sku;nome;obs\r\n${sku(951)};TESTE Com Obs;\r\n;;so uma observacao\r\n`);
  const pk = (await enviar(cA, comObs, "previa", { sku: 0, nome: 1 })).j;
  check("linha em branco nas colunas mapeadas é ignorada (sem erro)", pk?.totais?.criar === 1 && pk?.totais?.erros === 0, JSON.stringify(pk?.totais));

  console.log("\n--- Formatos de arquivo ---");
  const latin = Buffer.from(`sku;nome;categoria;preco_venda\r\n${sku(901)};Pão francês;Água;3,50\r\n`, "latin1");
  const rl = (await enviar(cA, latin, "confirmar", { sku: 0, nome: 1, categoria: 2, preco_venda: 3 })).j;
  const l = await linhaDoBanco(901);
  check("CSV em ISO-8859-1 (acentos) é lido certo", rl?.criados === 1 && l?.nome === "Pão francês", JSON.stringify(rl));
  const virgula = Buffer.from(`sku,nome,preco_venda\n${sku(902)},"Suco, laranja ""zero""",4.75\n`);
  const rv = (await enviar(cA, virgula, "confirmar", { sku: 0, nome: 1, preco_venda: 2 })).j;
  const v = await linhaDoBanco(902);
  check("CSV com vírgula, aspas e decimal com ponto", rv?.criados === 1 && v?.nome === 'Suco, laranja "zero"' && Number(v?.preco_venda) === 4.75, JSON.stringify(rv));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Produtos");
  ws.addRow(["SKU", "Produto", "Categoria", "Custo", "Preço", "Qtd"]);
  ws.addRow([sku(903), "TESTE Excel 1", "Limpeza", 5.5, 12.5, 8]);
  ws.addRow([sku(904), "TESTE Excel 2", "Nova do Excel", "6,00", "1.234,56", 0]);
  const xlsx = Buffer.from(await wb.xlsx.writeBuffer());
  const lidoX = await enviar(cA, xlsx, "ler", null, "planilha.xlsx");
  check("XLSX: lê colunas e sugere o mapeamento (Custo/Preço/Qtd)", lidoX.status === 200 && lidoX.j?.total === 2 && lidoX.j?.sugestao?.preco_custo === 3 && lidoX.j?.sugestao?.preco_venda === 4 && lidoX.j?.sugestao?.quantidade === 5, JSON.stringify(lidoX.j)?.slice(0, 200));
  const rx = (await enviar(cA, xlsx, "confirmar", lidoX.j.sugestao, "planilha.xlsx")).j;
  const x1 = await linhaDoBanco(903), x2 = await linhaDoBanco(904);
  check("XLSX: números e textos BR importados, categoria nova criada", rx?.criados === 2 && Number(x1.preco_venda) === 12.5 && Number(x1.quantidade) === 8 && Number(x2.preco_venda) === 1234.56 && rx.categoriasCriadas === 1, JSON.stringify(rx));
  check("arquivo que não é planilha (binário qualquer) não derruba: dá erro 400 ou lê como CSV sem produtos", [400, 200].includes((await enviar(cA, Buffer.from([0x50, 0x4b, 1, 2, 3]), "ler")).status));

}

await executar(principal);
