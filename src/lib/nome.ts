/** Chave para comparar nomes de produto: sem acento, sem maiúsculas, pontuação e espaços a mais ("COCA-COLA  2l" = "Coca Cola 2L"). */
export function chaveNome(nome: string): string {
  const t = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return t.replace(/[^a-z0-9]+/g, " ").trim() || t.trim();
}
