// Testa o atalho "Plataforma" do dono: a regra (quem vê) e as telas (link na tela "Qual é a sua loja?", lojas de cliente
// sem atalho, /plataforma/login aberto). Uso (servidor rodando): node --env-file=.env.local scripts/test-atalho-dono.mjs
// Cria lojas/usuários "TESTE", apaga tudo por id no final e compara o banco antes x depois.
import { criarLoja, criarUsuario, login, chamar, check, executar, sufixo } from "./_helpers.mjs";
import { lojasDoDono, mostraAtalhoDoDono } from "../src/lib/donoPlataforma.ts";

async function principal() {
  console.log("--- Regra: quem vê o atalho ---");
  check("sem loja configurada (lista vazia): ninguém vê", lojasDoDono("").length === 0 && lojasDoDono(" , ,").length === 0 && !mostraAtalhoDoDono("evolua", "admin", []));
  const lista = lojasDoDono(" Evolua , loja-b ,, ");
  check("a lista aceita vírgulas, espaços e maiúsculas", lista.join("|") === "evolua|loja-b", lista.join("|"));
  check("administrador da loja do dono VÊ", mostraAtalhoDoDono("evolua", "admin", lista) && mostraAtalhoDoDono("EVOLUA", "admin", lista) && mostraAtalhoDoDono("loja-b", "admin", lista));
  check("operador da loja do dono NÃO vê", !mostraAtalhoDoDono("evolua", "operador", lista));
  check("administrador de loja de CLIENTE não vê", !mostraAtalhoDoDono("loja-do-cliente", "admin", lista) && !mostraAtalhoDoDono("evolua-2", "admin", lista) && !mostraAtalhoDoDono("", "admin", lista));

  console.log("\n--- Telas ---");
  const A = await criarLoja(`teste-ad-${sufixo}`, `TESTE Loja Cliente ${sufixo}`, "#0f766e");
  const admin = await criarUsuario({ nome: `TESTE Admin ${sufixo}`, telefone: `1195500${sufixo.slice(0, 4)}`, perfil: "admin", tenantId: A.id, slug: A.slug });
  const cAdmin = await login(admin, A.slug);
  const painel = await chamar(cAdmin, "/dashboard");
  const html = painel.status === 200 ? await painel.text() : "";
  check("administrador de loja de cliente abre o painel SEM o atalho 'Plataforma'", painel.status === 200 && /Estoque/.test(html) && !/>Plataforma</.test(html) && !html.includes("/plataforma/login"));

  const trocar = await chamar(null, "/login?trocar=1");
  const htmlTrocar = await trocar.text();
  check("tela 'Qual é a sua loja?' tem o link 'Sou o dono da plataforma'", trocar.status === 200 && /Sou o dono da plataforma/.test(htmlTrocar) && htmlTrocar.includes('href="/plataforma/login"'));
  const entrada = await chamar(null, "/plataforma/login");
  check("/plataforma/login abre sem login", entrada.status === 200 && /Entrar na plataforma/.test(await entrada.text()));
  const comSessaoDeLoja = await chamar(cAdmin, "/plataforma/login");
  check("com uma sessão de LOJA aberta, /plataforma/login ainda abre (para entrar como dono)", comSessaoDeLoja.status === 200);
  check("administrador de loja NÃO abre /plataforma (redireciona)", (await chamar(cAdmin, "/plataforma")).status === 307);
  check("o login de uma loja de cliente não mostra o link do dono", !/Sou o dono da plataforma/.test(await (await chamar(null, `/c/${A.slug}/login`)).text()));
}

await executar(principal);
