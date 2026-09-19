import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/**
 * Baixa uma imagem de um link informado por uma PLANILHA. Como o endereço vem de fora, o servidor só pode
 * ser usado para buscar imagens públicas da internet, nunca para chegar em rede interna (SSRF):
 *  - só https, sem usuário/senha e só na porta padrão;
 *  - o endereço IP é conferido NA HORA DA CONEXÃO (não dá para trocar o DNS depois da checagem);
 *  - cada redirecionamento (até 5) passa pelas mesmas regras;
 *  - limite de tamanho e de tempo.
 * Este arquivo não importa nada do Next nem do projeto: dá para testá-lo direto pelo Node.
 */
export const LIMITE_BYTES_IMAGEM = 5 * 1024 * 1024;
export const TEMPO_MAXIMO_MS = 12_000;
const MAX_REDIRECIONAMENTOS = 5;

/** Erro com mensagem própria para mostrar ao usuário (o resto vira "falha ao baixar"). */
export class ErroImagem extends Error {
  name = "ErroImagem";
}

export type OpcoesDownload = {
  /** Só para TESTES: hosts "ip:porta" liberados (servidor local do teste). A API nunca passa isto. */
  permitir?: string[];
  timeoutMs?: number;
};

// ---------- links do Google Drive ----------

/** Aceita os formatos comuns de link do Drive e devolve o de download direto da imagem. */
export function normalizarLinkDrive(link: string): string {
  const arquivo = link.match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]{10,})/i);
  if (arquivo) return `https://drive.google.com/uc?export=view&id=${arquivo[1]}`;
  const abrir = link.match(/^https:\/\/drive\.google\.com\/open\?(?:[^#]*&)?id=([\w-]{10,})/i);
  if (abrir) return `https://drive.google.com/uc?export=view&id=${abrir[1]}`;
  return link;
}

// ---------- endereços que o servidor NUNCA pode acessar ----------

function ipv4Bloqueado(ip: string): boolean {
  const [a, b, c] = ip.split(".").map(Number);
  return (
    a === 0 || // "esta rede"
    a === 10 ||
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local e metadados de nuvem (169.254.169.254)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // testes de rede
    a >= 224 // multicast e reservados
  );
}

/** Expande um IPv6 para 8 grupos de 16 bits (aceita "::" e IPv4 embutido). */
function ipv6Grupos(ip: string): number[] | null {
  let texto = ip.split("%")[0].toLowerCase();
  const v4 = texto.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const [a, b, c, d] = v4[1].split(".").map(Number);
    texto = texto.slice(0, -v4[1].length) + `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [inicio, fim, resto] = texto.split("::");
  if (resto !== undefined) return null;
  const esq = inicio ? inicio.split(":") : [];
  const dir = fim === undefined ? [] : fim ? fim.split(":") : [];
  const faltam = 8 - esq.length - dir.length;
  if ((fim === undefined && faltam !== 0) || faltam < 0) return null;
  const todos = [...esq, ...Array(fim === undefined ? 0 : faltam).fill("0"), ...dir].map((g) => parseInt(g, 16));
  return todos.length === 8 && todos.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffff) ? todos : null;
}

/** true = endereço proibido (interno, reservado ou que não conseguimos interpretar). */
export function ipBloqueado(ip: string): boolean {
  if (net.isIPv4(ip)) return ipv4Bloqueado(ip);
  if (!net.isIPv6(ip)) return true;
  const g = ipv6Grupos(ip);
  if (!g) return true;
  if (g.every((n) => n === 0)) return true; // ::
  if (g.slice(0, 7).every((n) => n === 0) && g[7] === 1) return true; // ::1
  // IPv4 dentro de IPv6: ::ffff:a.b.c.d (mapeado) e ::a.b.c.d (compatível): vale a regra do IPv4
  if (g.slice(0, 5).every((n) => n === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return ipv4Bloqueado(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
  }
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 endereços locais únicos
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentação
  if (g[0] === 0x0064 && g[1] === 0xff9b) return true; // NAT64: pode levar a IPv4 interno
  return false;
}

// ---------- validação da URL ----------

function validarUrl(texto: string, permitir: string[]): URL {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    throw new ErroImagem("Link de imagem inválido");
  }
  const liberado = permitir.includes(url.host);
  if (!liberado) {
    if (url.protocol !== "https:") throw new ErroImagem("O link precisa começar com https://");
    if (url.username || url.password) throw new ErroImagem("Link com usuário e senha não é aceito");
    if (url.port && url.port !== "443") throw new ErroImagem("Porta do link não é aceita");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!liberado && net.isIP(host) && ipBloqueado(host)) throw new ErroImagem("Endereço do link não é permitido");
  return url;
}

/** DNS que recusa endereço interno: a checagem vale para o IP que será REALMENTE usado na conexão. */
function lookupSeguro(permitir: string[], hostPorta: string) {
  return (hostname: string, opcoes: { all?: boolean } | number | undefined, cb: (...a: unknown[]) => void) => {
    const querTodos = typeof opcoes === "object" && opcoes?.all === true;
    dnsLookup(hostname, { all: true }, (err, enderecos) => {
      if (err) return cb(err);
      const liberado = permitir.includes(hostPorta);
      if (!liberado && enderecos.some((e) => ipBloqueado(e.address))) {
        return cb(new ErroImagem("Endereço do link não é permitido"));
      }
      if (querTodos) return cb(null, enderecos);
      cb(null, enderecos[0].address, enderecos[0].family);
    });
  };
}

// ---------- download ----------

type Resposta = { redirecionar: string } | { corpo: Buffer };

function pedir(url: URL, permitir: string[], ms: number): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    if (ms <= 0) return reject(new ErroImagem("Tempo esgotado ao baixar a imagem"));
    const cliente = url.protocol === "http:" ? http : https;
    const req = cliente.request(
      url,
      {
        method: "GET",
        headers: { "User-Agent": "EvoluaPDV-ImportadorDeFotos/1.0", Accept: "image/*" },
        lookup: lookupSeguro(permitir, url.host) as never,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
          res.resume();
          return resolve({ redirecionar: res.headers.location });
        }
        if (status !== 200) {
          res.resume();
          return reject(new ErroImagem(`O endereço da imagem respondeu com erro ${status}`));
        }
        const tipo = String(res.headers["content-type"] ?? "").toLowerCase();
        if (!tipo.startsWith("image/")) {
          res.resume();
          return reject(new ErroImagem("O link não é uma imagem (se for do Drive, deixe a foto como \"Qualquer pessoa com o link\")"));
        }
        if (Number(res.headers["content-length"]) > LIMITE_BYTES_IMAGEM) {
          res.resume();
          return reject(new ErroImagem("Imagem acima de 5 MB"));
        }
        const partes: Buffer[] = [];
        let total = 0;
        res.on("data", (parte: Buffer) => {
          total += parte.length;
          if (total > LIMITE_BYTES_IMAGEM) {
            req.destroy(new ErroImagem("Imagem acima de 5 MB"));
            return;
          }
          partes.push(parte);
        });
        res.on("end", () => resolve({ corpo: Buffer.concat(partes) }));
        res.on("error", reject);
      },
    );
    const prazo = setTimeout(() => req.destroy(new ErroImagem("Tempo esgotado ao baixar a imagem")), ms);
    req.on("close", () => clearTimeout(prazo));
    req.on("error", (e) => reject(e instanceof ErroImagem ? e : new ErroImagem("Não foi possível baixar a imagem deste link")));
    req.end();
  });
}

/** Baixa a imagem do link (segue até 5 redirecionamentos, todos validados). Devolve os bytes originais. */
export async function baixarImagem(link: string, opcoes: OpcoesDownload = {}): Promise<Buffer> {
  const permitir = opcoes.permitir ?? [];
  const fim = Date.now() + (opcoes.timeoutMs ?? TEMPO_MAXIMO_MS);
  let atual = validarUrl(normalizarLinkDrive(link.trim()), permitir);
  for (let salto = 0; salto <= MAX_REDIRECIONAMENTOS; salto++) {
    const r = await pedir(atual, permitir, fim - Date.now());
    if ("corpo" in r) {
      if (r.corpo.length === 0) throw new ErroImagem("A imagem veio vazia");
      return r.corpo;
    }
    atual = validarUrl(new URL(r.redirecionar, atual).toString(), permitir);
  }
  throw new ErroImagem("Link com redirecionamentos demais");
}
