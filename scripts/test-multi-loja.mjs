// Testes da tarefa "Multi-loja": a loja A não pode ler, alterar nem cancelar nada da loja B.
// Uso (com o servidor rodando):  node --env-file=.env.local scripts/test-multi-loja.mjs
// Cria lojas/usuários/dados "TESTE", apaga tudo por id no final e compara o banco antes x depois.
import { SignJWT } from "jose";
import {
  BASE, URL_SB, SENHA, sufixo, db, criados, check, executar, criarLoja, criarProduto, criarUsuario,
  login, chamar, enviar,
} from "./_helpers.mjs";

// PNG de 1x1 pixel: o suficiente para testar o upload
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function subirImagem(cookie) {
  const fd = new FormData();
  fd.set("file", new Blob([PNG], { type: "image/png" }), "teste.png");
  fd.set("pasta", "produtos");
  const r = await fetch(`${BASE}/api/upload`, { method: "POST", headers: { cookie }, body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(`Upload de teste falhou: ${j.error}`);
  criados.arquivos.push(j.url.split("/object/public/produtos/")[1]);
  return j.url;
}

/** Repete a chamada até dar o status esperado (a suspensão de loja vale em até 30 s por causa do cache). */
async function ate(status, fn, limiteMs = 40_000) {
  const inicio = Date.now();
  for (;;) {
    const r = await fn();
    if (r.status === status || Date.now() - inicio > limiteMs) return { status: r.status, segundos: Math.round((Date.now() - inicio) / 1000) };
    await esperar(3000);
  }
}

async function principal() {
  const A = await criarLoja(`teste-a-${sufixo}`, `TESTE Loja A ${sufixo}`, "#dc2626", { pix_chave: "teste-a@pix.local", pix_cidade: "CIDADE A" });
  const B = await criarLoja(`teste-b-${sufixo}`, `TESTE Loja B ${sufixo}`, "#059669", { pix_chave: "teste-b@pix.local", pix_cidade: "CIDADE B", taxa_debito: 4 });
  const tel = (n) => `1195560${n}${sufixo.slice(0, 3)}`;

  // O MESMO telefone é admin nas duas lojas (só o e-mail interno, que leva o slug, é diferente)
  const adminA = await criarUsuario({ nome: `TESTE AdminA ${sufixo}`, telefone: tel(1), perfil: "admin", tenantId: A.id, slug: A.slug });
  const adminB = await criarUsuario({ nome: `TESTE AdminB ${sufixo}`, telefone: tel(1), perfil: "admin", tenantId: B.id, slug: B.slug });
  const opA = await criarUsuario({ nome: `TESTE OpA ${sufixo}`, telefone: tel(2), perfil: "operador", tenantId: A.id, slug: A.slug });
  const opB = await criarUsuario({ nome: `TESTE OpB ${sufixo}`, telefone: tel(3), perfil: "operador", tenantId: B.id, slug: B.slug });
  const nomeProdA = `TESTE Produto A ${sufixo}`;
  const nomeProdB = `TESTE Produto B ${sufixo}`;
  const pA = await criarProduto(A.id, nomeProdA, `TESTE-A-${sufixo}`);
  const pB = await criarProduto(B.id, nomeProdB, `TESTE-B-${sufixo}`);

  const [cAdminA, cAdminB, cOpA, cOpB] = await Promise.all([login(adminA, A.slug), login(adminB, B.slug), login(opA, A.slug), login(opB, B.slug)]);
  const qtd = async (id) => Number((await db.from("produtos").select("quantidade").eq("id", id).single()).data.quantidade);
  const json = async (r) => r.json().catch(() => null);

  console.log("--- Login por loja ---");
  const produtosA = await json(await chamar(cAdminA, "/api/produtos"));
  const produtosB = await json(await chamar(cAdminB, "/api/produtos"));
  check("mesmo telefone em 2 lojas: o admin A cai na loja A (vê o produto A, não o B)", produtosA.some((p) => p.id === pA) && !produtosA.some((p) => p.id === pB));
  check("mesmo telefone em 2 lojas: o admin B cai na loja B", produtosB.some((p) => p.id === pB) && !produtosB.some((p) => p.id === pA));
  const cruzado = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loja: B.slug, identificador: opA.telefone, senha: SENHA }) });
  check("usuário da loja A NÃO entra pela loja B (401)", cruzado.status === 401, String(cruzado.status));
  const lojaInexistente = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loja: "teste-nao-existe", identificador: adminA.telefone, senha: SENHA }) });
  check("login em loja inexistente é recusado (404)", lojaInexistente.status === 404, String(lojaInexistente.status));

  console.log("\n--- Produtos ---");
  const corpoProduto = { nome: "TESTE INVASOR", sku: `TESTE-X-${sufixo}`, preco_custo: 1, preco_venda: 1, quantidade: 1, estoque_minimo: 0, unidade: "un", visivel_catalogo: true };
  check("A não lê produto da B pelo id (404)", (await chamar(cAdminA, `/api/produtos/${pB}`)).status === 404);
  check("A não altera produto da B (404)", (await enviar(cAdminA, `/api/produtos/${pB}`, "PUT", corpoProduto)).status === 404);
  check("A não exclui produto da B (404)", (await chamar(cAdminA, `/api/produtos/${pB}`, { method: "DELETE" })).status === 404);
  const { data: pBdepois } = await db.from("produtos").select("nome, ativo").eq("id", pB).single();
  check("produto da B ficou intacto (nome e ativo)", pBdepois.nome === nomeProdB && pBdepois.ativo === true);
  const criadoComTenantForjado = await enviar(cAdminA, "/api/produtos", "POST", { ...corpoProduto, tenant_id: B.id });
  const pForjado = await json(criadoComTenantForjado);
  if (pForjado?.id) criados.produtos.push(pForjado.id);
  check("tenant_id vindo no corpo é ignorado: produto nasce na loja A", criadoComTenantForjado.status === 201 && pForjado.tenant_id === A.id, JSON.stringify(pForjado));

  console.log("\n--- Vendas, estoque e movimentos ---");
  const rVendaB = await enviar(cOpB, "/api/vendas", "POST", { itens: [{ produto_id: pB, quantidade: 2 }], forma_pagamento: "dinheiro" });
  const vB = await json(rVendaB);
  criados.vendas.push(vB.id);
  check("operador B vende na loja B (201) e a venda é da loja B", rVendaB.status === 201 && vB.tenant_id === B.id);
  const vendaCruzada = await enviar(cOpA, "/api/vendas", "POST", { itens: [{ produto_id: pB, quantidade: 1 }], forma_pagamento: "dinheiro" });
  check("operador A NÃO vende produto da loja B (422)", vendaCruzada.status === 422, `${vendaCruzada.status} ${JSON.stringify(await json(vendaCruzada))}`);
  check("estoque da B intacto após a tentativa (98)", (await qtd(pB)) === 98);
  const movCruzado = await enviar(cAdminA, "/api/movimentos", "POST", { produto_id: pB, tipo: "entrada", quantidade: 5 });
  check("A NÃO movimenta estoque da B (404)", movCruzado.status === 404, String(movCruzado.status));
  check("estoque da B continua 98", (await qtd(pB)) === 98);
  const cancelaCruzado = await enviar(cAdminA, `/api/vendas/${vB.id}/cancelar`, "POST", { motivo: "TESTE invasão" });
  check("A NÃO cancela venda da B", cancelaCruzado.status === 409, `${cancelaCruzado.status} ${JSON.stringify(await json(cancelaCruzado))}`);
  const { data: vBdepois } = await db.from("vendas").select("status").eq("id", vB.id).single();
  check("venda da B continua concluída e o estoque não voltou", vBdepois.status === "concluida" && (await qtd(pB)) === 98);
  check("A não enxerga vendas da B", !(await json(await chamar(cAdminA, "/api/vendas"))).some((v) => v.id === vB.id));
  check("B enxerga a própria venda", (await json(await chamar(cAdminB, "/api/vendas"))).some((v) => v.id === vB.id));
  const movsA = await json(await chamar(cAdminA, "/api/movimentos"));
  check("A não enxerga movimentos de estoque da B", !movsA.some((m) => m.produtos?.nome === nomeProdB));

  console.log("\n--- Categorias e clientes ---");
  const catB = await json(await enviar(cAdminB, "/api/categorias", "POST", { nome: `TESTE Cat B ${sufixo}` }));
  await enviar(cAdminA, "/api/categorias", "POST", { nome: `TESTE Cat A ${sufixo}` });
  const catsA = await json(await chamar(cAdminA, "/api/categorias"));
  check("A não enxerga categorias da B", !catsA.some((c) => c.id === catB.id) && catsA.some((c) => c.nome.includes("Cat A")));

  const rCliA = await enviar(cOpA, "/api/clientes", "POST", { nome: `TESTE Cliente A ${sufixo}`, telefone: "(11) 98888-7777", email: "a@teste.com", endereco: "Rua A, 1", tenant_id: B.id });
  const cliA = await json(rCliA);
  if (cliA?.id) criados.clientes.push(cliA.id);
  check("operador cadastra cliente (201) e o telefone fica só com dígitos", rCliA.status === 201 && cliA.telefone === "11988887777", JSON.stringify(cliA));
  const { data: cliADb } = await db.from("clientes").select("tenant_id").eq("id", cliA.id).single();
  check("cliente nasce na loja A mesmo com tenant_id forjado no corpo", cliADb.tenant_id === A.id);
  const rCliB = await enviar(cAdminB, "/api/clientes", "POST", { nome: `TESTE Cliente B ${sufixo}`, telefone: "11988887777" });
  const cliB = await json(rCliB);
  if (cliB?.id) criados.clientes.push(cliB.id);
  check("o mesmo telefone pode ser cliente em lojas diferentes (201)", rCliB.status === 201, JSON.stringify(cliB));
  check("telefone repetido dentro da mesma loja é recusado (409)", (await enviar(cAdminA, "/api/clientes", "POST", { nome: "TESTE Dup", telefone: "11988887777" })).status === 409);
  check("e-mail inválido é recusado (400)", (await enviar(cAdminA, "/api/clientes", "POST", { nome: "TESTE Mail", email: "isso-nao-e-email" })).status === 400);
  check("nome curto é recusado (400)", (await enviar(cAdminA, "/api/clientes", "POST", { nome: "A" })).status === 400);
  const listaCliA = await json(await chamar(cOpA, "/api/clientes"));
  check("A só lista os clientes da loja A", listaCliA.some((c) => c.id === cliA.id) && !listaCliA.some((c) => c.id === cliB.id));
  check("busca de cliente por nome funciona", (await json(await chamar(cOpA, "/api/clientes?q=Cliente%20A"))).some((c) => c.id === cliA.id));
  check("A não altera cliente da B (404)", (await enviar(cAdminA, `/api/clientes/${cliB.id}`, "PUT", { nome: "TESTE Hack" })).status === 404);
  check("A não exclui cliente da B (404)", (await chamar(cAdminA, `/api/clientes/${cliB.id}`, { method: "DELETE" })).status === 404);
  const { data: cliBdb } = await db.from("clientes").select("nome, ativo").eq("id", cliB.id).single();
  check("cliente da B intacto", cliBdb.nome.includes("Cliente B") && cliBdb.ativo === true);
  check("operador NÃO edita cliente (403)", (await enviar(cOpA, `/api/clientes/${cliA.id}`, "PUT", { nome: "TESTE Outro" })).status === 403);
  check("operador NÃO exclui cliente (403)", (await chamar(cOpA, `/api/clientes/${cliA.id}`, { method: "DELETE" })).status === 403);
  check("admin edita cliente da própria loja (200)", (await enviar(cAdminA, `/api/clientes/${cliA.id}`, "PUT", { nome: `TESTE Cliente A2 ${sufixo}`, telefone: "11988887777" })).status === 200);
  check("página /clientes do operador A mostra o cliente A e não o B", await chamar(cOpA, "/clientes").then((r) => r.text()).then((h) => h.includes("Cliente A2") && !h.includes("Cliente B")));

  console.log("\n--- Cliente na venda e entrega ---");
  const venderCom = (cookie, extra) => enviar(cookie, "/api/vendas", "POST", { itens: [{ produto_id: pA, quantidade: 1 }], forma_pagamento: "dinheiro", ...extra });
  const rEnt = await venderCom(cOpA, { cliente_id: cliA.id, entrega: true, entrega_endereco: "Rua da Entrega, 99", cliente_nome: "Nome Forjado", cliente_telefone: "00000000000" });
  const vEnt = await json(rEnt);
  if (vEnt?.id) criados.vendas.push(vEnt.id);
  check("venda com cliente e entrega (201)", rEnt.status === 201 && vEnt.entrega === true && vEnt.entrega_endereco === "Rua da Entrega, 99", JSON.stringify(vEnt));
  check("nome e telefone vêm do cadastro (corpo forjado é ignorado)", vEnt.cliente_id === cliA.id && vEnt.cliente_nome.includes("Cliente A2") && vEnt.cliente_telefone === "11988887777");
  await enviar(cAdminA, `/api/clientes/${cliA.id}`, "PUT", { nome: `TESTE Cliente A3 ${sufixo}`, telefone: "11988887777", endereco: "Outro endereço" });
  const { data: vEntDb } = await db.from("vendas").select("cliente_nome, entrega_endereco").eq("id", vEnt.id).single();
  check("a venda guarda cópia: editar o cadastro depois não muda o histórico", vEntDb.cliente_nome.includes("Cliente A2") && vEntDb.entrega_endereco === "Rua da Entrega, 99");
  const histAdm = await chamar(cAdminA, "/pdv/vendas").then((r) => r.text());
  check("histórico mostra o cliente e o selo ENTREGA", histAdm.includes("ENTREGA") && histAdm.includes("Cliente A2"));
  const vSemEnt = await json(await venderCom(cOpA, { cliente_id: cliA.id }));
  if (vSemEnt?.id) criados.vendas.push(vSemEnt.id);
  check("venda com cliente, sem entrega: entrega=false e sem endereço", vSemEnt.entrega === false && vSemEnt.entrega_endereco === null && vSemEnt.cliente_id === cliA.id);
  const vSemCli = await json(await venderCom(cOpA, { entrega_endereco: "Rua X" }));
  if (vSemCli?.id) criados.vendas.push(vSemCli.id);
  check("venda comum (sem cliente) continua funcionando", vSemCli.cliente_id === null && vSemCli.entrega === false);
  const estoqueAntes = await qtd(pA);
  const semEndereco = await venderCom(cOpA, { cliente_id: cliA.id, entrega: true, entrega_endereco: "   " });
  check("entrega sem endereço é recusada (422)", semEndereco.status === 422, `${semEndereco.status} ${JSON.stringify(await json(semEndereco))}`);
  const semCliente = await venderCom(cOpA, { entrega: true, entrega_endereco: "Rua Y" });
  check("entrega sem cliente é recusada (422)", semCliente.status === 422, String(semCliente.status));
  const clienteDeOutraLoja = await venderCom(cOpA, { cliente_id: cliB.id });
  check("A NÃO vincula cliente da loja B à venda (422)", clienteDeOutraLoja.status === 422, `${clienteDeOutraLoja.status} ${JSON.stringify(await json(clienteDeOutraLoja))}`);
  check("cliente_id inválido é recusado (400)", (await venderCom(cOpA, { cliente_id: "nao-e-uuid" })).status === 400);
  check("as vendas recusadas não baixaram estoque", (await qtd(pA)) === estoqueAntes);
  const excluido = await enviar(cAdminB, "/api/clientes", "POST", { nome: `TESTE Cliente Excluido ${sufixo}` });
  const cliExcl = await json(excluido);
  if (cliExcl?.id) criados.clientes.push(cliExcl.id);
  await chamar(cAdminB, `/api/clientes/${cliExcl.id}`, { method: "DELETE" });
  const paraExcluido = await enviar(cOpB, "/api/vendas", "POST", { itens: [{ produto_id: pB, quantidade: 1 }], forma_pagamento: "dinheiro", cliente_id: cliExcl.id });
  check("cliente excluído (inativo) não pode ser vinculado (422)", paraExcluido.status === 422, String(paraExcluido.status));

  console.log("\n--- Usuários ---");
  const usersA = await json(await chamar(cAdminA, "/api/usuarios"));
  check("A só lista usuários da loja A", usersA.every((u) => u.tenantId === A.id) && usersA.some((u) => u.id === opA.id) && !usersA.some((u) => u.id === opB.id));
  check("A não altera usuário da B (404)", (await enviar(cAdminA, `/api/usuarios/${opB.id}`, "PUT", { senha: "OutraSenha#2026" })).status === 404);
  check("A não exclui usuário da B (404)", (await chamar(cAdminA, `/api/usuarios/${opB.id}`, { method: "DELETE" })).status === 404);
  const loginOpBAindaOk = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loja: B.slug, identificador: opB.telefone, senha: SENHA }) });
  check("usuário da B continua existindo e com a senha original", loginOpBAindaOk.status === 200);
  check("telefone já usado na loja A não pode ser cadastrado de novo nela", (await enviar(cAdminA, "/api/usuarios", "POST", { nome: "TESTE Dup", telefone: tel(1), senha: "SenhaBoa#2026", perfil: "operador" })).status === 400);
  const novoA = await enviar(cAdminA, "/api/usuarios", "POST", { nome: `TESTE NovoA ${sufixo}`, telefone: tel(4), senha: "SenhaBoa#2026", perfil: "operador" });
  const novoAJson = await json(novoA);
  if (novoAJson?.id) criados.usuarios.push(novoAJson.id);
  check("admin A cria usuário e ele nasce na loja A", novoA.status === 201 && novoAJson.tenantId === A.id, JSON.stringify(novoAJson));
  check("o novo usuário da A não aparece para a B", !(await json(await chamar(cAdminB, "/api/usuarios"))).some((u) => u.id === novoAJson?.id));

  console.log("\n--- Imagens (storage por loja) ---");
  const urlA = await subirImagem(cAdminA);
  const urlB = await subirImagem(cAdminB);
  check("upload da A vai para a pasta da loja A", urlA.includes(`/produtos/${A.id}/`));
  check("upload da B vai para a pasta da loja B", urlB.includes(`/produtos/${B.id}/`));
  check("imagem é pública (o catálogo precisa mostrar)", (await fetch(urlA)).status === 200);
  check("branding da A recusa imagem da loja B (400)", (await enviar(cAdminA, "/api/branding", "PUT", { nome_fantasia: A.nome, cor_primaria: A.cor, logo_url: urlB, icone_url: null })).status === 400);
  check("branding da A recusa URL externa (400)", (await enviar(cAdminA, "/api/branding", "PUT", { nome_fantasia: A.nome, cor_primaria: A.cor, logo_url: "https://example.com/x.png", icone_url: null })).status === 400);
  check("branding da A aceita imagem da própria loja (200)", (await enviar(cAdminA, "/api/branding", "PUT", { nome_fantasia: A.nome, cor_primaria: A.cor, logo_url: urlA, icone_url: null })).status === 200);
  check("produto da A recusa imagem da loja B (400)", (await enviar(cAdminA, "/api/produtos", "POST", { ...corpoProduto, sku: `TESTE-Y-${sufixo}`, imagem_url: urlB })).status === 400);
  const comImagem = await enviar(cAdminA, "/api/produtos", "POST", { ...corpoProduto, sku: `TESTE-Z-${sufixo}`, imagem_url: urlA });
  const pImg = await json(comImagem);
  if (pImg?.id) criados.produtos.push(pImg.id);
  check("produto da A aceita imagem da própria loja (201)", comImagem.status === 201);

  console.log("\n--- Pagamentos por loja (PIX e taxas) ---");
  check("operador NÃO altera pagamentos (403)", (await enviar(cOpA, "/api/configuracoes/pagamentos", "PUT", { pix_chave: "x", pix_cidade: "y", taxa_debito: 1, taxa_credito: 1, caixa_obrigatorio: false })).status === 403);
  check("admin A altera PIX e taxas (200)", (await enviar(cAdminA, "/api/configuracoes/pagamentos", "PUT", { pix_chave: "teste-a2@pix.local", pix_cidade: "CIDADE A", taxa_debito: "1,5".replace(",", "."), taxa_credito: 3, caixa_obrigatorio: false })).status === 200);
  check("taxa acima de 30% é recusada (400)", (await enviar(cAdminA, "/api/configuracoes/pagamentos", "PUT", { pix_chave: "", pix_cidade: "", taxa_debito: 31, taxa_credito: 3, caixa_obrigatorio: false })).status === 400);
  const { data: tA } = await db.from("tenants").select("pix_chave, taxa_debito").eq("id", A.id).single();
  const { data: tB } = await db.from("tenants").select("pix_chave, taxa_debito").eq("id", B.id).single();
  check("configuração da A mudou e a da B NÃO", tA.pix_chave === "teste-a2@pix.local" && Number(tA.taxa_debito) === 1.5 && tB.pix_chave === "teste-b@pix.local" && Number(tB.taxa_debito) === 4);
  const pdvA = await chamar(cOpA, "/pdv").then((r) => r.text());
  check("o PDV da A usa o PIX da A e não vaza o da B", pdvA.includes("teste-a2@pix.local") && !pdvA.includes("teste-b@pix.local"));

  console.log("\n--- Sessão (token) ---");
  const chaveJwt = new TextEncoder().encode(process.env.SESSION_SECRET);
  const token = (claims) => new SignJWT({ email: "x@x", nome: "TESTE", ...claims }).setProtectedHeader({ alg: "HS256" }).setSubject(adminA.id).setIssuedAt().setExpirationTime("1h").sign(chaveJwt);
  const tokenAntigo = await token({ perfil: "admin" });
  check("token antigo (sem loja) é recusado (401)", (await chamar(`evolua_session=${tokenAntigo}`, "/api/produtos")).status === 401);
  const tokenLojaFalsa = await token({ perfil: "admin", tid: "11111111-1111-4111-8111-111111111111" });
  check("token de loja que não existe é recusado (403)", (await chamar(`evolua_session=${tokenLojaFalsa}`, "/api/produtos")).status === 403);
  check("token adulterado é recusado (401)", (await chamar(`evolua_session=${tokenAntigo}x`, "/api/produtos")).status === 401);
  check("sem cookie: API 401", (await chamar(null, "/api/produtos")).status === 401);
  const semSessao = await chamar(null, "/dashboard");
  check("sem cookie: página vai para o login", semSessao.status === 307 && semSessao.headers.get("location")?.includes("/login"));

  console.log("\n--- Páginas públicas por loja ---");
  const htmlCatA = await chamar(null, `/c/${A.slug}`).then((r) => r.text());
  const htmlCatB = await chamar(null, `/c/${B.slug}`).then((r) => r.text());
  check("catálogo da A mostra só produtos da A", htmlCatA.includes(nomeProdA) && !htmlCatA.includes(nomeProdB) && htmlCatA.includes(A.nome));
  check("catálogo da B mostra só produtos da B", htmlCatB.includes(nomeProdB) && !htmlCatB.includes(nomeProdA) && htmlCatB.includes(B.nome));
  check("catálogo não expõe custo nem estoque exato", !htmlCatA.includes("preco_custo"));
  check("loja inexistente: catálogo 404", (await chamar(null, "/c/teste-nao-existe")).status === 404);
  const mA = await json(await chamar(null, `/c/${A.slug}/manifest.webmanifest`));
  const mB = await json(await chamar(null, `/c/${B.slug}/manifest.webmanifest`));
  check("manifest do PWA é por loja (nome e cor)", mA.name === A.nome && mA.theme_color === A.cor && mB.name === B.nome && mB.theme_color === B.cor);
  const iA = await chamar(null, `/pwa/icon/192?loja=${A.slug}`);
  const iB = await chamar(null, `/pwa/icon/192?loja=${B.slug}`);
  check("ícone do PWA é por loja (PNG diferente)", iA.headers.get("content-type") === "image/png" && !Buffer.from(await iA.arrayBuffer()).equals(Buffer.from(await iB.arrayBuffer())));
  check("login da loja mostra a marca da loja", (await chamar(null, `/c/${A.slug}/login`).then((r) => r.text())).includes(A.nome));
  const sem = await chamar(null, "/login").then((r) => r.text());
  check("/login sem loja pergunta o endereço da loja", sem.includes("Qual é a sua loja"));
  const comCookie = await chamar(`evolua_loja=${B.slug}`, "/login");
  check("/login lembra a última loja do aparelho", comCookie.status === 307 && comCookie.headers.get("location")?.includes(`/c/${B.slug}/login`));

  console.log("\n--- Dono da plataforma (super-admin) ---");
  const dono = await criarUsuario({ nome: `TESTE Dono ${sufixo}`, telefone: tel(9), perfil: "super_admin", tenantId: null, slug: "plataforma" });
  const cDono = await login(dono, null);
  check("super-admin abre /plataforma e vê as lojas", await chamar(cDono, "/plataforma").then((r) => r.text()).then((h) => h.includes(A.slug) && h.includes(B.slug)));
  check("admin de loja NÃO abre /plataforma", (await chamar(cAdminA, "/plataforma")).status === 307);
  check("operador NÃO abre /plataforma", (await chamar(cOpA, "/plataforma")).status === 307);
  check("admin de loja NÃO cria loja (403)", (await enviar(cAdminA, "/api/plataforma/lojas", "POST", {})).status === 403);
  check("operador NÃO suspende loja (403)", (await enviar(cOpA, `/api/plataforma/lojas/${B.id}`, "PATCH", { ativo: false })).status === 403);
  check("sem login não cria loja (401)", (await enviar(null, "/api/plataforma/lojas", "POST", {})).status === 401);
  check("super-admin NÃO acessa dados de loja (403)", (await chamar(cDono, "/api/produtos")).status === 403);
  const dashDono = await chamar(cDono, "/dashboard");
  check("super-admin NÃO abre o painel de loja (vai para /plataforma)", dashDono.status === 307 && dashDono.headers.get("location")?.includes("/plataforma"));

  console.log("\n--- Onboarding: dono cria loja + primeiro admin ---");
  const slugC = `teste-c-${sufixo}`;
  const rC = await enviar(cDono, "/api/plataforma/lojas", "POST", { nome_fantasia: `TESTE Loja C ${sufixo}`, slug: slugC, admin: { nome: `TESTE AdminC ${sufixo}`, telefone: tel(5), senha: "SenhaBoa#2026" } });
  const lojaC = await json(rC);
  if (lojaC?.id) criados.lojas.push(lojaC.id);
  check("dono cria loja com o primeiro admin (201)", rC.status === 201 && lojaC.slug === slugC, JSON.stringify(lojaC));
  const cAdminC = await login({ telefone: tel(5) }, slugC, "SenhaBoa#2026");
  const prodC = await json(await chamar(cAdminC, "/api/produtos"));
  check("o admin da loja nova entra e a loja começa vazia", Array.isArray(prodC) && prodC.length === 0);
  check("endereço repetido é recusado (409)", (await enviar(cDono, "/api/plataforma/lojas", "POST", { nome_fantasia: "TESTE Dup", slug: slugC, admin: { nome: "TESTE X", telefone: tel(6), senha: "SenhaBoa#2026" } })).status === 409);
  check("endereço reservado é recusado (400)", (await enviar(cDono, "/api/plataforma/lojas", "POST", { nome_fantasia: "TESTE Res", slug: "api", admin: { nome: "TESTE X", telefone: tel(6), senha: "SenhaBoa#2026" } })).status === 400);
  check("endereço inválido é recusado (400)", (await enviar(cDono, "/api/plataforma/lojas", "POST", { nome_fantasia: "TESTE Inv", slug: "Ab", admin: { nome: "TESTE X", telefone: tel(6), senha: "SenhaBoa#2026" } })).status === 400);
  const { count: sobrou } = await db.from("tenants").select("id", { count: "exact", head: true }).in("slug", ["api", "ab"]);
  check("recusas não deixam loja pela metade", sobrou === 0);

  console.log("\n--- Redefinir senha pelo dono ---");
  check("dono NÃO redefine senha de usuário de outra loja pela URL errada (404)", (await enviar(cDono, `/api/plataforma/lojas/${B.id}/usuarios/${opA.id}`, "PUT", { senha: "NovaSenha#2026" })).status === 404);
  check("dono redefine a senha do admin da B (200)", (await enviar(cDono, `/api/plataforma/lojas/${B.id}/usuarios/${adminB.id}`, "PUT", { senha: "NovaSenha#2026" })).status === 200);
  const loginNovo = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loja: B.slug, identificador: adminB.telefone, senha: "NovaSenha#2026" }) });
  check("o admin da B entra com a senha nova", loginNovo.status === 200);

  console.log("\n--- Loja suspensa ---");
  check("dono suspende a loja B (200)", (await enviar(cDono, `/api/plataforma/lojas/${B.id}`, "PATCH", { ativo: false })).status === 200);
  const susp = await ate(403, () => chamar(cAdminB, "/api/produtos"));
  check(`sessão da loja suspensa perde o acesso (403) em ${susp.segundos}s (limite 30s)`, susp.status === 403, String(susp.status));
  const loginSusp = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loja: B.slug, identificador: opB.telefone, senha: SENHA }) });
  check("login em loja suspensa é recusado (403)", loginSusp.status === 403);
  check("catálogo da loja suspensa some (404)", (await chamar(null, `/c/${B.slug}`)).status === 404);
  check("a loja A não foi afetada", (await chamar(cAdminA, "/api/produtos")).status === 200);
  check("dono reativa a loja B (200)", (await enviar(cDono, `/api/plataforma/lojas/${B.id}`, "PATCH", { ativo: true })).status === 200);
  const volta = await ate(200, () => chamar(cAdminB, "/api/produtos"));
  check(`loja reativada volta a funcionar (200) em ${volta.segundos}s`, volta.status === 200, String(volta.status));

  console.log("\n--- Banco: RLS (acesso direto pela API pública do Supabase) ---");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!anon) {
    console.log("PULADO  defina NEXT_PUBLIC_SUPABASE_ANON_KEY (ou ..._PUBLISHABLE_KEY) no .env.local para testar o RLS");
  } else {
    const rest = (caminho, init = {}, bearer = anon) => fetch(`${URL_SB}/rest/v1/${caminho}`, { ...init, headers: { apikey: anon, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json", ...init.headers } });
    const lido = await rest("produtos?select=id,preco_custo&limit=5");
    check("anon NÃO lê produtos", !lido.ok || (await lido.json()).length === 0, String(lido.status));
    check("anon NÃO lê tenants (PIX das lojas)", await rest("tenants?select=pix_chave&limit=5").then(async (r) => !r.ok || (await r.json()).length === 0));
    check("anon NÃO grava produto", !(await rest("produtos", { method: "POST", body: JSON.stringify({ tenant_id: A.id, nome: "TESTE anon", sku: `TESTE-ANON-${sufixo}` }) })).ok);
    check("anon NÃO chama fechar_venda (RPC)", !(await rest("rpc/fechar_venda", { method: "POST", body: JSON.stringify({ p_tenant_id: A.id, p_itens: [], p_forma_pagamento: "dinheiro", p_desconto: 0, p_valor_recebido: null, p_operador_id: opA.id, p_operador_nome: "x" }) })).ok);
    const sessaoSb = await fetch(`${URL_SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ email: `${opA.telefone}@${A.slug}.evolua.test`, password: SENHA }) }).then((r) => r.json());
    if (sessaoSb.access_token) {
      const direto = await rest("produtos?select=id,preco_custo&limit=5", {}, sessaoSb.access_token);
      check("operador logado direto no Supabase NÃO lê produtos (nem preço de custo)", !direto.ok || (await direto.json()).length === 0, String(direto.status));
    }
  }
}

await executar(principal);
