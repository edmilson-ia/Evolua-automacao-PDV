import type { Branding } from "@/lib/tenant";

/** Muda quando logo/ícone/cor/nome mudam: usado para invalidar o cache dos ícones do PWA. */
export function iconeVersao(b: Branding): string {
  const base = `${b.icone_url ?? ""}|${b.logo_url ?? ""}|${b.cor_primaria ?? ""}|${b.nome_fantasia.charAt(0)}`;
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
