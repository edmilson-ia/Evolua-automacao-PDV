import { erroCodigoBarras, normalizarCodigoBarras } from "@/lib/codigoBarras";
import { parseValor } from "@/lib/format";
import type { Celula, DadosLinha, LinhaValidada, Mapeamento, Planilha } from "./tipos";

const texto = (c: Celula | undefined) => (c === undefined ? "" : String(c).trim());

/** Número BR ("12,50", "1.250,00", "R$ 3,5") ou número já vindo do XLSX. Vazio = null; inválido = NaN. */
function numero(c: Celula | undefined): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : NaN;
  const limpo = texto(c).replace(/^R\$\s*/i, "");
  if (limpo === "") return null;
  return parseValor(limpo) ?? NaN;
}

const MAX = { nome: 200, sku: 60, unidade: 10, descricao: 1000, categoria: 80 };

/**
 * Valida a planilha inteira, sem tocar no banco. Só os campos mapeados entram em `dados`.
 * Erros por linha (a linha 1 é o cabeçalho, então os dados começam na 2).
 */
export function validarLinhas(planilha: Planilha, mapa: Mapeamento): LinhaValidada[] {
  const vistos = new Map<string, number>();
  const codigosVistos = new Map<string, number>();
  const usadas = Object.values(mapa).filter((i): i is number => i != null);
  const linhasUteis = planilha.linhas.map((cels, idx) => ({ cels, idx })).filter(({ cels }) => usadas.some((i) => texto(cels[i]) !== ""));
  return linhasUteis.map(({ cels, idx }) => {
    const linha = idx + 2;
    const erros: string[] = [];
    const pega = (campo: keyof Mapeamento) => (mapa[campo] == null ? undefined : cels[mapa[campo] as number]);
    const mapeado = (campo: keyof Mapeamento) => mapa[campo] != null;

    const sku = texto(pega("sku"));
    if (!sku) { /* sem SKU: o sistema gera um */ }
    else if (sku.length > MAX.sku) erros.push(`SKU com mais de ${MAX.sku} caracteres`);
    else {
      const anterior = vistos.get(sku);
      if (anterior) erros.push(`SKU repetido na planilha (já aparece na linha ${anterior})`);
      else vistos.set(sku, linha);
    }

    const dados: DadosLinha = { sku };

    if (mapeado("nome")) {
      const nome = texto(pega("nome"));
      if (nome.length > MAX.nome) erros.push(`Nome com mais de ${MAX.nome} caracteres`);
      else if (nome) dados.nome = nome; // vazio: não altera (produto novo usa o SKU como nome)
    }
    if (mapeado("categoria")) {
      const cat = texto(pega("categoria"));
      if (cat.length > MAX.categoria) erros.push(`Categoria com mais de ${MAX.categoria} caracteres`);
      else dados.categoria = cat || null;
    }
    if (mapeado("unidade")) {
      const un = texto(pega("unidade"));
      if (un.length > MAX.unidade) erros.push(`Unidade com mais de ${MAX.unidade} caracteres`);
      else if (un) dados.unidade = un;
    }
    if (mapeado("descricao")) {
      const d = texto(pega("descricao"));
      if (d.length > MAX.descricao) erros.push(`Descrição com mais de ${MAX.descricao} caracteres`);
      else dados.descricao = d || null;
    }

    if (mapeado("codigo_barras")) {
      const codigo = normalizarCodigoBarras(texto(pega("codigo_barras")));
      const problema = codigo ? erroCodigoBarras(codigo) : null;
      if (problema) erros.push(problema);
      else if (codigo) {
        const anterior = codigosVistos.get(codigo);
        if (anterior) erros.push(`Código de barras repetido na planilha (já aparece na linha ${anterior})`);
        else {
          codigosVistos.set(codigo, linha);
          dados.codigo_barras = codigo; // vazio: não altera
        }
      }
    }

    if (mapeado("imagem")) {
      const link = texto(pega("imagem"));
      if (link.length > 2000) erros.push("Link da imagem grande demais");
      else if (link && !/^https:\/\//i.test(link)) erros.push(`Link da imagem inválido (precisa começar com https://): "${link.slice(0, 40)}"`);
      else if (link) dados.imagem_link = link; // vazio: não altera
    }

    const numericos = [
      ["preco_custo", "Preço de custo"],
      ["preco_venda", "Preço de venda"],
      ["quantidade", "Quantidade"],
      ["estoque_minimo", "Estoque mínimo"],
    ] as const;
    for (const [campo, rotulo] of numericos) {
      if (!mapeado(campo)) continue;
      const n = numero(pega(campo));
      if (n === null) continue; // célula vazia: não altera (produto novo assume o padrão)
      if (Number.isNaN(n)) erros.push(`${rotulo} inválido ("${texto(pega(campo))}")`);
      else if (n < 0) erros.push(`${rotulo} não pode ser negativo`);
      else if (n > 9_999_999) erros.push(`${rotulo} grande demais`);
      else dados[campo] = campo === "preco_custo" || campo === "preco_venda" ? Math.round(n * 100) / 100 : Math.round(n * 1000) / 1000;
    }

    return { linha, dados, erros };
  });
}
