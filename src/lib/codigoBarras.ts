/** Tira espaços do código lido/digitado; vazio vira null. */
export function normalizarCodigoBarras(valor: string | null | undefined): string | null {
  const t = (valor ?? "").replace(/\s+/g, "");
  return t === "" ? null : t;
}

/**
 * Mesmo produto lido de formas diferentes: um EAN-13 com zero na frente é o mesmo código do UPC-A de 12 dígitos
 * (a câmera lê "036000291452" onde a etiqueta/cadastro tem "0036000291452"). Fora isso, comparação exata.
 */
export function mesmoCodigo(a: string, b: string): boolean {
  if (a === b) return true;
  const [curto, longo] = a.length <= b.length ? [a, b] : [b, a];
  return /^\d{12}$/.test(curto) && /^\d{13}$/.test(longo) && longo === `0${curto}`;
}

/** Dígito verificador GS1 (EAN-8, UPC-A, EAN-13 e GTIN-14): pesos 3 e 1, da direita para a esquerda. */
function digitoVerificadorOk(codigo: string): boolean {
  const digitos = [...codigo].map(Number);
  const verificador = digitos.pop()!;
  const soma = digitos.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === verificador;
}

/**
 * Mensagem de erro ou null se o código é aceito. Códigos só de números com 8, 12, 13 ou 14 dígitos
 * (EAN/UPC/GTIN) têm o dígito verificador conferido; qualquer outro (código interno, letras) passa livre.
 */
export function erroCodigoBarras(codigo: string): string | null {
  if (!/^[A-Za-z0-9._-]{1,30}$/.test(codigo)) return "Código de barras: use até 30 letras, números, ponto, hífen ou sublinhado, sem espaços";
  if (/^\d+$/.test(codigo) && [8, 12, 13, 14].includes(codigo.length) && !digitoVerificadorOk(codigo)) {
    return `Código de barras ${codigo} inválido: o dígito verificador não confere (confira a digitação ou a leitura)`;
  }
  return null;
}
