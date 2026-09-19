import { NextResponse } from "next/server";
import { z } from "zod";
import { exigirApi } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { aplicar, fotosDosRepetidos } from "@/lib/importacao/aplicar";
import { lerPlanilha, sugerirMapeamento } from "@/lib/importacao/ler";
import { descartarRepetidos, planejar } from "@/lib/importacao/planejar";
import { CAMPOS, LIMITE_BYTES, LIMITE_LINHAS, type Mapeamento } from "@/lib/importacao/tipos";
import { validarLinhas } from "@/lib/importacao/validar";

export const maxDuration = 60;

const indice = z.number().int().min(0).max(200).nullable().optional();
const mapeamentoSchema = z.object(Object.fromEntries(CAMPOS.map((c) => [c.id, indice])));

const erro = (mensagem: string, status = 400) => NextResponse.json({ error: mensagem }, { status });

/**
 * Importação de produtos (só admin: a planilha traz preço de custo). A loja vem SEMPRE da sessão.
 * Corpo multipart: `arquivo` + `modo` = "ler" | "previa" | "confirmar" (+ `mapeamento` em JSON).
 * O arquivo vai junto nas 3 chamadas: assim o servidor não guarda estado entre elas.
 */
export async function POST(req: Request) {
  const acesso = await exigirApi(["admin"]);
  if (!acesso.ok) return acesso.resposta;
  const { sessao } = acesso;

  // O envio grande é cortado antes de chegar aqui: avisa pelo tamanho declarado, sem tentar ler
  if (Number(req.headers.get("content-length")) > LIMITE_BYTES + 100_000) {
    return erro(`Arquivo grande demais (máximo ${LIMITE_BYTES / 1024 / 1024} MB). Se a planilha tem imagens, baixe só o texto: no Google Planilhas use Arquivo → Fazer download → CSV.`, 413);
  }
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof File)) return erro("Envie um arquivo CSV ou XLSX");
  if (arquivo.size === 0) return erro("O arquivo está vazio");
  if (arquivo.size > LIMITE_BYTES) return erro(`Arquivo grande demais (máximo ${LIMITE_BYTES / 1024 / 1024} MB). Se a planilha tem imagens, baixe só o texto: no Google Planilhas use Arquivo → Fazer download → CSV.`, 413);

  let planilha;
  try {
    planilha = await lerPlanilha(Buffer.from(await arquivo.arrayBuffer()));
  } catch (e) {
    return erro(e instanceof Error ? e.message : "Não consegui ler o arquivo. Use CSV ou XLSX.");
  }
  if (planilha.linhas.length === 0) return erro("A planilha só tem o cabeçalho, sem produtos");
  if (planilha.linhas.length > LIMITE_LINHAS) {
    return erro(`Planilha com ${planilha.linhas.length} linhas: o máximo é ${LIMITE_LINHAS} por importação. Divida em partes.`, 413);
  }

  const modo = form?.get("modo");
  if (modo === "ler") {
    return NextResponse.json({
      colunas: planilha.colunas,
      amostra: planilha.linhas.slice(0, 3),
      total: planilha.linhas.length,
      sugestao: sugerirMapeamento(planilha.colunas),
    });
  }
  if (modo !== "previa" && modo !== "confirmar") return erro("Modo inválido");

  let bruto: unknown;
  try {
    bruto = JSON.parse(String(form?.get("mapeamento") ?? ""));
  } catch {
    return erro("Mapeamento inválido");
  }
  const parsed = mapeamentoSchema.safeParse(bruto);
  if (!parsed.success) return erro("Mapeamento inválido");
  const mapa = parsed.data as Mapeamento;
  for (const idx of Object.values(mapa)) {
    if (idx != null && idx >= planilha.colunas.length) return erro("Mapeamento aponta para uma coluna que não existe");
  }

  // Linhas repetidas que o usuário quer importar mesmo assim (as demais repetidas são puladas)
  let manterBruto: unknown = [];
  try {
    manterBruto = JSON.parse(String(form?.get("manter") ?? "[]"));
  } catch {
    return erro("Lista de linhas inválida");
  }
  const manter = z.array(z.number().int().min(2).max(LIMITE_LINHAS + 1)).max(LIMITE_LINHAS).transform((l) => new Set(l)).safeParse(manterBruto);
  if (!manter.success) return erro("Lista de linhas inválida");

  const substituirFotos = form?.get("substituir_fotos") === "1";

  const db = createServerClient();
  try {
    const plano = await planejar(db, sessao.tenantId, validarLinhas(planilha, mapa));
    if (modo === "previa") {
      const repetidos = plano.itens.filter((i) => i.repetido);
      return NextResponse.json({
        totais: plano.totais,
        repetidos: repetidos.slice(0, 500).map((i) => ({ linha: i.linha, acao: i.acao, sku: i.dados.sku, nome: i.dados.nome ?? null, ...i.repetido! })),
        categoriasNovas: plano.categoriasNovas,
        avisos: { ...plano.avisos, linhasComFoto: plano.itens.filter((i) => i.dados.imagem_link).length },
        erros: plano.erros,
        itens: plano.itens.filter((i) => !i.repetido).slice(0, 50).map((i) => ({ linha: i.linha, acao: i.acao, sku: i.dados.sku, nome: i.dados.nome ?? null })),
        totalItens: plano.itens.filter((i) => !i.repetido).length, // sem os repetidos (esses seguem a escolha da tela)
      });
    }
    const { plano: aImportar, pulados, descartados } = descartarRepetidos(plano, manter.data);
    const fotosDeRepetidos = fotosDosRepetidos(descartados, substituirFotos, []);
    if (aImportar.itens.length === 0 && fotosDeRepetidos.length === 0) {
      return erro(pulados ? `Todas as ${pulados} linhas são de produtos repetidos e foram puladas` : "Nenhuma linha válida para importar", 422);
    }
    const resultado = await aplicar(db, sessao, aImportar, { substituirFotos });
    resultado.fotos.push(...fotosDosRepetidos(descartados, substituirFotos, resultado.fotos));
    return NextResponse.json({ ...resultado, pulados });
  } catch (e) {
    return erro(e instanceof Error ? e.message : "Falha na importação", 500);
  }
}
