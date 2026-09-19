// Testes do PERÍODO DE TESTE grátis das lojas: criação com dias de teste, produtos de exemplo, avisos, bloqueio ao vencer
// (sem apagar nada), prorrogar, ativar, permissões e isolamento. Uso (servidor rodando, migration 0011 aplicada):
//   node --env-file=.env.local scripts/test-teste-gratis.mjs      (leva ~40 s: espera o cache de 30 s da loja)
// Cria lojas/usuários "TESTE", apaga tudo por id no final e compara o banco antes x depois (inclui a loja real).
import { criarLoja, criarUsuario, login, chamar, enviar, check, executar, criados, db, sufixo } from "./_helpers.mjs";

const json = (r) => r.json().catch(() => null);
const SENHA = "SenhaBoa#2026";
const DIA_MS = 24 * 3600 * 1000;
const diaSP = (d) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const fimDoDia = (d) => new Date(`${diaSP(d)}T23:59:59-03:00`);
const fimEsperado = (dias) => fimDoDia(new Date(Date.now() + (dias - 1) * DIA_MS));
const igual = (iso, esperado) => Math.abs(new Date(iso) - esperado) < 1000;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function principal() {
  const A = await criarLoja(`teste-ga-${sufixo}`, `TESTE Loja Gratis A ${sufixo}`, "#0f766e"); // definitiva (criada direto no banco)
  const tel = (n) => `1195530${n}${sufixo.slice(0, 3)}`;
  const adminA = await criarUsuario({ nome: `TESTE AdminA ${sufixo}`, telefone: tel(1), perfil: "admin", tenantId: A.id, slug: A.slug });
  const dono = await criarUsuario({ nome: `TESTE Dono ${sufixo}`, telefone: tel(9), perfil: "super_admin", tenantId: null, slug: "plataforma" });
  const [cA, cDono] = await Promise.all([login(adminA, A.slug), login(dono, null)]);

  let n = 0;
  const criarLojaPelaApi = async (extra = {}) => {
    n++;
    const slug = `teste-g${n}-${sufixo}`;
    const r = await enviar(cDono, "/api/plataforma/lojas", "POST", {
      nome_fantasia: `TESTE Gratis ${n} ${sufixo}`, slug,
      admin: { nome: `TESTE Admin${n} ${sufixo}`, telefone: tel(n), senha: SENHA }, ...extra,
    });
    const j = await json(r);
    if (j?.id) criados.lojas.push(j.id);
    return { status: r.status, j, slug, tel: tel(n) };
  };
  const linhaDaLoja = async (id) => (await db.from("tenants").select("teste_ate, ativo").eq("id", id).single()).data;
  const cont = async (tabela, tenant) => (await db.from(tabela).select("id", { count: "exact", head: true }).eq("tenant_id", tenant)).count;
  const patch = (id, corpo, cookie = cDono) => enviar(cookie, `/api/plataforma/lojas/${id}`, "PATCH", corpo);

  console.log("--- Criar loja com período de teste ---");
  const padrao = await criarLojaPelaApi();
  check("sem informar os dias: teste de 7 dias por padrão (até o fim do 7º dia)", padrao.status === 201 && igual(padrao.j?.teste_ate, fimEsperado(7)), JSON.stringify(padrao.j));
  check("sem pedir exemplos: loja nasce vazia", padrao.j?.exemplos === 0 && (await cont("produtos", padrao.j.id)) === 0);
  const demo = await criarLojaPelaApi({ dias_teste: 14, com_exemplos: true });
  check("14 dias de teste gravados (fim do dia, horário de São Paulo)", demo.status === 201 && igual((await linhaDaLoja(demo.j.id)).teste_ate, fimEsperado(14)));
  check("com exemplos: 20 produtos e 4 categorias na loja nova", demo.j?.exemplos === 20 && (await cont("produtos", demo.j.id)) === 20 && (await cont("categorias", demo.j.id)) === 4, JSON.stringify(demo.j));
  const { data: ex } = await db.from("produtos").select("sku, preco_venda, preco_custo, quantidade, visivel_catalogo").eq("tenant_id", demo.j.id);
  check("produtos de exemplo têm preço, estoque e aparecem no catálogo", ex.every((p) => Number(p.preco_venda) > Number(p.preco_custo) && p.visivel_catalogo) && ex.some((p) => Number(p.quantidade) === 0) && ex.every((p) => /^EX-\d{3}$/.test(p.sku)));
  const definitiva = await criarLojaPelaApi({ dias_teste: 0 });
  check("0 dias = loja definitiva (sem prazo)", definitiva.status === 201 && definitiva.j?.teste_ate === null && (await linhaDaLoja(definitiva.j.id)).teste_ate === null);
  for (const [rotulo, dias] of [["91 dias", 91], ["-1 dia", -1], ["texto", "abc"], ["1,5 dia", 1.5]]) {
    const r = await criarLojaPelaApi({ dias_teste: dias });
    check(`dias de teste inválidos (${rotulo}) são recusados (400)`, r.status === 400, JSON.stringify(r.j));
  }
  check("admin de loja NÃO cria loja (403)", (await enviar(cA, "/api/plataforma/lojas", "POST", {})).status === 403);

  console.log("\n--- Avisos nas telas ---");
  const cDemo = await login({ telefone: demo.tel }, demo.slug, SENHA);
  const painel = await chamar(cDemo, "/dashboard");
  const html = painel.status === 200 ? await painel.text() : "";
  check("painel mostra 'Teste grátis: faltam 14 dias'", painel.status === 200 && /Teste grátis/.test(html) && /faltam 14 dias/.test(html), html.slice(0, 80));
  const cDef = await login({ telefone: definitiva.tel }, definitiva.slug, SENHA);
  const painelDef = await chamar(cDef, "/dashboard");
  check("loja definitiva NÃO mostra faixa de teste", painelDef.status === 200 && !/Teste grátis/.test(await painelDef.text()));
  const pdv = await chamar(cDemo, "/pdv");
  const htmlPdv = pdv.status === 200 ? await pdv.text() : "";
  check("PDV mostra o aviso de teste no rodapé", pdv.status === 200 && /Teste grátis/.test(htmlPdv));
  const pagPlataforma = await chamar(cDono, "/plataforma");
  const htmlPlat = (await pagPlataforma.text()).replace(/<!-- -->/g, ""); // o React separa textos com comentários
  check("/plataforma mostra o teste de cada loja e os botões de link", /TESTE: 14 dias/.test(htmlPlat) && /Prorrogar teste/.test(htmlPlat) && /Copiar link do catálogo/.test(htmlPlat) && /Sem teste \(loja definitiva\)/.test(htmlPlat));

  console.log("\n--- Teste vencido: bloqueia sem apagar nada ---");
  // Loja SÓ para este fluxo: nenhuma requisição autenticada antes de vencer (o cache de 30 s ainda não guardou "ativa")
  const venc = await criarLojaPelaApi({ dias_teste: 7, com_exemplos: true });
  const cVenc = await login({ telefone: venc.tel }, venc.slug, SENHA); // entra ANTES de vencer
  await db.from("tenants").update({ teste_ate: new Date(Date.now() - 3600 * 1000).toISOString() }).eq("id", venc.j.id);
  const semAcesso = await chamar(cVenc, "/api/produtos");
  check("sessão já aberta perde o acesso quando o teste vence", semAcesso.status !== 200, String(semAcesso.status));
  const painelVenc = await chamar(cVenc, "/dashboard");
  check("painel não abre mais (redireciona para o login)", painelVenc.status === 307);
  const tentativa = await chamar(null, "/api/auth/login", { method: "POST", body: JSON.stringify({ loja: venc.slug, identificador: venc.tel, senha: SENHA }) });
  const msg = await json(tentativa);
  check("login recusado com a mensagem de teste encerrado (403)", tentativa.status === 403 && /período de teste/.test(msg?.error ?? ""), JSON.stringify(msg));
  const paginaLogin = await chamar(null, `/c/${venc.slug}/login`);
  check("tela de login da loja avisa 'Teste encerrado'", paginaLogin.status === 200 && /Teste encerrado/.test(await paginaLogin.text()));
  check("catálogo público sai do ar (404)", (await chamar(null, `/c/${venc.slug}`)).status === 404);
  check("manifest do app da loja sai do ar (404)", (await chamar(null, `/c/${venc.slug}/manifest.webmanifest`)).status === 404);
  check("NADA foi apagado: 20 produtos e o administrador continuam lá", (await cont("produtos", venc.j.id)) === 20 && (await linhaDaLoja(venc.j.id)).ativo === true);
  check("/plataforma marca 'TESTE VENCIDO'", /TESTE VENCIDO/.test((await (await chamar(cDono, "/plataforma")).text()).replace(/<!-- -->/g, "")));

  console.log("\n--- Prorrogar e ativar ---");
  const antesDefinitiva = await linhaDaLoja(definitiva.j.id);
  const antesA = await linhaDaLoja(A.id);
  const pror = await json(await patch(venc.j.id, { acao: "prorrogar", dias: 3 }));
  check("prorrogar teste VENCIDO por 3 dias conta a partir de hoje (fim do 3º dia)", igual(pror?.teste_ate, fimEsperado(3)), JSON.stringify(pror));
  const voltou = await chamar(cVenc, "/api/produtos");
  check("a MESMA sessão volta a funcionar na hora (cache limpo)", voltou.status === 200, String(voltou.status));
  check("catálogo público volta ao ar", (await chamar(null, `/c/${venc.slug}`)).status === 200);
  const fimAntes = (await linhaDaLoja(venc.j.id)).teste_ate;
  const pror2 = await json(await patch(venc.j.id, { acao: "prorrogar", dias: 5 }));
  check("prorrogar teste ATIVO soma 5 dias ao fim atual", igual(pror2?.teste_ate, fimDoDia(new Date(new Date(fimAntes).getTime() + 5 * DIA_MS))), JSON.stringify(pror2));
  check("prorrogar: 0, 91 e texto são recusados (400)", (await patch(venc.j.id, { acao: "prorrogar", dias: 0 })).status === 400 && (await patch(venc.j.id, { acao: "prorrogar", dias: 91 })).status === 400 && (await patch(venc.j.id, { acao: "prorrogar", dias: "x" })).status === 400);
  const defPror = await patch(definitiva.j.id, { acao: "prorrogar", dias: 7 });
  check("loja definitiva não tem teste para prorrogar (400)", defPror.status === 400 && /definitiva/.test((await json(defPror))?.error ?? ""));
  check("loja que não existe: 404; id inválido: 400", (await patch("00000000-0000-4000-8000-000000000999", { acao: "prorrogar", dias: 2 })).status === 404 && (await patch("nao-e-uuid", { acao: "ativar" })).status === 400);
  check("admin de loja NÃO prorroga nem ativa (403)", (await patch(venc.j.id, { acao: "prorrogar", dias: 9 }, cA)).status === 403 && (await patch(venc.j.id, { acao: "ativar" }, cA)).status === 403);
  check("sem login não prorroga", (await patch(venc.j.id, { acao: "ativar" }, null)).status === 401);
  const ativou = await json(await patch(venc.j.id, { acao: "ativar" }));
  check("ativar remove o prazo (loja definitiva)", ativou?.teste_ate === null && (await linhaDaLoja(venc.j.id)).teste_ate === null);
  const painelAtivo = await chamar(cVenc, "/dashboard");
  check("depois de ativar a faixa de teste some", painelAtivo.status === 200 && !/Teste grátis/.test(await painelAtivo.text()));
  const suspender = await patch(venc.j.id, { ativo: false });
  check("suspender continua funcionando (independe do teste)", suspender.status === 200 && (await chamar(cVenc, "/api/produtos")).status !== 200);
  await patch(venc.j.id, { ativo: true });
  check("as outras lojas não foram alteradas (definitiva e loja A)", JSON.stringify(await linhaDaLoja(definitiva.j.id)) === JSON.stringify(antesDefinitiva) && JSON.stringify(await linhaDaLoja(A.id)) === JSON.stringify(antesA));

  console.log("\n--- O bloqueio vale em até 30 segundos (cache) ---");
  const lento = await criarLojaPelaApi({ dias_teste: 7 });
  const cLento = await login({ telefone: lento.tel }, lento.slug, SENHA);
  check("loja em teste funciona normalmente", (await chamar(cLento, "/api/produtos")).status === 200);
  await db.from("tenants").update({ teste_ate: new Date(Date.now() - 1000).toISOString() }).eq("id", lento.j.id);
  await dormir(31_000);
  check("31 s depois de vencer, a sessão que estava aberta é barrada", (await chamar(cLento, "/api/produtos")).status !== 200);
  void adminA;
}

await executar(principal);
