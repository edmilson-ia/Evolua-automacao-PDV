// Gerador de "PIX Copia e Cola" / QR estático (BR Code, padrão EMV do Banco Central).
// Não confirma pagamento: o QR estático apenas leva ao pagador chave + valor.

export type PixConfig = { chave: string; cidade: string };

const tlv = (id: string, value: string) => id + String(value.length).padStart(2, "0") + value;

/** CRC16-CCITT (poly 0x1021, init 0xFFFF) exigido no campo 63. */
function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** O padrão só aceita ASCII sem acentos nos campos de nome e cidade. */
const ascii = (s: string, max: number) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, max);

export function gerarTxid(): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

export function gerarPayloadPix(p: {
  chave: string;
  nome: string;
  cidade: string;
  valor: number;
  txid?: string;
}): string {
  const conta = tlv("26", tlv("00", "br.gov.bcb.pix") + tlv("01", p.chave.trim()));
  const corpo =
    tlv("00", "01") +
    tlv("01", "11") + // 11 = QR estático
    conta +
    tlv("52", "0000") +
    tlv("53", "986") + // BRL
    (p.valor > 0 ? tlv("54", p.valor.toFixed(2)) : "") +
    tlv("58", "BR") +
    tlv("59", ascii(p.nome, 25) || "LOJA") +
    tlv("60", ascii(p.cidade, 15) || "BRASIL") +
    tlv("62", tlv("05", ascii(p.txid ?? "", 25).replace(/ /g, "") || "***")) +
    "6304";
  return corpo + crc16(corpo);
}
