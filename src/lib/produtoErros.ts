/** Erro do Postgres ao gravar produto → status HTTP e mensagem amigável (SKU x código de barras repetidos). */
export function erroDeGravacao(error: { code?: string; message: string }): { status: number; message: string } {
  if (error.code !== "23505") return { status: 500, message: error.message };
  const barras = error.message.includes("codigo_barras");
  return { status: 409, message: barras ? "Código de barras já cadastrado em outro produto" : "SKU já cadastrado" };
}
