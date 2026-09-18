import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, lerToken } from "@/lib/session";

// Primeira barreira (rápida, só confere a assinatura do cookie). As rotas de API e as páginas
// sensíveis conferem a sessão de novo (exigirApi / exigirPagina): a checagem final fica junto dos dados.

// Abertas a qualquer pessoa
const PUBLICO = [
  /^\/login$/,
  /^\/setup$/,
  /^\/recuperar-senha$/,
  /^\/catalogo(\/|$)/,
  /^\/offline$/,
  /^\/manifest\.webmanifest$/,
  /^\/sw\.js$/,
  /^\/pwa\/icon\//,
  /^\/api\/auth\//,
];

// O que o perfil "operador" (caixa) pode acessar. Todo o resto é só do administrador.
const OPERADOR_PAGINAS = [/^\/pdv$/, /^\/pdv\/vendas$/];
const OPERADOR_API: { metodo: string; caminho: RegExp }[] = [
  { metodo: "GET", caminho: /^\/api\/produtos$/ },
  { metodo: "GET", caminho: /^\/api\/vendas$/ },
  { metodo: "POST", caminho: /^\/api\/vendas$/ },
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLICO.some((r) => r.test(pathname))) return NextResponse.next();

  const ehApi = pathname.startsWith("/api/");
  const sessao = await lerToken(req.cookies.get(COOKIE_SESSAO)?.value);

  if (!sessao) {
    if (ehApi) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("de", pathname);
    return NextResponse.redirect(url);
  }

  if (sessao.perfil === "operador") {
    const liberado = ehApi
      ? OPERADOR_API.some((r) => r.metodo === req.method && r.caminho.test(pathname))
      : pathname === "/" || OPERADOR_PAGINAS.some((r) => r.test(pathname));
    if (!liberado) {
      return ehApi
        ? NextResponse.json({ error: "Sem permissão" }, { status: 403 })
        : NextResponse.redirect(new URL("/pdv", req.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  // Não passa por arquivos estáticos do Next nem por imagens/arquivos públicos
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|map|txt)$).*)"],
};
