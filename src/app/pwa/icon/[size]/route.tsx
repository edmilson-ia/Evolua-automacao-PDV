import { ImageResponse } from "next/og";
import sharp from "sharp";
import { BRANDING_PADRAO, getBranding } from "@/lib/tenant";

// Gera os ícones do PWA (PNG) a partir do branding do cliente:
//   1) ícone dedicado (icone_url): ocupa o quadrado inteiro;
//   2) senão, a logo sobre fundo branco, com margem;
//   3) senão, a inicial do nome sobre a cor da marca.
const TAMANHOS = new Set([180, 192, 512]);

async function imagemComoDataUrl(url: string, lado: number, fit: "cover" | "contain"): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    // sharp aceita png/jpg/webp e devolve sempre PNG (o renderizador de OG não lê webp)
    const png = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize(lado, lado, { fit, background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!TAMANHOS.has(size)) return new Response("Tamanho inválido", { status: 404 });

  const maskable = new URL(req.url).searchParams.get("maskable") === "1";
  const b = await getBranding();
  const cor = b.cor_primaria ?? BRANDING_PADRAO.cor_primaria!;

  let imagem: string | null = null;
  let lado = size;
  let fundo = cor;
  if (b.icone_url) {
    imagem = await imagemComoDataUrl(b.icone_url, size, "cover");
  } else if (b.logo_url) {
    // maskable: o sistema recorta até 20% das bordas, então a arte fica na "zona segura"
    lado = Math.round(size * (maskable ? 0.6 : 0.72));
    imagem = await imagemComoDataUrl(b.logo_url, lado, "contain");
    fundo = "#ffffff";
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: imagem ? fundo : cor,
        }}
      >
        {imagem ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imagem} width={lado} height={lado} alt="" />
        ) : (
          <span style={{ fontSize: size * 0.6, fontWeight: 700, color: "#ffffff" }}>
            {b.nome_fantasia.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=86400" }, // a URL leva ?v= e muda com o branding
    },
  );
}
