/**
 * Atalho "Plataforma" no menu: só aparece para o ADMINISTRADOR de uma loja do próprio dono da plataforma, listada em
 * LOJA_DO_DONO (endereços separados por vírgula, ex.: "evolua"). Lojas de clientes nunca mostram o atalho.
 * Sem imports do projeto: dá para testar direto pelo Node.
 */
export function lojasDoDono(valor: string | undefined = process.env.LOJA_DO_DONO): string[] {
  return (valor ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function mostraAtalhoDoDono(slug: string, perfil: string, lista: string[] = lojasDoDono()): boolean {
  return perfil === "admin" && lista.includes(slug.trim().toLowerCase());
}
