import type { MetadataRoute } from "next";
import { iconeVersao } from "@/lib/pwa";
import { BRANDING_PADRAO, getBranding } from "@/lib/tenant";

// Dinâmico: nome, cor e ícones vêm do branding do cliente (white-label).
export const dynamic = "force-dynamic";

/** Nome sob o ícone na tela inicial (~12 caracteres): primeira palavra se o nome for longo. */
function nomeCurto(nome: string): string {
  if (nome.length <= 12) return nome;
  const primeira = nome.split(/\s+/)[0];
  return primeira.length <= 12 ? primeira : primeira.slice(0, 12);
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const b = await getBranding();
  const v = iconeVersao(b);
  const cor = b.cor_primaria ?? BRANDING_PADRAO.cor_primaria!;
  return {
    id: "/pdv",
    name: b.nome_fantasia,
    short_name: nomeCurto(b.nome_fantasia),
    description: "PDV, controle de estoque e catálogo de produtos",
    start_url: "/pdv",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: cor,
    lang: "pt-BR",
    icons: [
      { src: `/pwa/icon/192?v=${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/pwa/icon/512?v=${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/pwa/icon/512?v=${v}&maskable=1`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "PDV", url: "/pdv" },
      { name: "Estoque", url: "/estoque" },
      { name: "Catálogo", url: "/catalogo" },
    ],
  };
}
