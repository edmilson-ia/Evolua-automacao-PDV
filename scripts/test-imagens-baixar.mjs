// Testes do módulo que baixa imagens de links de planilha (src/lib/imagens): proteção contra acesso a rede interna
// (SSRF), limites de tamanho/tempo, redirecionamentos e conversão da imagem. Não precisa do servidor nem do banco.
// Uso:  node scripts/test-imagens-baixar.mjs   (o Node 22.18+/24 executa os .ts direto)
import http from "node:http";
import sharp from "sharp";
import { baixarImagem, ipBloqueado, normalizarLinkDrive } from "../src/lib/imagens/baixar.ts";
import { converterParaWebp } from "../src/lib/imagens/processar.ts";

let ok = 0;
let falhas = 0;
function check(nome, cond, extra = "") {
  if (cond) ok++;
  else falhas++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${nome}${!cond && extra ? `  -> ${extra}` : ""}`);
}
const recusa = async (link, opcoes) => {
  try {
    await baixarImagem(link, opcoes);
    return null;
  } catch (e) {
    return e;
  }
};

const png = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#e11d48" } }).png().toBuffer();
const grande = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#0f766e" } }).jpeg().toBuffer();

// ---------- servidor local só para o teste ----------
const servidor = http.createServer((req, res) => {
  const caminho = new URL(req.url, "http://x").pathname;
  if (caminho === "/ok.png") return res.writeHead(200, { "Content-Type": "image/png" }).end(png);
  if (caminho === "/pagina.html") return res.writeHead(200, { "Content-Type": "text/html" }).end("<html>login</html>");
  if (caminho === "/erro") return res.writeHead(404).end("nada");
  if (caminho === "/enorme.png") return res.writeHead(200, { "Content-Type": "image/png" }).end(Buffer.alloc(6 * 1024 * 1024, 1));
  if (caminho === "/enorme-sem-tamanho.png") {
    res.writeHead(200, { "Content-Type": "image/png", "Transfer-Encoding": "chunked" });
    const mandar = () => res.write(Buffer.alloc(1024 * 1024, 1), () => setImmediate(mandar));
    return mandar();
  }
  if (caminho === "/vazia.png") return res.writeHead(200, { "Content-Type": "image/png" }).end();
  if (caminho === "/lento.png") return; // nunca responde
  if (caminho === "/redir") return res.writeHead(302, { Location: "/ok.png" }).end();
  if (caminho === "/redir-interno") return res.writeHead(302, { Location: "https://169.254.169.254/latest/meta-data/" }).end();
  if (caminho === "/redir-http") return res.writeHead(302, { Location: "http://127.0.0.1:9/x.png" }).end();
  if (caminho === "/laco") return res.writeHead(302, { Location: "/laco" }).end();
  if (caminho === "/grande.jpg") return res.writeHead(200, { "Content-Type": "image/jpeg" }).end(grande);
  res.writeHead(404).end();
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const host = `127.0.0.1:${servidor.address().port}`;
const local = (p) => `http://${host}${p}`;
const liberar = { permitir: [host] };

console.log("--- Endereços proibidos (IP) ---");
const proibidos = ["127.0.0.1", "127.9.9.9", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1", "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:7f00:1", "::127.0.0.1", "64:ff9b::7f00:1", "2001:db8::1", "lixo"];
for (const ip of proibidos) check(`bloqueia ${ip}`, ipBloqueado(ip) === true);
const publicos = ["8.8.8.8", "1.1.1.1", "142.250.79.110", "172.32.0.1", "172.15.0.1", "100.63.0.1", "2607:f8b0:4004:c1b::64", "2a00:1450:4001:81b::200e", "::ffff:8.8.8.8"];
for (const ip of publicos) check(`libera ${ip} (público)`, ipBloqueado(ip) === false);

console.log("\n--- Links proibidos ---");
for (const link of [
  "http://exemplo.com/a.png", "ftp://exemplo.com/a.png", "file:///etc/passwd", "javascript:alert(1)", "data:image/png;base64,AAAA",
  "https://127.0.0.1/a.png", "https://localhost/a.png", "https://[::1]/a.png", "https://[::ffff:127.0.0.1]/a.png",
  "https://169.254.169.254/latest/meta-data/", "https://10.1.2.3/a.png", "https://192.168.0.10/a.png",
  "https://2130706433/a.png", "https://0x7f.1/a.png", "https://0177.0.0.1/a.png",
  "https://usuario:senha@exemplo.com/a.png", "https://exemplo.com:8443/a.png", "https://exemplo.com:22/a.png", "isso nao e link", "",
]) {
  const e = await recusa(link);
  check(`recusa ${link || "(vazio)"}`, e?.name === "ErroImagem", e ? `${e.name}: ${e.message}` : "baixou!");
}
const semNome = await recusa("https://este-dominio-nao-existe-evolua-teste.invalid/a.png");
check("domínio que não existe dá erro amigável (não vaza detalhe técnico)", semNome?.name === "ErroImagem" && !/ENOTFOUND|getaddrinfo/.test(semNome.message), semNome?.message);

console.log("\n--- Links do Google Drive ---");
check("file/d/ID/view vira link de download", normalizarLinkDrive("https://drive.google.com/file/d/1q57DgsEEMCEBFUZeleVIJJuGwWZo8iIe/view?usp=sharing") === "https://drive.google.com/uc?export=view&id=1q57DgsEEMCEBFUZeleVIJJuGwWZo8iIe");
check("open?id=ID vira link de download", normalizarLinkDrive("https://drive.google.com/open?id=1q57DgsEEMCEBFUZeleVIJJuGwWZo8iIe") === "https://drive.google.com/uc?export=view&id=1q57DgsEEMCEBFUZeleVIJJuGwWZo8iIe");
const uc = "https://drive.google.com/uc?export=view&id=1q57DgsEEMCEBFUZeleVIJJuGwWZo8iIe";
check("link uc?export=view (o da planilha) fica como está", normalizarLinkDrive(uc) === uc);
check("link de outro site não é alterado", normalizarLinkDrive("https://exemplo.com/a.png") === "https://exemplo.com/a.png");

console.log("\n--- Download (servidor local liberado só neste teste) ---");
const b = await baixarImagem(local("/ok.png"), liberar);
check("baixa a imagem", Buffer.compare(b, png) === 0);
check("segue redirecionamento válido", Buffer.compare(await baixarImagem(local("/redir"), liberar), png) === 0);
check("SEM a liberação do teste o mesmo endereço local é recusado", (await recusa(local("/ok.png"), {}))?.name === "ErroImagem");
check("liberar um host não libera OUTRA porta", (await recusa(`http://127.0.0.1:1/ok.png`, liberar))?.name === "ErroImagem");
const ri = await recusa(local("/redir-interno"), liberar);
check("redirecionamento para endereço interno é recusado", ri?.name === "ErroImagem" && /não é permitido/.test(ri.message), ri?.message);
check("redirecionamento para http/local não liberado é recusado", (await recusa(local("/redir-http"), liberar))?.name === "ErroImagem");
check("laço de redirecionamentos é interrompido", /redirecionamentos/.test((await recusa(local("/laco"), liberar))?.message ?? ""));
check("página HTML (link privado do Drive) é recusada com dica", /não é uma imagem/.test((await recusa(local("/pagina.html"), liberar))?.message ?? ""));
check("erro 404 vira mensagem clara", /erro 404/.test((await recusa(local("/erro"), liberar))?.message ?? ""));
check("imagem acima de 5 MB (com tamanho declarado) é recusada", /5 MB/.test((await recusa(local("/enorme.png"), liberar))?.message ?? ""));
const t0 = Date.now();
check("imagem sem tamanho declarado que passa de 5 MB é cortada", /5 MB/.test((await recusa(local("/enorme-sem-tamanho.png"), liberar))?.message ?? "") && Date.now() - t0 < 8000);
check("imagem vazia é recusada", /vazia/.test((await recusa(local("/vazia.png"), liberar))?.message ?? ""));
const t1 = Date.now();
const lento = await recusa(local("/lento.png"), { ...liberar, timeoutMs: 800 });
check("servidor que nunca responde é abortado no tempo limite", /Tempo esgotado/.test(lento?.message ?? "") && Date.now() - t1 < 3000, `${lento?.message} em ${Date.now() - t1}ms`);

console.log("\n--- Conversão (sharp) ---");
const webp = await converterParaWebp(png);
const meta = await sharp(webp).metadata();
check("PNG vira WEBP", meta.format === "webp" && meta.width === 30 && meta.height === 20);
const reduzida = await sharp(await converterParaWebp(grande)).metadata();
check("imagem grande (3000x2000) é reduzida para no máximo 1200 px", reduzida.width === 1200 && reduzida.height === 800, `${reduzida.width}x${reduzida.height}`);
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script><rect width="10" height="10"/></svg>');
check("SVG é recusado (pode carregar script)", (await converterParaWebp(svg).catch((e) => e))?.name === "ErroImagem");
check("bytes aleatórios são recusados com mensagem amigável", /não é uma imagem válida/.test((await converterParaWebp(Buffer.from("isto não é uma imagem de verdade")).catch((e) => e))?.message ?? ""));
check("HTML disfarçado de imagem é recusado", (await converterParaWebp(Buffer.from("<html><body>oi</body></html>")).catch((e) => e))?.name === "ErroImagem");
const metadadosOriginais = await sharp(png).withMetadata({ exif: { IFD0: { Copyright: "SEGREDO-NO-EXIF" } } }).jpeg().toBuffer();
const semExif = await converterParaWebp(metadadosOriginais);
check("metadados (EXIF) da origem não são guardados", !semExif.includes(Buffer.from("SEGREDO-NO-EXIF")));

servidor.close();
console.log(`\nResultado: ${ok} passaram, ${falhas} falharam`);
process.exit(falhas ? 1 : 0);
