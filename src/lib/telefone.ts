// Telefone brasileiro como identificador de login. Sem dependências: usado no servidor e no navegador.

/**
 * Devolve só os dígitos (DDD + número), ou null se não for um telefone brasileiro válido.
 * Aceita "(11) 98765-4321", "11987654321", "+55 11 98765-4321"...
 */
export function normalizarTelefone(entrada: string): string | null {
  let d = entrada.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== "9") return null; // celular: o 9º dígito é sempre 9
  return d;
}

/** "11987654321" → "(11) 98765-4321" (fixo: "(11) 3456-7890"). */
export function formatarTelefone(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}

/** Máscara progressiva para o campo enquanto a pessoa digita. */
export function mascararTelefone(entrada: string): string {
  let d = entrada.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** E-mail interno exigido pelo Supabase Auth. Nunca é exibido nem recebe mensagens. */
export const emailInterno = (digitos: string) => `${digitos}@tel.evolua.test`;
