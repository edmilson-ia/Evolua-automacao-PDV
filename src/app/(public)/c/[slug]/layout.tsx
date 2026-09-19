import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { urlIcone } from "@/lib/pwa";
import { getLojaPorSlug } from "@/lib/tenant";

type Params = { params: Promise<{ slug: string }> };

// Tudo sob /c/<slug> (catálogo, login) usa a marca DESTA loja, mesmo sem ninguém logado.
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const loja = await getLojaPorSlug((await params).slug);
  if (!loja) return {};
  return {
    title: loja.nome_fantasia,
    applicationName: loja.nome_fantasia,
    manifest: `/c/${loja.slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: loja.nome_fantasia, statusBarStyle: "default" },
    icons: {
      icon: [{ url: urlIcone(loja, 192), sizes: "192x192", type: "image/png" }],
      apple: [{ url: urlIcone(loja, 180), sizes: "180x180", type: "image/png" }],
    },
  };
}

export async function generateViewport({ params }: Params): Promise<Viewport> {
  const loja = await getLojaPorSlug((await params).slug);
  return { themeColor: loja?.cor_primaria ?? "#2563eb" };
}

export default async function LojaLayout({ children, params }: Params & { children: React.ReactNode }) {
  const loja = await getLojaPorSlug((await params).slug);
  if (!loja) notFound();
  // "contents": não interfere no layout, só troca a cor da marca (--brand) para o que estiver dentro
  return (
    <div className="contents" style={{ ["--brand" as string]: loja.cor_primaria ?? "#2563eb" }}>
      {children}
    </div>
  );
}
