// Testes da importação de FOTOS por link (servidor + banco + storage): API /api/produtos/imagens, coluna de link na
// planilha, repetidos que aproveitam a foto e isolamento entre lojas. A proteção contra rede interna (SSRF) e a
// conversão são provadas em scripts/test-imagens-baixar.mjs. Este teste baixa uma foto de verdade pela internet (do
// próprio storage público do Supabase). Uso (servidor rodando): node --env-file=.env.local scripts/test-imagens.mjs
// Cria lojas/usuários/dados "TESTE", apaga tudo por id (inclusive os arquivos) e compara o banco antes x depois.
import sharp from "sharp";
import { criarLoja, criarProduto, criarUsuario, login, chamar, enviar, check, executar, criados, db, sufixo } from "./_helpers.mjs";

const json = (r) => r.json().catch(() => null);

async function principal() {
  const A = await criarLoja(`teste-fa-${sufixo}`, `TESTE Loja Fotos A ${sufixo}`, "#0f766e");
  const B = await criarLoja(`teste-fb-${sufixo}`, `TESTE Loja Fotos B ${sufixo}`, "#be123c");
  const tel = (n) => `1195560${n}${sufixo.slice(0, 3)}`;
  const adminA = await criarUsuario({ nome: `TESTE AdminA ${sufixo}`, telefone: tel(1), perfil: "admin", tenantId: A.id, slug: A.slug });
  const opA = await criarUsuario({ nome: `TESTE OpA ${sufixo}`, telefone: tel(2), perfil: "operador", tenantId: A.id, slug: A.slug });
  const adminB = await criarUsuario({ nome: `TESTE AdminB ${sufixo}`, telefone: tel(3), perfil: "admin", tenantId: B.id, slug: B.slug });
  const [cA, cOp, cB] = await Promise.all([login(adminA, A.slug), login(opA, A.slug), login(adminB, B.slug)]);

  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/produtos/`;
  const prefixoA = `${base}${A.id}/`;
  const guardar = (url) => url?.startsWith(base) && criados.arquivos.push(url.slice(base.length)); // para apagar no final

  // Foto de teste no storage público (é de onde o servidor vai baixar, pela internet)
  const png = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#e11d48" } }).png().toBuffer();
  const caminhoFoto = `TESTE-fotos-${sufixo}/origem.png`;
  criados.arquivos.push(caminhoFoto);
  const up = await db.storage.from("produtos").upload(caminhoFoto, png, { contentType: "image/png" });
  if (up.error) throw new Error(`Não subiu a foto de teste: ${up.error.message}`);
  const urlFoto = db.storage.from("produtos").getPublicUrl(caminhoFoto).data.publicUrl;
  const caminhoTxt = `TESTE-fotos-${sufixo}/nao-e-imagem.txt`;
  criados.arquivos.push(caminhoTxt);
  const upTxt = await db.storage.from("produtos").upload(caminhoTxt, Buffer.from("isto nao e uma imagem"), { contentType: "text/plain" });
  const urlTxt = db.storage.from("produtos").getPublicUrl(caminhoTxt).data.publicUrl;

  const p1 = await criarProduto(A.id, `TESTE Foto Um ${sufixo}`, `TESTE-F1-${sufixo}`);
  const p2 = await criarProduto(A.id, `TESTE Foto Dois ${sufixo}`, `TESTE-F2-${sufixo}`);
  const p3 = await criarProduto(A.id, `TESTE Foto Tres ${sufixo}`, `TESTE-F3-${sufixo}`);
  const p4 = await criarProduto(A.id, `TESTE Foto Quatro ${sufixo}`, `TESTE-F4-${sufixo}`, { imagem_url: `${prefixoA}produtos/ja-tinha.webp` });
  const pB = await criarProduto(B.id, `TESTE Foto Da B ${sufixo}`, `TESTE-FB-${sufixo}`);
  const produto = async (id) => (await db.from("produtos").select("imagem_url").eq("id", id).single()).data;
  const fotos = (itens, extra = {}) => enviar(cA, "/api/produtos/imagens", "POST", { itens: itens.map(([produto_id, url]) => ({ produto_id, url })), ...extra });
  const resultado = (j, id) => j?.resultados?.find((r) => r.produto_id === id);

  console.log("--- Acesso e validação ---");
  check("sem login não baixa foto", (await enviar(null, "/api/produtos/imagens", "POST", { itens: [{ produto_id: p1, url: urlFoto }] })).status !== 200);
  check("operador não baixa foto (403)", (await enviar(cOp, "/api/produtos/imagens", "POST", { itens: [{ produto_id: p1, url: urlFoto }] })).status === 403);
  check("mais de 8 fotos por chamada é recusado (400)", (await fotos(Array.from({ length: 9 }, () => [p1, urlFoto]))).status === 400);
  check("lote vazio é recusado (400)", (await fotos([])).status === 400);
  check("produto_id que não é uuid é recusado (400)", (await enviar(cA, "/api/produtos/imagens", "POST", { itens: [{ produto_id: "x", url: urlFoto }] })).status === 400);
  check("'substituir' fora do formato é recusado (400)", (await fotos([[p1, urlFoto]], { substituir: "sim" })).status === 400);

  console.log("\n--- Links proibidos e produtos de outra loja ---");
  const ruins = ["https://127.0.0.1/a.png", "https://169.254.169.254/latest/meta-data/", "http://exemplo.com/a.png", "file:///etc/passwd", "https://localhost/a.png", "não é link"];
  for (const link of ruins) {
    const r = await json(await fotos([[p1, link]]));
    check(`recusa ${link}`, resultado(r, p1)?.status === "erro" && !!resultado(r, p1)?.erro, JSON.stringify(r));
  }
  check("nenhum link proibido chegou a gravar foto no produto", (await produto(p1)).imagem_url === null);
  const alheio = await json(await fotos([[pB, urlFoto]]));
  check("produto de OUTRA loja não recebe foto ('Produto não encontrado')", resultado(alheio, pB)?.status === "erro" && /não encontrado/.test(resultado(alheio, pB)?.erro ?? "") && (await produto(pB)).imagem_url === null);
  const alheio2 = await json(await enviar(cB, "/api/produtos/imagens", "POST", { itens: [{ produto_id: p1, url: urlFoto }] }));
  check("a loja B não consegue mexer no produto da loja A", resultado(alheio2, p1)?.status === "erro" && (await produto(p1)).imagem_url === null);
  if (!upTxt.error) {
    const naoImg = await json(await fotos([[p1, urlTxt]]));
    check("link que não é imagem é recusado com dica", resultado(naoImg, p1)?.status === "erro" && /não é uma imagem/.test(resultado(naoImg, p1)?.erro ?? ""), JSON.stringify(naoImg));
  }
  const inexistente = await json(await fotos([[p1, `${base}TESTE-nao-existe-${sufixo}.png`]]));
  check("link que dá 404 é recusado", resultado(inexistente, p1)?.status === "erro" && (await produto(p1)).imagem_url === null, JSON.stringify(inexistente));

  console.log("\n--- Baixar de verdade ---");
  const ok = await json(await fotos([[p1, urlFoto]]));
  check("baixa, converte e grava (status ok)", resultado(ok, p1)?.status === "ok", JSON.stringify(ok));
  const urlNova = (await produto(p1)).imagem_url;
  guardar(urlNova);
  check("a foto fica na pasta da PRÓPRIA loja e vira .webp", !!urlNova?.startsWith(prefixoA) && urlNova.endsWith(".webp"), urlNova);
  const arq = await fetch(urlNova);
  const meta = await sharp(Buffer.from(await arq.arrayBuffer())).metadata();
  check("arquivo publicado é webp e foi reduzido (2400x1600 → 1200x800)", arq.status === 200 && /image\/webp/.test(arq.headers.get("content-type") ?? "") && meta.width === 1200 && meta.height === 800, `${arq.status} ${meta.format} ${meta.width}x${meta.height}`);

  const denovo = await json(await fotos([[p1, urlFoto]]));
  check("produto que já tem foto: 'mantida' (não baixa de novo)", resultado(denovo, p1)?.status === "mantida" && (await produto(p1)).imagem_url === urlNova);
  const troca = await json(await fotos([[p1, urlFoto]], { substituir: true }));
  const urlTrocada = (await produto(p1)).imagem_url;
  guardar(urlTrocada);
  check("com 'substituir' a foto é trocada", resultado(troca, p1)?.status === "ok" && urlTrocada !== urlNova, JSON.stringify(troca));
  // (a URL pública pode continuar respondendo um tempo por causa do cache da CDN: confere na listagem do storage)
  const noStorage = ((await db.storage.from("produtos").list(`${A.id}/produtos`, { limit: 100 })).data ?? []).map((f) => f.name);
  check("o arquivo antigo é apagado do storage e o novo está lá", !noStorage.includes(urlNova.split("/").pop()) && noStorage.includes(urlTrocada.split("/").pop()), noStorage.join());

  const lote = await json(await fotos([[p2, urlFoto], [p3, "https://10.0.0.1/x.png"], [p4, urlFoto], [p1, urlFoto]]));
  guardar((await produto(p2)).imagem_url);
  check("lote misto: ok / erro / mantida / mantida", resultado(lote, p2)?.status === "ok" && resultado(lote, p3)?.status === "erro" && resultado(lote, p4)?.status === "mantida" && resultado(lote, p1)?.status === "mantida", JSON.stringify(lote));

  console.log("\n--- Planilha com coluna de link ---");
  // p1, p2 e p4 já têm foto; p3 ainda não. Nomes iguais aos deles viram "repetidos do estoque".
  const csv = Buffer.from(
    [
      "imagem;nome;link_imagem;preco",
      `;TESTE Produto Novo Com Foto ${sufixo};${urlFoto};5,00`,
      `;TESTE Produto Novo Sem Foto ${sufixo};;6,00`,
      `;TESTE Foto Tres ${sufixo};${urlFoto};7,00`,
      `;TESTE Foto Quatro ${sufixo};${urlFoto};7,00`,
      `;TESTE Link Ruim ${sufixo};isto nao e link;7,00`,
      `;TESTE Link Http ${sufixo};http://exemplo.com/a.png;7,00`,
    ].join("\r\n"),
  );
  const imp = async (modo, mapa, extra = {}) => {
    const form = new FormData();
    form.set("arquivo", new File([csv], "fotos.csv"));
    form.set("modo", modo);
    if (mapa) form.set("mapeamento", JSON.stringify(mapa));
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    const r = await chamar(cA, "/api/produtos/importar", { method: "POST", body: form });
    return { status: r.status, j: await json(r) };
  };
  const lido = await imp("ler");
  check("coluna 'link_imagem' é reconhecida (a coluna 'imagem' vazia NÃO é confundida com ela)", lido.j?.sugestao?.imagem === 2 && lido.j?.sugestao?.nome === 1, JSON.stringify(lido.j?.sugestao));
  const previa = await imp("previa", lido.j.sugestao);
  const err = (l) => previa.j?.erros?.find((e) => e.linha === l)?.erro ?? "";
  check("prévia conta as linhas com link de foto (3 válidas)", previa.j?.avisos?.linhasComFoto === 3, JSON.stringify(previa.j?.avisos));
  check("link que não é endereço vira erro (linha 6)", /Link da imagem inválido/.test(err(6)), err(6));
  check("link http:// vira erro (precisa ser https, linha 7)", /Link da imagem inválido/.test(err(7)), err(7));
  check("linhas repetidas do estoque aparecem como repetidas (2)", previa.j?.repetidos?.length === 2, JSON.stringify(previa.j?.repetidos?.map((r) => r.linha)));

  const conf = await imp("confirmar", lido.j.sugestao);
  check("confirmar: 2 produtos novos, 2 repetidos pulados, 2 linhas com erro fora", conf.j?.criados === 2 && conf.j?.pulados === 2, JSON.stringify(conf.j)?.slice(0, 300));
  const alvo = (nome) => conf.j?.fotos?.find((f) => f.nome === nome);
  const novoComFoto = alvo(`TESTE Produto Novo Com Foto ${sufixo}`);
  check("foto do produto NOVO entra na lista de fotos a baixar", !!novoComFoto && novoComFoto.url === urlFoto);
  check("linha sem link não gera foto", !alvo(`TESTE Produto Novo Sem Foto ${sufixo}`));
  const paraP3 = conf.j?.fotos?.find((f) => f.produto_id === p3);
  check("repetido cujo produto NÃO tem foto: a foto vai para o produto que já existe", !!paraP3 && paraP3.url === urlFoto, JSON.stringify(conf.j?.fotos));
  check("repetido cujo produto JÁ tem foto: não entra (sem 'substituir')", !conf.j?.fotos?.some((f) => f.produto_id === p4));
  check("total de fotos a baixar: 2 (novo + produto existente sem foto)", conf.j?.fotos?.length === 2, String(conf.j?.fotos?.length));
  const idNovos = (await db.from("produtos").select("id").eq("tenant_id", A.id).ilike("nome", `TESTE Produto Novo%${sufixo}`)).data?.length;
  check("os repetidos não duplicaram produtos (2 novos no banco)", idNovos === 2, String(idNovos));

  const baixadas = await json(await fotos((conf.j?.fotos ?? []).map((f) => [f.produto_id, f.url])));
  check("a tela baixa a lista devolvida pela importação (todas ok)", baixadas?.resultados?.length === 2 && baixadas.resultados.every((r) => r.status === "ok"), JSON.stringify(baixadas));
  for (const f of conf.j?.fotos ?? []) guardar((await produto(f.produto_id)).imagem_url);
  const novoId = novoComFoto.produto_id;
  check("produto novo ficou com a foto na pasta da loja; p3 também", (await produto(novoId)).imagem_url?.startsWith(prefixoA) && (await produto(p3)).imagem_url?.startsWith(prefixoA));

  console.log("\n--- Só aproveitar as fotos (tudo repetido) e 'substituir' ---");
  const soRepetidos = await imp("confirmar", lido.j.sugestao);
  check("reimportar o mesmo arquivo: nada é criado e nenhum produto precisa de foto (422)", soRepetidos.status === 422, String(soRepetidos.status));
  const csvSo = Buffer.from(["nome;link_imagem", `TESTE Foto Quatro ${sufixo};${urlFoto}`].join("\r\n"));
  const impSo = async (extra) => {
    const form = new FormData();
    form.set("arquivo", new File([csvSo], "so.csv"));
    form.set("modo", "confirmar");
    form.set("mapeamento", JSON.stringify({ nome: 0, imagem: 1 }));
    for (const [k, v] of Object.entries(extra)) form.set(k, v);
    const r = await chamar(cA, "/api/produtos/importar", { method: "POST", body: form });
    return { status: r.status, j: await json(r) };
  };
  const semSub = await impSo({});
  check("arquivo só com repetido que já tem foto: nada a fazer (422)", semSub.status === 422, `${semSub.status} ${JSON.stringify(semSub.j)}`);
  const comSub = await impSo({ substituir_fotos: "1" });
  check("com 'substituir': arquivo só de repetidos ainda gera a foto do produto existente (200)", comSub.status === 200 && comSub.j?.criados === 0 && comSub.j?.fotos?.length === 1 && comSub.j.fotos[0].produto_id === p4, JSON.stringify(comSub.j)?.slice(0, 300));

  console.log("\n--- Catálogo: aviso só para o admin da loja ---");
  const pagina = async (cookie, slug) => {
    const r = await chamar(cookie, `/c/${slug}`);
    return { status: r.status, txt: r.status === 200 ? await r.text() : "" };
  };
  const visto = await pagina(cA, A.slug);
  check("admin da loja vê 'produtos sem foto' com o botão de importar", visto.status === 200 && /sem foto/.test(visto.txt) && /Importar fotos por planilha/.test(visto.txt));
  const publico = await pagina(null, A.slug);
  check("visitante do catálogo NÃO vê o aviso", publico.status === 200 && !/Importar fotos por planilha/.test(publico.txt));
  const outraLoja = await pagina(cB, A.slug);
  check("admin de OUTRA loja não vê o aviso no catálogo alheio", outraLoja.status === 200 && !/Importar fotos por planilha/.test(outraLoja.txt));
  const operador = await pagina(cOp, A.slug);
  check("operador não vê o aviso", operador.status === 200 && !/Importar fotos por planilha/.test(operador.txt));

  // apaga também as fotos que a API gravou na pasta das lojas de teste
  for (const id of [p1, p2, p3, p4, pB]) guardar((await produto(id))?.imagem_url);
  const { data: todas } = await db.from("produtos").select("imagem_url").in("tenant_id", [A.id, B.id]);
  for (const t of todas ?? []) guardar(t.imagem_url);
}

await executar(principal);
