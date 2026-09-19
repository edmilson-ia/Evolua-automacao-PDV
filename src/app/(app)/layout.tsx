import Link from "next/link";
import InstallPwaButton from "@/components/pwa/InstallPwaButton";
import LogoutButton from "@/components/auth/LogoutButton";
import { exigirPagina } from "@/lib/auth";
import { getBranding } from "@/lib/tenant";
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
  const b = await getBranding(sessao.tenantId);
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white print:hidden">
        <nav className="mx-auto flex max-w-6xl items-center gap-4 overflow-x-auto p-3 sm:px-6">
          <span className="flex items-center gap-2 whitespace-nowrap font-bold text-brand">
            {b.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.logo_url} alt="" className="h-8 w-auto" />
            )}
            {b.nome_fantasia}
          </span>
          {links(b.slug).filter((l) => l.perfis.includes(sessao.perfil)).map((l) => (
            <Link key={l.href} href={l.href} className="whitespace-nowrap text-sm font-medium text-gray-700 hover:text-brand">
              {l.label}
            </Link>
          ))}
          <span className="ml-auto flex items-center gap-3 whitespace-nowrap">
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
