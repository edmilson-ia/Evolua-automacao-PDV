/* Service worker do PWA (escrito à mão: o Next 16 usa Turbopack, que não roda plugins webpack de PWA).
 *
 * O que ele faz:
 *  - Páginas: rede primeiro (dado sempre atual); se a rede falhar, usa a última cópia; sem cópia, /offline.
 *  - Arquivos estáticos do app (/_next/static, ícones): cache primeiro, para abrir rápido e com internet ruim.
 *  - /api/*: NUNCA vai para o cache. Venda, estoque e busca precisam ser sempre reais. O PDV vende sem internet por
 *    conta própria: guarda o catálogo e as vendas no IndexedDB do aparelho (src/lib/offline), não aqui.
 *
 * Ao mudar a estratégia, aumente VERSION para limpar os caches antigos.
 */
const VERSION = "v3";
const PAGES = `evolua-pages-${VERSION}`;
const STATIC = `evolua-static-${VERSION}`;
const OFFLINE_URL = "/offline";
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fetchComTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      (res) => {
        clearTimeout(t);
        resolve(res);
      },
      (err) => {
        clearTimeout(t);
        reject(err);
      },
    );
  });
}

async function paginaRedePrimeiro(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetchComTimeout(request, NETWORK_TIMEOUT_MS);
    // Não guarda redirecionamentos (ex.: /pdv → /login): senão o cache serviria a tela de login no lugar do PDV
    if (res.ok && !res.redirected) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request)) || (await cache.match(OFFLINE_URL)) || Response.error();
  }
}

async function estaticoCachePrimeiro(request) {
  const cache = await caches.open(STATIC);
  const guardado = await cache.match(request);
  if (guardado) return guardado;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(paginaRedePrimeiro(request));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa/icon/")) {
    event.respondWith(estaticoCachePrimeiro(request));
  }
});
