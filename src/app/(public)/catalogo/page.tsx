import Link from "next/link";
import type { Metadata } from "next";
import { getSessao } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getBranding, getTenantId } from "@/lib/tenant";
import { listarCategorias } from "@/lib/categorias";
import { brl } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { nome_fantasia } = await getBranding();
  return { title: `Catálogo — ${nome_fantasia}`, description: `Confira os produtos de ${nome_fantasia}` };
}

type ProdutoPublico = {
  id: string;
  nome: string;
  descricao: string | null;
  imagem_url: string | null;
  preco_venda: number;
  unidade: string;
  quantidade: number;
  categoria_id: string | null;
};

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; q?: string }>;
}) {
  const { cat, q } = await searchParams;
  const branding = await getBranding();
  const categorias = await listarCategorias();
  // Seta "voltar às opções": só para quem trabalha no sistema. O cliente que abre o link público não vê.
  const sessao = await getSessao();
  const voltar = sessao ? { href: sessao.perfil === "admin" ? "/dashboard" : "/pdv", rotulo: sessao.perfil === "admin" ? "Voltar ao painel" : "Voltar ao PDV" } : null;

  // Somente colunas públicas: nunca expor preço de custo nem estoque exato.
  let query = createServerClient()
    .from("produtos")
    .select("id, nome, descricao, imagem_url, preco_venda, unidade, quantidade, categoria_id")
    .eq("tenant_id", getTenantId())
    .eq("ativo", true)
    .eq("visivel_catalogo", true)
    .order("nome");
  if (cat) query = query.eq("categoria_id", cat);
  if (q) query = query.ilike("nome", `%${q}%`);
  const { data } = await query;
  const produtos = (data ?? []) as ProdutoPublico[];

  const cor = branding.cor_primaria ?? "#2563eb";
  const chip = (ativo: boolean) =>
    `whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium ${
      ativo ? "text-white border-transparent" : "border-gray-300 bg-white text-gray-700"
    }`;

  return (
    <div className="min-h-screen bg-gray-50" style={{ ["--cor" as string]: cor }}>
      <header className="text-white" style={{ background: cor }}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-6 sm:px-6">
          {voltar && (
            <Link
              href={voltar.href}
              aria-label={voltar.rotulo}
              title={voltar.rotulo}
              className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-white/20 pl-2.5 pr-2.5 text-white hover:bg-white/30 sm:pr-4"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
              <span className="hidden text-sm font-medium sm:inline">Voltar</span>
            </Link>
          )}
          {branding.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo_url} alt={branding.nome_fantasia} className="h-12 w-auto rounded bg-white/90 p-1" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 text-xl font-bold">
              {branding.nome_fantasia.charAt(0)}
            </span>
          )}
          <div>
            <h1 className="text-xl font-bold leading-tight sm:text-2xl">{branding.nome_fantasia}</h1>
            <p className="text-sm text-white/80">Catálogo de produtos</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <form className="mb-4">
          {cat && <input type="hidden" name="cat" value={cat} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Buscar produto"
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3"
          />
        </form>

        {categorias.length > 0 && (
          <nav className="mb-5 flex gap-2 overflow-x-auto pb-1">
            <Link href={q ? `?q=${encodeURIComponent(q)}` : "?"} className={chip(!cat)} style={!cat ? { background: cor } : undefined}>
              Todos
            </Link>
            {categorias.map((c) => (
              <Link
                key={c.id}
                href={`?cat=${c.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={chip(cat === c.id)}
                style={cat === c.id ? { background: cor } : undefined}
              >
                {c.nome}
              </Link>
            ))}
          </nav>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
          {produtos.map((p) => {
            const esgotado = p.quantidade <= 0;
            return (
              <article key={p.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="relative aspect-square bg-gray-100">
                  {p.imagem_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imagem_url} alt={p.nome} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl font-bold text-gray-300">
                      {p.nome.charAt(0).toUpperCase()}
                    </div>
                  )}
                  {esgotado && (
                    <span className="absolute left-2 top-2 rounded-full bg-gray-900/80 px-2.5 py-1 text-xs font-medium text-white">
                      Esgotado
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <h2 className="line-clamp-2 text-sm font-medium leading-snug sm:text-base">{p.nome}</h2>
                  {p.descricao && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{p.descricao}</p>}
                  <p className="mt-2 text-lg font-bold" style={{ color: cor }}>
                    {brl(Number(p.preco_venda))}
                    <span className="ml-1 text-xs font-normal text-gray-500">/{p.unidade}</span>
                  </p>
                </div>
              </article>
            );
          })}
        </div>

        {produtos.length === 0 && (
          <p className="py-16 text-center text-gray-500">Nenhum produto encontrado.</p>
        )}
      </main>

      <footer className="py-6 text-center text-xs text-gray-400">
        Catálogo por Evolua Automação
      </footer>
    </div>
  );
}
