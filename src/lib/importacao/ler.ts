import ExcelJS from "exceljs";
import { CAMPOS, type Celula, type Mapeamento, type Planilha } from "./tipos";

const ZIP_MAGIC = [0x50, 0x4b]; // "PK": .xlsx é um zip

/** Decodifica CSV em UTF-8 (com ou sem BOM); se houver bytes inválidos, cai para ISO-8859-1 (Excel antigo). */
function decodificar(buf: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("iso-8859-1").decode(buf);
  }
}

/** Separador mais frequente na primeira linha (fora das aspas). */
function detectarSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
  const cont: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let aspas = false;
  for (const c of primeira) {
    if (c === '"') aspas = !aspas;
    else if (!aspas && c in cont) cont[c]++;
  }
  return Object.entries(cont).sort((a, b) => b[1] - a[1])[0][0];
}

/** CSV (RFC 4180): aspas duplas, "" escapa aspas, quebra de linha dentro de campo entre aspas. */
function lerCsv(texto: string): string[][] {
  const sep = detectarSeparador(texto);
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

function celulaXlsx(v: ExcelJS.CellValue): Celula {
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if ("result" in v) return celulaXlsx(v.result as ExcelJS.CellValue); // fórmula: vale o resultado
  if ("richText" in v) return v.richText.map((t) => t.text).join("");
  if ("text" in v) return String(v.text); // hyperlink
  return ""; // erro de célula (#N/A...)
}

async function lerXlsx(buf: Buffer): Promise<Celula[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);
  const aba = wb.worksheets[0];
  if (!aba) throw new Error("A planilha não tem nenhuma aba");
  const linhas: Celula[][] = [];
  aba.eachRow({ includeEmpty: true }, (row) => {
    const valores: Celula[] = [];
    for (let c = 1; c <= aba.actualColumnCount; c++) valores.push(celulaXlsx(row.getCell(c).value));
    linhas.push(valores);
  });
  return linhas;
}

/** Lê CSV ou XLSX (detecta pelo conteúdo, não pelo nome). A 1ª linha é o cabeçalho. */
export async function lerPlanilha(buf: Buffer): Promise<Planilha> {
  const ehXlsx = buf[0] === ZIP_MAGIC[0] && buf[1] === ZIP_MAGIC[1];
  const todas: Celula[][] = ehXlsx ? await lerXlsx(buf) : lerCsv(decodificar(buf));
  const vazia = (l: Celula[]) => l.every((c) => String(c).trim() === "");
  const semVazias = todas.filter((l) => !vazia(l));
  if (semVazias.length === 0) throw new Error("A planilha está vazia");
  const [cab, ...linhas] = semVazias;
  return { colunas: cab.map((c) => String(c).trim()), linhas };
}

const normaliza = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Sugere o mapeamento pelo nome do cabeçalho (o usuário pode corrigir na tela). */
export function sugerirMapeamento(colunas: string[]): Mapeamento {
  const norm = colunas.map(normaliza);
  const usadas = new Set<number>();
  const mapa: Mapeamento = {};
  for (const campo of CAMPOS) {
    const i = norm.findIndex((n, idx) => !usadas.has(idx) && (campo.apelidos as readonly string[]).includes(n));
    mapa[campo.id] = i >= 0 ? i : null;
    if (i >= 0) usadas.add(i);
  }
  return mapa;
}
