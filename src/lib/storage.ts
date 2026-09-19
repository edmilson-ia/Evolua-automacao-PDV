// Imagens de cada loja ficam em produtos/<id-da-loja>/... no bucket público. Uma loja só pode
// apontar para imagens da própria pasta (nunca a de outra loja, nem uma URL externa).
export const prefixoImagensDaLoja = (tenantId: string) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/produtos/${tenantId}/`;

export const imagemEhDaLoja = (tenantId: string, url: string | null | undefined): boolean =>
  !url || url.startsWith(prefixoImagensDaLoja(tenantId));

export const ERRO_IMAGEM_FORA = "A imagem precisa ser enviada pelo sistema, na sua loja";
