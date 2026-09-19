import sharp from "sharp";

const FORMATOS = ["jpeg", "png", "webp", "gif"];
const erroImagem = (mensagem: string) => Object.assign(new Error(mensagem), { name: "ErroImagem" });

/**
 * Reprocessa qualquer imagem recebida: confere que é mesmo JPG/PNG/WEBP/GIF (SVG e outros são recusados),
 * corrige a rotação, reduz para no máximo 1200 px e salva como WEBP. Nada do arquivo original é guardado
 * (metadados, dados extras e formatos estranhos somem no processo).
 */
export async function converterParaWebp(entrada: Buffer): Promise<Buffer> {
  try {
    const imagem = sharp(entrada, { limitInputPixels: 40_000_000, failOn: "error" });
    const { format } = await imagem.metadata();
    if (!format || !FORMATOS.includes(format)) throw erroImagem("Formato de imagem não aceito (use JPG, PNG, WEBP ou GIF)");
    return await imagem
      .rotate()
      .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (e) {
    if (e instanceof Error && e.name === "ErroImagem") throw e;
    throw erroImagem("O arquivo não é uma imagem válida");
  }
}
