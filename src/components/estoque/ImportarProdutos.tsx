"use client";

import { useState } from "react";
import Link from "next/link";
import { CAMPOS, LIMITE_BYTES, LIMITE_LINHAS, type Acao, type ErroLinha, type FotoPendente, type Mapeamento } from "@/lib/importacao/tipos";
import ProgressoFotos from "./ProgressoFotos";

type Leitura = { colunas: string[]; amostra: (string | number)[][]; total: number; sugestao: Mapeamento };
type Previa = {
  totais: { criar: number; atualizar: number; reativar: number; erros: number; repetidos: number };
  repetidos: Repetido[];
  categoriasNovas: string[];
  avisos: { semSku: number; semPreco: number; linhasComFoto: number };
  erros: ErroLinha[];
  itens: { linha: number; acao: Acao; sku: string; nome: string | null }[];
  totalItens: number;
};
type Repetido = { linha: number; acao: Acao; sku: string; nome: string | null; motivo: "estoque" | "arquivo"; com: string };
type Resultado = { criados: number; atualizados: number; reativados: number; pulados: number; categoriasCriadas: number; erros: ErroLinha[]; fotos: FotoPendente[] };

const ROTULO_ACAO: Record<Acao, string> = { criar: "Novo", atualizar: "Atualiza", reativar: "Reativa" };

