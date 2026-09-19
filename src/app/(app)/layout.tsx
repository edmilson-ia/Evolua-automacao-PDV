import Link from "next/link";
import InstallPwaButton from "@/components/pwa/InstallPwaButton";
import LogoutButton from "@/components/auth/LogoutButton";
import { exigirPagina } from "@/lib/auth";
import { mostraAtalhoDoDono } from "@/lib/donoPlataforma";
import FaixaTeste from "@/components/teste/FaixaTeste";
import { getBranding, getTeste } from "@/lib/tenant";
import type { PerfilLoja } from "@/lib/session";

const links = (slug: string): { href: string; label: string; perfis: PerfilLoja[] }[] => [
  { href: "/dashboard", label: "Dashboard", perfis: ["admin"] },
  { href: "/pdv", label: "PDV", perfis: ["admin", "operador"] },
  { href: "/pdv/vendas", label: "Vendas", perfis: ["admin", "operador"] },
  { href: "/caixa", label: "Caixa", perfis: ["admin", "operador"] },
  { href: "/estoque", label: "Estoque", perfis: ["admin"] },
  { href: "/clientes", label: "Clientes", perfis: ["admin", "operador"] },
  { href: `/c/${slug}`, label: "Catálogo", perfis: ["admin", "operador"] },
  { href: "/configuracoes/branding", label: "Marca", perfis: ["admin"] },
  { href: "/configuracoes/pagamentos", label: "Pagamentos", perfis: ["admin"] },
  { href: "/configuracoes/impressao", label: "Impressão", perfis: ["admin"] },
  { href: "/configuracoes/usuarios", label: "Usuários", perfis: ["admin"] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessao = await exigirPagina();
  const [b, teste] = await Promise.all([getBranding(sessao.tenantId), getTeste(sessao.tenantId)]);
  return (
    <div className="min-h-screen bg-gray-50 pt-[env(safe-area-inset-top)]">
      <FaixaTeste teste={teste} />
      <header className="border-b border-gray-200 bg-white print:hidden">
        {/* Celular: o menu rola para o lado. Computador estreito: quebra em duas linhas. Os itens NUNCA encolhem (shrink-0), senão o nome da loja invade o "Dashboard". */}
        <nav className="mx-auto flex max-w-6xl items-center gap-x-4 gap-y-1 overflow-x-auto p-3 sm:px-6 md:flex-wrap md:overflow-visible">
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap font-bold text-brand">
            {b.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logo_url} alt="" className="h-8 w-auto shrink-0" />
            )}
            {b.nome_fantasia}
          </span>
          {links(b.slug)
            .filter((l) => l.perfis.includes(sessao.perfil))
            .concat(mostraAtalhoDoDono(b.slug, sessao.perfil) ? [{ href: "/plataforma/login", label: "Plataforma", perfis: ["admin"] }] : [])
            .map((l) => (
            <Link key={l.href} href={l.href} className="shrink-0 whitespace-nowrap py-2 text-sm font-medium text-gray-700 hover:text-brand">
              {l.label}
            </Link>
          ))}
          <span className="ml-auto flex shrink-0 items-center gap-3 whitespace-nowrap">
            <InstallPwaButton className="whitespace-nowrap rounded-lg border border-brand px-3 py-1 text-sm font-medium text-brand hover:bg-gray-50" />
            <span className="hidden text-sm text-gray-600 sm:inline">
              {sessao.nome} · {sessao.perfil === "admin" ? "Administrador" : "Operador"}
            </span>
            <LogoutButton className="rounded-lg border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50" />
          </span>
        </nav>
      </header>
      {children}
    </div>
  );
}
