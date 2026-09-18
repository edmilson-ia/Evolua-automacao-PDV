import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import PwaRegister from "@/components/pwa/PwaRegister";
import { iconeVersao } from "@/lib/pwa";
import { BRANDING_PADRAO, getBranding } from "@/lib/tenant";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const b = await getBranding();
  const v = iconeVersao(b);
  return {
    title: b.nome_fantasia,
    description: "PDV, controle de estoque e catálogo de produtos",
    applicationName: b.nome_fantasia,
    // iOS: abre em tela cheia quando adicionado à tela de início
    appleWebApp: { capable: true, title: b.nome_fantasia, statusBarStyle: "default" },
    icons: {
      icon: [{ url: `/pwa/icon/192?v=${v}`, sizes: "192x192", type: "image/png" }],
      apple: [{ url: `/pwa/icon/180?v=${v}`, sizes: "180x180", type: "image/png" }],
    },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const b = await getBranding();
  return {
    themeColor: b.cor_primaria ?? BRANDING_PADRAO.cor_primaria!,
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const b = await getBranding();
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ ["--brand" as string]: b.cor_primaria ?? BRANDING_PADRAO.cor_primaria }}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