export default function ImportarProdutos() {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [mapa, setMapa] = useState<Mapeamento>({});
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // Linhas repetidas que serão PULADAS (todas começam marcadas; desmarcar = importar mesmo assim)
  const [puladas, setPuladas] = useState<Set<number>>(new Set());
  const [substituirFotos, setSubstituirFotos] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function chamar<T>(modo: "ler" | "previa" | "confirmar", arq: File, mapeamento?: Mapeamento, manter?: number[], substituir?: boolean): Promise<T | null> {
    setOcupado(true);
    setErro("");
    try {
      const form = new FormData();
      form.set("arquivo", arq);
      form.set("modo", modo);
      if (mapeamento) form.set("mapeamento", JSON.stringify(mapeamento));
      if (manter) form.set("manter", JSON.stringify(manter));
      if (substituir) form.set("substituir_fotos", "1");
      const r = await fetch("/api/produtos/importar", { method: "POST", body: form });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(j.error ?? "Falha ao processar o arquivo");
        return null;
      }
      return j as T;
    } catch {
      setErro("Sem conexão com o servidor. Tente de novo.");
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function escolher(arq: File | null) {
    setArquivo(arq);
    setLeitura(null);
    setPrevia(null);
    setResultado(null);
    setErro("");
    if (!arq) return;
    if (arq.size > LIMITE_BYTES) {
      setErro(`Arquivo de ${(arq.size / 1024 / 1024).toFixed(0)} MB: o máximo é ${LIMITE_BYTES / 1024 / 1024} MB. Se a planilha tem imagens, baixe só o texto: no Google Planilhas use Arquivo → Fazer download → CSV.`);
      return;
    }
    const l = await chamar<Leitura>("ler", arq);
    if (l) {
      setLeitura(l);
      setMapa(l.sugestao);
    }
  }

  async function conferir() {
    if (!arquivo) return;
    const p = await chamar<Previa>("previa", arquivo, mapa);
    if (p) {
      setPrevia(p);
      setPuladas(new Set(p.repetidos.map((r) => r.linha)));
    }
  }

  async function confirmar() {
    if (!arquivo) return;
    const manter = (previa?.repetidos ?? []).map((r) => r.linha).filter((l) => !puladas.has(l));
    const r = await chamar<Resultado>("confirmar", arquivo, mapa, manter, substituirFotos);
    if (r) {
      setResultado(r);
      setPrevia(null);
    }
  }

  function alternarPular(linha: number) {
    setPuladas((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(linha)) novo.add(linha);
      return novo;
    });
  }

  function alterarMapa(campo: string, valor: string) {
    setMapa((m) => ({ ...m, [campo]: valor === "" ? null : Number(valor) }));
    setPrevia(null);
  }

  const puladasDe = (acao: Acao) => previa?.repetidos.filter((r) => r.acao === acao && puladas.has(r.linha)).length ?? 0;
  // Quantos entram de fato: tudo que é válido, menos os repetidos marcados para pular
  const aImportar = previa ? previa.totalItens + previa.repetidos.filter((r) => !puladas.has(r.linha)).length : 0;
  // Nada novo para gravar, mas há linhas repetidas com foto: dá para aproveitar só as fotos
  const soFotos = !!previa && aImportar === 0 && previa.repetidos.some((r) => r.motivo === "estoque") && previa.avisos.linhasComFoto > 0;

  return (
    <div className="space-y-5">
      {/* 1. Arquivo */}
      <section className="rounded-lg border border-gray-200 p-4">
        <h2 className="mb-2 font-semibold">1. Escolha o arquivo</h2>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => escolher(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          {/* download de arquivo (rota de API), não é navegação entre páginas */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/produtos/importar/modelo" className="text-sm text-brand hover:underline">
            Baixar planilha modelo
          </a>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Até 5 MB e {LIMITE_LINHAS} linhas. A primeira linha deve ter os nomes das colunas.
        </p>
      </section>

      {erro && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">{erro}</div>}
      {ocupado && <p className="text-sm text-gray-500">Processando…</p>}

      {/* 2. Mapeamento */}
      {leitura && !resultado && (
        <section className="rounded-lg border border-gray-200 p-4">
          <h2 className="mb-1 font-semibold">2. Confira as colunas</h2>
          <p className="mb-3 text-sm text-gray-600">
            {leitura.total} linhas encontradas. Indique qual coluna da planilha vale para cada campo.
            Campo sem coluna não é alterado nos produtos que já existem.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS.map((c) => (
              <label key={c.id} className="text-sm">
                <span className="mb-1 block font-medium">
                  {c.rotulo}
                </span>
                <select
                  value={mapa[c.id] ?? ""}
                  onChange={(e) => alterarMapa(c.id, e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="">— não importar —</option>
                  {leitura.colunas.map((nome, i) => (
                    <option key={i} value={i}>{nome || `(coluna ${i + 1})`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Nenhum campo é obrigatório. Sem SKU, o sistema cria um código automático (e a linha sempre vira produto novo);
            sem nome, usa o SKU como nome; sem preço de venda, o produto entra com R$ 0,00.
            A quantidade da planilha vira a contagem do estoque (a diferença fica registrada nos movimentos).
          </p>
          <button
            onClick={conferir}
            disabled={ocupado}
            className="mt-4 rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            Conferir (prévia)
          </button>
        </section>
      )}

      {/* 3. Prévia */}
      {previa && !resultado && (
        <section className="rounded-lg border border-gray-200 p-4">
          <h2 className="mb-3 font-semibold">3. Prévia — nada foi gravado ainda</h2>
          <div className="mb-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <Numero valor={previa.totais.criar - puladasDe("criar")} rotulo="novos" />
            <Numero valor={previa.totais.atualizar} rotulo="atualizados" />
            <Numero valor={previa.totais.reativar - puladasDe("reativar")} rotulo="reativados" />
            <Numero valor={previa.totais.erros} rotulo="com erro" vermelho={previa.totais.erros > 0} />
          </div>
          {previa.categoriasNovas.length > 0 && (
            <p className="mb-3 text-sm">
              <strong>Categorias que serão criadas:</strong> {previa.categoriasNovas.join(", ")}
            </p>
          )}
          {previa.avisos.linhasComFoto > 0 && (
            <div className="mb-3 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
              <p>
                {previa.avisos.linhasComFoto} linhas têm link de foto. As fotos são baixadas <strong>depois</strong> de importar, em lotes
                (pode levar alguns minutos: deixe a página aberta). Linhas repetidas puladas aproveitam a foto para o produto que já existe, se ele ainda não tiver.
              </p>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" checked={substituirFotos} onChange={(e) => setSubstituirFotos(e.target.checked)} />
                Substituir as fotos que os produtos já têm
              </label>
            </div>
          )}
          {(previa.avisos.semSku > 0 || previa.avisos.semPreco > 0) && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {previa.avisos.semSku > 0 && <p>{previa.avisos.semSku} linhas sem SKU receberão um código automático (AUTO-…).</p>}
              {previa.avisos.semPreco > 0 && <p>{previa.avisos.semPreco} produtos novos ficarão com preço de venda R$ 0,00 — ajuste depois no estoque.</p>}
            </div>
          )}
          {previa.repetidos.length > 0 && (
            <div className="mb-3">
              <p className="mb-1 text-sm font-medium text-amber-900">
                Produtos repetidos ({previa.totais.repetidos}) — já existem ou aparecem antes na planilha. Marcados = serão pulados.
              </p>
              <div className="max-h-64 overflow-auto rounded-lg border border-amber-300 bg-white">
                <table className="w-full text-sm">
                  <thead className="bg-amber-50 text-left">
                    <tr><th className="p-2">Pular</th><th className="p-2">Linha</th><th className="p-2">Nome</th><th className="p-2">Igual a</th></tr>
                  </thead>
                  <tbody>
                    {previa.repetidos.map((r) => (
                      <tr key={r.linha} className="border-t border-amber-100">
                        <td className="p-2">
                          <input type="checkbox" aria-label={`Pular a linha ${r.linha}`} checked={puladas.has(r.linha)} onChange={() => alternarPular(r.linha)} />
                        </td>
                        <td className="p-2">{r.linha}</td>
                        <td className="p-2">{r.nome ?? r.sku}</td>
                        <td className="p-2">{r.motivo === "estoque" ? `No estoque: ${r.com}` : `Na ${r.com}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previa.totais.repetidos > previa.repetidos.length && (
                <p className="mt-1 text-xs text-gray-500">Mostrando os primeiros {previa.repetidos.length}. Os demais repetidos também serão pulados.</p>
              )}
            </div>
          )}
          {previa.erros.length > 0 && <TabelaErros erros={previa.erros} titulo="Linhas com problema (serão ignoradas)" />}
          {previa.itens.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr><th className="p-2">Linha</th><th className="p-2">Ação</th><th className="p-2">SKU</th><th className="p-2">Nome</th></tr>
                </thead>
                <tbody>
                  {previa.itens.map((i) => (
                    <tr key={i.linha} className="border-t border-gray-100">
                      <td className="p-2">{i.linha}</td>
                      <td className="p-2">{ROTULO_ACAO[i.acao]}</td>
                      <td className="p-2">{i.sku}</td>
                      <td className="p-2">{i.nome ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previa.totalItens > previa.itens.length && (
                <p className="p-2 text-xs text-gray-500">Mostrando as primeiras {previa.itens.length} de {previa.totalItens} linhas válidas.</p>
              )}
            </div>
          )}
          <button
            onClick={confirmar}
            disabled={(aImportar === 0 && !soFotos) || ocupado}
            className="mt-4 rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {soFotos ? "Aproveitar só as fotos dos produtos que já existem" : `Confirmar importação de ${aImportar} ${aImportar === 1 ? "produto" : "produtos"}`}
          </button>
        </section>
      )}

      {/* 4. Resultado */}
      {resultado && (
        <section className="rounded-lg border border-green-300 bg-green-50 p-4">
          <h2 className="mb-2 font-semibold text-green-900">Importação concluída</h2>
          <p className="text-sm text-green-900">
            {resultado.criados} criados · {resultado.atualizados} atualizados · {resultado.reativados} reativados
            {resultado.pulados > 0 ? ` · ${resultado.pulados} repetidos pulados` : ""}
            {resultado.categoriasCriadas > 0 ? ` · ${resultado.categoriasCriadas} categorias novas` : ""}
          </p>
          {resultado.erros.length > 0 && (
            <div className="mt-3"><TabelaErros erros={resultado.erros} titulo="Linhas que não puderam ser gravadas" /></div>
          )}
          {resultado.fotos.length > 0 && <ProgressoFotos fotos={resultado.fotos} substituir={substituirFotos} />}
          <Link href="/estoque" className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 font-medium text-white">Ver estoque</Link>
        </section>
      )}
    </div>
  );
}

function Numero({ valor, rotulo, vermelho }: { valor: number; rotulo: string; vermelho?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 ${vermelho ? "border-red-300 bg-red-50" : "border-gray-200"}`}>
      <div className={`text-xl font-bold ${vermelho ? "text-red-700" : ""}`}>{valor}</div>
      <div className="text-xs text-gray-600">{rotulo}</div>
    </div>
  );
}

function TabelaErros({ erros, titulo }: { erros: ErroLinha[]; titulo: string }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-red-800">{titulo}</p>
      <div className="max-h-64 overflow-auto rounded-lg border border-red-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-red-50 text-left">
            <tr><th className="p-2">Linha</th><th className="p-2">SKU</th><th className="p-2">Problema</th></tr>
          </thead>
          <tbody>
            {erros.map((e, i) => (
              <tr key={i} className="border-t border-red-100">
                <td className="p-2">{e.linha}</td>
                <td className="p-2">{e.sku || "—"}</td>
                <td className="p-2">{e.erro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
