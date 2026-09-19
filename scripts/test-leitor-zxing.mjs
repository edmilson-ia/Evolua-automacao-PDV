// Prova que a biblioteca da câmera (ZXing, usada no iPhone/Safari) LÊ códigos de barras de verdade: gera imagens de
// EAN-13, EAN-8 e Code 128, deforma como uma câmera faria (giro, desfoque, ruído) e confere os números lidos.
// Não precisa de servidor, banco nem câmera. Uso: node scripts/test-leitor-zxing.mjs
import sharp from "sharp";
import { mesmoCodigo } from "../src/lib/codigoBarras.ts";
import { BarcodeFormat, BinaryBitmap, DecodeHintType, HybridBinarizer, MultiFormatReader, RGBLuminanceSource } from "@zxing/library";

let ok = 0;
let falhas = 0;
const check = (nome, cond, extra = "") => {
  if (cond) ok++;
  else falhas++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${nome}${!cond && extra ? `  -> ${extra}` : ""}`);
};

// ---------- codificação EAN ----------
const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARIDADE = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

const ean13 = (c) => {
  const d = [...c].map(Number);
  const p = PARIDADE[d[0]];
  let bits = "101";
  for (let i = 0; i < 6; i++) bits += (p[i] === "L" ? L : G)[d[i + 1]];
  bits += "01010";
  for (let i = 7; i < 13; i++) bits += R[d[i]];
  return bits + "101";
};
const ean8 = (c) => {
  const d = [...c].map(Number);
  let bits = "101";
  for (let i = 0; i < 4; i++) bits += L[d[i]];
  bits += "01010";
  for (let i = 4; i < 8; i++) bits += R[d[i]];
  return bits + "101";
};

// Code 128 (subconjunto B, texto ASCII simples)
const C128 = ["212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412", "211214", "211232", "2331112"];
const code128 = (texto) => {
  const valores = [104, ...[...texto].map((ch) => ch.charCodeAt(0) - 32)];
  const soma = valores.reduce((s, v, i) => s + v * (i === 0 ? 1 : i), 0);
  valores.push(soma % 103, 106);
  let bits = "";
  for (const v of valores) {
    [...C128[v]].forEach((n, i) => (bits += (i % 2 === 0 ? "1" : "0").repeat(Number(n))));
  }
  return bits;
};

// ---------- imagem → leitura ----------
async function imagem(bits, { largura = 3, altura = 220, giro = 0, desfoque = 0, ruido = 0 } = {}) {
  const margem = 12 * largura;
  const w = bits.length * largura + margem * 2;
  const linha = Buffer.alloc(w, 255);
  [...bits].forEach((b, i) => { if (b === "1") linha.fill(0, margem + i * largura, margem + (i + 1) * largura); });
  const base = Buffer.alloc(w * altura);
  for (let y = 0; y < altura; y++) linha.copy(base, y * w);
  let img = sharp(base, { raw: { width: w, height: altura, channels: 1 } }).extend({ top: 60, bottom: 60, background: "#ffffff" });
  if (giro) img = img.rotate(giro, { background: "#ffffff" });
  if (desfoque) img = img.blur(desfoque);
  const { data, info } = await img.greyscale().raw().toBuffer({ resolveWithObject: true }); // 1 canal = tons de cinza
  if (ruido) for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() - 0.5) * ruido));
  return { data, w: info.width, h: info.height };
}

const avisar = console.warn;
function ler({ data, w, h }, formatos) {
  console.warn = () => {}; // a biblioteca avisa em cada tentativa que não achou nada: ruído
  const dicas = new Map([[DecodeHintType.POSSIBLE_FORMATS, formatos], [DecodeHintType.TRY_HARDER, true]]);
  const leitor = new MultiFormatReader();
  leitor.setHints(dicas);
  const fonte = new RGBLuminanceSource(new Uint8ClampedArray(data), w, h);
  try {
    return leitor.decode(new BinaryBitmap(new HybridBinarizer(fonte))).getText();
  } catch {
    return null;
  } finally {
    console.warn = avisar;
  }
}
const FORMATOS = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF];

console.log("--- EAN-13 (o código de produto mais comum no Brasil) ---");
const codigos = ["7894900011517", "7891000100103", "5901234123457", "7896036091111"];
for (const c of codigos) check(`lê ${c} (imagem limpa)`, ler(await imagem(ean13(c)), FORMATOS) === c);
check("dígito verificador errado (7896036091116) é RECUSADO em vez de lido errado", ler(await imagem(ean13("7896036091116")), FORMATOS) === null);
const upc = ler(await imagem(ean13("0036000291452")), FORMATOS);
check("EAN-13 com zero na frente é lido como UPC-A de 12 dígitos (comportamento padrão das câmeras)", upc === "036000291452", String(upc));
check("o sistema trata o UPC-A lido e o EAN-13 cadastrado como o MESMO código", mesmoCodigo(upc, "0036000291452") && mesmoCodigo("0036000291452", upc));
check("mas códigos diferentes continuam diferentes", !mesmoCodigo("036000291452", "0036000291453") && !mesmoCodigo("7894900011517", "7894900011518") && !mesmoCodigo("12345678", "012345678"));

console.log("\n--- Como uma câmera enxerga: giro, desfoque e ruído ---");
for (const [nome, opc] of [["girado 8°", { giro: 8 }], ["girado -12°", { giro: -12 }], ["levemente desfocado", { desfoque: 1.2 }], ["com ruído", { ruido: 60 }], ["girado + desfoque + ruído", { giro: 6, desfoque: 1, ruido: 40 }], ["pequeno (barras finas)", { largura: 2 }]]) {
  check(`EAN-13 ${nome}`, ler(await imagem(ean13("7894900011517"), opc), FORMATOS) === "7894900011517");
}

console.log("\n--- Outros formatos ---");
check("lê EAN-8 (96385074)", ler(await imagem(ean8("96385074")), FORMATOS) === "96385074");
check("lê Code 128 com letras e números (INT-0001)", ler(await imagem(code128("INT-0001")), FORMATOS) === "INT-0001");
check("lê Code 128 numérico (123456789012)", ler(await imagem(code128("123456789012")), FORMATOS) === "123456789012");

console.log("\n--- O que NÃO é código de barras ---");
const vazio = { data: Buffer.alloc(400 * 300, 255), w: 400, h: 300 };
check("imagem em branco não devolve código nenhum", ler(vazio, FORMATOS) === null);
const ruidoPuro = Buffer.alloc(400 * 300);
for (let i = 0; i < ruidoPuro.length; i++) ruidoPuro[i] = Math.random() * 255;
check("ruído aleatório não devolve código falso", ler({ data: ruidoPuro, w: 400, h: 300 }, FORMATOS) === null);

console.log(`\nResultado: ${ok} passaram, ${falhas} falharam`);
process.exit(falhas ? 1 : 0);
