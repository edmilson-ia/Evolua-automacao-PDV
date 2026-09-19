import type { MetadataRoute } from "next";
import type { Branding } from "@/lib/tenant";

/** Muda quando logo/ícone/cor/nome mudam: usado para invalidar o cache dos ícones do PWA. */
export function iconeVersao(b: Branding): string {
  const base = `${b.icone_url ?? ""}|${b.logo_url ?? ""}|${b.cor_primaria ?? ""}|${b.nome_fantasia.charAt(0)}`;
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Ícone da loja. O slug vai na URL porque quem busca o ícone (instalação do app, iPhone) pode não mandar
 * cookie: a marca é pública, então o endereço da loja basta para o servidor saber qual desenhar.
 */
export function urlIcone(b: Branding, tamanho: 180 | 192 | 512, maskable = false): string {
  const loja = b.slug ? `&loja=${encodeURIComponent(b.slug)}` : "";
  return `/pwa/icon/${tamanho}?v=${iconeVersao(b)}${loja}${maskable ? "&maskable=1" : ""}`;
}

/** Nome sob o ícone na tela inicial (~12 caracteres): primeira palavra se o nome for longo. */
function nomeCurto(nome: string): string {
  if (nome.length <= 12) return nome;
  const primeira = nome.split(/\s+/)[0];
  return primeira.length <= 12 ? primeira : primeira.slice(0, 12);
}

/** Manifest do app instalado, com a marca da loja (white-label). */
export function montarManifest(b: Branding): MetadataRoute.Manifest {
  return {
    id: `/c/${b.slug}`,
    name: b.nome_fantasia,
    short_name: nomeCurto(b.nome_fantasia),
    description: "PDV, controle de estoque e catálogo de produtos",
    start_url: "/pdv",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    categories: ["business", "productivity", "shopping"],
    background_color: "#ffffff",
    theme_color: b.cor_primaria ?? "#2563eb",
    lang: "pt-BR",
    icons: [
      { src: urlIcone(b, 192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: urlIcone(b, 512), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: urlIcone(b, 512, true), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "PDV", url: "/pdv" },
      { name: "Estoque", url: "/estoque" },
      { name: "Catálogo", url: `/c/${b.slug}` },
    ],
  };
}
