// Confere os requisitos para o navegador oferecer a INSTALAÇÃO do app no celular (PWA): manifest por loja, ícones nos
// tamanhos certos, service worker, tela offline, tags do iPhone e viewport. Não precisa de login nem de banco.
// Uso (servidor rodando; para o service worker de verdade use o build de produção): node --env-file=.env.local scripts/test-app-celular.mjs
import sharp from "sharp";
import { criarLoja, check, executar, sufixo } from "./_helpers.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const pegar = (caminho, init) => fetch(`${BASE}${caminho}`, init);

async function principal() {
  const L = await criarLoja(`teste-pw-${sufixo}`, `TESTE Loja do Celular ${sufixo}`, "#7c3aed");
  const urlManifest = `/c/${L.slug}/manifest.webmanifest`;

  console.log("--- Manifest da loja ---");
  const r = await pegar(urlManifest);
  const m = await r.json();
  check("manifest responde 200 como application/manifest+json", r.status === 200 && /manifest\+json/.test(r.headers.get("content-type") ?? ""));
  check("nome e cor são da LOJA (white-label)", m.name === L.nome && m.theme_color === "#7c3aed", `${m.name} ${m.theme_color}`);
  check("abre como app (display standalone) em português", m.display === "standalone" && m.lang === "pt-BR");
  check("start_url e escopo consistentes (o app abre o PDV)", m.start_url === "/pdv" && m.scope === "/" && m.id === `/c/${L.slug}`);
  check("nome curto para caber sob o ícone (até 12 caracteres)", typeof m.short_name === "string" && m.short_name.length > 0 && m.short_name.length <= 12, m.short_name);
  check("aceita qualquer orientação (celular em pé, tablet deitado)", m.orientation === "any");
  check("tem atalhos (PDV, Estoque, Catálogo) ao segurar o ícone", m.shortcuts?.length === 3 && m.shortcuts.every((a) => a.url.startsWith("/")));

  console.log("\n--- Ícones ---");
  for (const [rotulo, filtro, lado] of [["192", (i) => i.sizes === "192x192" && i.purpose === "any", 192], ["512", (i) => i.sizes === "512x512" && i.purpose === "any", 512], ["512 maskable (Android)", (i) => i.purpose === "maskable", 512]]) {
    const icone = m.icons.find(filtro);
    check(`manifest declara o ícone ${rotulo}`, !!icone);
    if (!icone) continue;
    const img = await pegar(icone.src);
    const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
    check(`ícone ${rotulo}: PNG ${lado}x${lado} de verdade`, img.status === 200 && /image\/png/.test(img.headers.get("content-type") ?? "") && meta.width === lado && meta.height === lado, `${img.status} ${meta.width}x${meta.height}`);
  }
  const apple = await pegar(`/pwa/icon/180?loja=${L.slug}`);
  const metaApple = await sharp(Buffer.from(await apple.arrayBuffer())).metadata();
  check("ícone do iPhone (180x180) responde sem cookie", apple.status === 200 && metaApple.width === 180 && metaApple.height === 180);

  console.log("\n--- Páginas: tags do iPhone e viewport ---");
  const html = await (await pegar(`/c/${L.slug}/login`)).text();
  check("página aponta para o manifest DA LOJA", html.includes(`/c/${L.slug}/manifest.webmanifest`) && /rel="manifest"/.test(html));
  check("tem apple-touch-icon", /rel="apple-touch-icon"/.test(html));
  check("iPhone: abre em tela cheia (apple-mobile-web-app-capable)", /apple-mobile-web-app-capable|mobile-web-app-capable/.test(html));
  check("viewport com viewport-fit=cover (usa a tela toda, respeitando o notch)", /viewport-fit=cover/.test(html) && /width=device-width/.test(html));
  check("theme-color da loja (barra do navegador)", /name="theme-color"[^>]*content="#7c3aed"/.test(html));

  console.log("\n--- Service worker e modo offline ---");
  const sw = await pegar("/sw.js");
  const swTexto = await sw.text();
  check("/sw.js responde 200 como JavaScript", sw.status === 200 && /javascript/.test(sw.headers.get("content-type") ?? ""));
  check("service worker trata 'fetch' (requisito para instalar)", /addEventListener\("fetch"/.test(swTexto));
  check("/api nunca vai para o cache do service worker", /startsWith\("\/api\/"\)/.test(swTexto));
  const off = await pegar("/offline");
  check("tela /offline existe (mostrada sem internet)", off.status === 200 && /Sem conexão/.test(await off.text()));

  console.log("\n--- Loja sem o app ---");
  check("loja que não existe: manifest 404", (await pegar("/c/nao-existe-xyz/manifest.webmanifest")).status === 404);
}

await executar(principal);
