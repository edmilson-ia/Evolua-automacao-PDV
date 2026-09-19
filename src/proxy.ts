import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, lerToken } from "@/lib/session";

// Primeira barreira (rápida, só confere a assinatura do cookie). As rotas de API e as páginas
// sensíveis conferem a sessão de novo (exigirApi / exigirPagina): a checagem final fica junto dos dados.
// A LOJA nunca é decidida aqui: vem do token assinado, dentro de cada rota.

// Abertas a qualquer pessoa
const PUBLICO = [
  /^\/login$/,
  /^\/recuperar-senha$/,
  /^\/c\//, // catálogo, login e manifest de cada loja (/c/<slug>/...)
  /^\/offline$/,
  /^\/manifest\.webmanifest$/,
  /^\/sw\.js$/,
  /^\/pwa\/icon\//,
  /^\/api\/auth\//,
  /^\/plataforma\/login$/,
  /^\/plataforma\/setup$/,
  /^\/api\/plataforma\/setup$/,
];

// Área do dono da plataforma (super-admin): só ele entra, e ele não entra em mais nada.
const ehPlataforma = (p: string) => p === "/plataforma" || p.startsWith("/plataforma/") || p.startsWith("/api/plataforma/");

// O que o perfil "operador" (caixa) pode acessar. Todo o resto é só do administrador da loja.
const OPERADOR_PAGINAS = [/^\/pdv$/, /^\/pdv\/vendas$/, /^\/clientes(\/novo)?$/, /^\/caixa(\/[0-9a-f-]{36})?$/i];
const OPERADOR_API: { metodo: string; caminho: RegExp }[] = [
  { metodo: "GET", caminho: /^\/api\/produtos$/ },
  { metodo: "GET", caminho: /^\/api\/vendas$/ },
  { metodo: "POST", caminho: /^\/api\/vendas$/ },
  { metodo: "GET", caminho: /^\/api\/clientes$/ },
  { metodo: "POST", caminho: /^\/api\/clientes$/ },
  { metodo: "GET", caminho: /^\/api\/caixa$/ },
  { metodo: "POST", caminho: /^\/api\/caixa$/ },
  { metodo: "POST", caminho: /^\/api\/caixa\/[0-9a-f-]{36}\/(movimentos|fechar)$/i },
];

const negar = (req: NextRequest, ehApi: boolean, destino: string) =>
  ehApi ? NextResponse.json({ error: "Sem permissão" }, { status: 403 }) : NextResponse.redirect(new URL(destino, req.url));

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICO.some((r) => r.test(pathname))) return NextResponse.next();

  const ehApi = pathname.startsWith("/api/");
  const sessao = await lerToken(req.cookies.get(COOKIE_SESSAO)?.value);

  if (!sessao) {
    if (ehApi) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const url = new URL(ehPlataforma(pathname) ? "/plataforma/login" : "/login", req.url);
    if (pathname !== "/" && !ehPlataforma(pathname)) url.searchParams.set("de", pathname);
    return NextResponse.redirect(url);
  }

  if (sessao.perfil === "super_admin") {
    return ehPlataforma(pathname) || pathname === "/" ? NextResponse.next() : negar(req, ehApi, "/plataforma");
  }
  if (ehPlataforma(pathname)) return negar(req, ehApi, "/");

  if (sessao.perfil === "operador") {
    const liberado = ehApi
      ? OPERADOR_API.some((r) => r.metodo === req.method && r.caminho.test(pathname))
      : pathname === "/" || OPERADOR_PAGINAS.some((r) => r.test(pathname));
    if (!liberado) return negar(req, ehApi, "/pdv");
  }
  return NextResponse.next();
}

export const config = {
  // Não passa por arquivos estáticos do Next nem por imagens/arquivos públicos
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|map|txt)$).*)"],
};
