// Testa o "Link de acesso da equipe" (Configurações → Usuários): o link certo para o administrador, o endereço
// público (atrás do Traefik), isolamento entre lojas e o fluxo real do funcionário que entra por esse link.
// Uso (servidor rodando): node --env-file=.env.local scripts/test-link-equipe.mjs
// Cria lojas/usuários "TESTE", apaga tudo por id no final e compara o banco antes x depois.
import { criarLoja, criarUsuario, login, chamar, check, executar, sufixo } from "./_helpers.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function principal() {
  const A = await criarLoja(`teste-la-${sufixo}`, `TESTE Loja Equipe A ${sufixo}`, "#0f766e");
  const B = await criarLoja(`teste-lb-${sufixo}`, `TESTE Loja Equipe B ${sufixo}`, "#be123c");
  const tel = (n) => `1195510${n}${sufixo.slice(0, 3)}`;
  const adminA = await criarUsuario({ nome: `TESTE AdminA ${sufixo}`, telefone: tel(1), perfil: "admin", tenantId: A.id, slug: A.slug });
  const funcA = await criarUsuario({ nome: `TESTE Func ${sufixo}`, telefone: tel(2), perfil: "operador", tenantId: A.id, slug: A.slug });
  const adminB = await criarUsuario({ nome: `TESTE AdminB ${sufixo}`, telefone: tel(3), perfil: "admin", tenantId: B.id, slug: B.slug });
  const [cA, cFunc, cB] = await Promise.all([login(adminA, A.slug), login(funcA, A.slug), login(adminB, B.slug)]);
  const pagina = async (cookie, cabecalhos = {}) => {
    const r = await chamar(cookie, "/configuracoes/usuarios", { headers: cabecalhos });
    return { status: r.status, html: r.status === 200 ? await r.text() : "" };
  };

  console.log("--- Cartão do link para o administrador ---");
  const a = await pagina(cA);
  check("tela de Usuários mostra 'Link de acesso da equipe (colaboradores)'", a.status === 200 && /Link de acesso da equipe \(colaboradores\)/.test(a.html));
  check(`o link é o login DA LOJA: ${BASE}/c/<loja>/login`, a.html.includes(`value="${BASE}/c/${A.slug}/login"`), a.html.match(/value="[^"]*\/login"/)?.[0]);
  check("tem os botões Copiar, WhatsApp e QR Code", /Copiar link/.test(a.html) && /Enviar por WhatsApp/.test(a.html) && /Mostrar QR Code/.test(a.html));
  check("tem o passo a passo de instalar no Android e no iPhone", /Como o funcionário instala/.test(a.html) && /Adicionar à Tela de Início/.test(a.html));
  check("o WhatsApp leva o nome da loja e o link (mensagem pronta)", a.html.includes("https://wa.me/?text=") && a.html.includes(encodeURIComponent(`TESTE Loja Equipe A ${sufixo}`)) && a.html.includes(encodeURIComponent(`/c/${A.slug}/login`)));

  console.log("\n--- Endereço público (site publicado atrás do Traefik) ---");
  const pub = await pagina(cA, { "x-forwarded-host": "pdv.exemplo.com.br", "x-forwarded-proto": "https" });
  check("usa o endereço público informado pelo proxy (https://pdv.exemplo.com.br/...)", pub.html.includes(`value="https://pdv.exemplo.com.br/c/${A.slug}/login"`), pub.html.match(/value="[^"]*\/login"/)?.[0]);

  console.log("\n--- Isolamento e permissão ---");
  const b = await pagina(cB);
  check("o administrador da outra loja vê o link DELA, nunca o da loja A", b.status === 200 && b.html.includes(`/c/${B.slug}/login`) && !b.html.includes(`/c/${A.slug}/login`));
  check("funcionário (operador) NÃO abre a tela de Usuários (redireciona)", (await chamar(cFunc, "/configuracoes/usuarios")).status !== 200);
  check("sem login não abre (redireciona)", (await chamar(null, "/configuracoes/usuarios")).status === 307);

  console.log("\n--- O funcionário entra pelo link e só acessa o que o perfil permite ---");
  const telaLogin = await chamar(null, `/c/${A.slug}/login`);
  const htmlLogin = await telaLogin.text();
  check("o link abre o login da loja com o nome dela", telaLogin.status === 200 && htmlLogin.includes(`TESTE Loja Equipe A ${sufixo}`));
  check("funcionário entra e abre o PDV", (await chamar(cFunc, "/pdv")).status === 200);
  check("funcionário vê vendas, caixa e clientes", (await chamar(cFunc, "/pdv/vendas")).status === 200 && (await chamar(cFunc, "/caixa")).status === 200 && (await chamar(cFunc, "/clientes")).status === 200);
  check("funcionário NÃO acessa Estoque, Dashboard, Usuários nem configurações", [(await chamar(cFunc, "/estoque")).status, (await chamar(cFunc, "/dashboard")).status, (await chamar(cFunc, "/configuracoes/usuarios")).status, (await chamar(cFunc, "/configuracoes/pagamentos")).status].every((s) => s !== 200));
  check("funcionário não recebe preço de custo pela API", !("preco_custo" in (((await (await chamar(cFunc, "/api/produtos")).json())[0]) ?? {})));
  check("o funcionário da loja A não entra pelo link da loja B", (await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loja: B.slug, identificador: funcA.telefone, senha: "TesteSenha#2026" }) })).status === 401);
}

await executar(principal);
