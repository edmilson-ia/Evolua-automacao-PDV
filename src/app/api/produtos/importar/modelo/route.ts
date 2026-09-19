import { exigirApi } from "@/lib/auth";

// UTF-8 com BOM e ";" para o Excel em português abrir com acentos e colunas certas
const MODELO =
  "﻿sku;nome;categoria;preco_custo;preco_venda;quantidade;estoque_minimo;unidade;descricao;codigo_barras\r\n" +
  "REF-001;Refrigerante 2L;Bebidas;5,50;9,90;24;6;un;Exemplo de produto;7894900011517\r\n" +
  "REF-002;Arroz 5kg;Mercearia;18,00;26,90;12;4;un;;\r\n";

export async function GET() {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  return new Response(MODELO, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modelo-produtos.csv"',
      "Cache-Control": "no-store",
    },
  });
}
