"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LeitorCamera from "@/components/pdv/LeitorCamera";
import type { Categoria, Produto } from "@/types/produto";

const UNIDADES = ["un", "kg", "g", "L", "ml", "cx", "pct"];
const NOVA = "__nova__";

async function erroDaResposta(res: Response, padrao: string) {
  const j = await res.json().catch(() => null);
  return typeof j?.error === "string" ? j.error : padrao;
}

export default function FormProduto({
  produto,
  categorias,
}: {
  produto?: Produto;
  categorias: Categoria[];
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [categoria, setCategoria] = useState(produto?.categoria_id ?? "");
  const [preview, setPreview] = useState<string | null>(produto?.imagem_url ?? null);
  const [removerFoto, setRemoverFoto] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const codigoRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);

  function removerImagem() {
    if (arquivoRef.current) arquivoRef.current.value = "";
    setPreview(null);
    setRemoverFoto(true);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      const f = new FormData(e.currentTarget);

      let categoriaId: string | null = categoria || null;
      if (categoria === NOVA) {
        const res = await fetch("/api/categorias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome: f.get("nova_categoria") }),
        });
        if (!res.ok) throw new Error(await erroDaResposta(res, "Categoria inválida"));
        categoriaId = (await res.json()).id;
      }

      let imagemUrl = removerFoto ? null : (produto?.imagem_url ?? null);
      const arquivo = f.get("imagem");
      if (arquivo instanceof File && arquivo.size > 0) {
        const up = new FormData();
        up.set("file", arquivo);
        const res = await fetch("/api/upload", { method: "POST", body: up });
        if (!res.ok) throw new Error(await erroDaResposta(res, "Falha no envio da imagem"));
        imagemUrl = (await res.json()).url;
      }

      const body = {
        nome: f.get("nome"),
        sku: f.get("sku"),
        codigo_barras: f.get("codigo_barras"),
        categoria_id: categoriaId,
        descricao: f.get("descricao") || null,
        imagem_url: imagemUrl,
        preco_custo: f.get("preco_custo"),
        preco_venda: f.get("preco_venda"),
        quantidade: f.get("quantidade"),
        estoque_minimo: f.get("estoque_minimo"),
        unidade: f.get("unidade"),
        visivel_catalogo: f.get("visivel_catalogo") === "on",
      };
      const res = await fetch(produto ? `/api/produtos/${produto.id}` : "/api/produtos", {
        method: produto ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await erroDaResposta(res, "Verifique os campos e tente novamente"));

      router.push("/estoque");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setSalvando(false);
    }
  }

  const input = "w-full rounded-lg border border-gray-300 px-3 py-2";
  const label = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2 max-w-2xl">
      <div className="sm:col-span-2">
        <label className={label}>Nome</label>
        <input name="nome" required defaultValue={produto?.nome} className={input} />
      </div>
      <div>
        <label className={label}>SKU</label>
        <input name="sku" required defaultValue={produto?.sku} className={input} />
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Código de barras (opcional)</label>
        <div className="flex gap-2">
          <input ref={codigoRef} name="codigo_barras" inputMode="numeric" autoComplete="off" placeholder="Bipe o leitor, use a câmera ou digite"
            defaultValue={produto?.codigo_barras ?? ""} className={input}
            onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
          <button type="button" onClick={() => setCamera(true)} className="shrink-0 rounded-lg border border-brand px-3 py-2 text-sm font-medium text-brand">
            Câmera
          </button>
        </div>
        {camera && (
          <LeitorCamera
            onLido={(c) => {
              if (codigoRef.current) codigoRef.current.value = c;
            }}
            onFechar={() => setCamera(false)}
          />
        )}
        <p className="mt-1 text-xs text-gray-500">O leitor USB digita o código e aperta Enter: aqui o Enter não salva o produto. Códigos EAN/UPC têm o dígito verificador conferido.</p>
      </div>
      <div>
        <label className={label}>Unidade</label>
        <select name="unidade" defaultValue={produto?.unidade ?? "un"} className={input}>
          {UNIDADES.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={label}>Categoria</label>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={input}>
          <option value="">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
          <option value={NOVA}>+ Nova categoria...</option>
        </select>
      </div>
      {categoria === NOVA && (
        <div>
          <label className={label}>Nome da nova categoria</label>
          <input name="nova_categoria" required className={input} />
        </div>
      )}
      <div>
        <label className={label}>Preço de custo (R$)</label>
        <input name="preco_custo" type="number" step="0.01" min="0" required
          defaultValue={produto?.preco_custo ?? 0} className={input} />
      </div>
      <div>
        <label className={label}>Preço de venda (R$)</label>
        <input name="preco_venda" type="number" step="0.01" min="0" required
          defaultValue={produto?.preco_venda ?? 0} className={input} />
      </div>
      <div>
        <label className={label}>Quantidade em estoque</label>
        <input name="quantidade" type="number" step="0.001" min="0"
          defaultValue={produto?.quantidade ?? 0} className={input} />
      </div>
      <div>
        <label className={label}>Estoque mínimo</label>
        <input name="estoque_minimo" type="number" step="0.001" min="0"
          defaultValue={produto?.estoque_minimo ?? 0} className={input} />
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Descrição</label>
        <textarea name="descricao" rows={3} defaultValue={produto?.descricao ?? ""} className={input} />
      </div>
      <div className="sm:col-span-2">
        <label className={label}>Foto do produto</label>
        <div className="flex items-center gap-4 rounded-lg border border-dashed border-gray-300 bg-white p-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Pré-visualização" className="h-24 w-24 shrink-0 rounded-lg border object-cover" />
          ) : (
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">
              Sem foto
            </div>
          )}
          <div className="flex flex-col items-start gap-2">
            {/* Input escondido: no computador abre o explorador de arquivos; no celular, galeria/câmera. */}
            <input
              ref={arquivoRef}
              id="imagem"
              name="imagem"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setPreview(URL.createObjectURL(file));
                  setRemoverFoto(false);
                }
              }}
            />
            <label
              htmlFor="imagem"
              className="cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:brightness-90"
            >
              {preview ? "Trocar foto" : "Escolher foto"}
            </label>
            {preview && (
              <button type="button" onClick={removerImagem} className="text-sm text-red-600 hover:underline">
                Remover foto
              </button>
            )}
            <p className="text-xs text-gray-500">JPG, PNG ou WEBP, até 5 MB</p>
          </div>
        </div>
      </div>
      <label className="sm:col-span-2 flex items-center gap-2 text-sm">
        <input name="visivel_catalogo" type="checkbox" defaultChecked={produto?.visivel_catalogo ?? true} />
        Exibir no catálogo público
      </label>
      {erro && <p className="sm:col-span-2 text-sm text-red-600">{erro}</p>}
      <div className="sm:col-span-2 flex gap-3">
        <button disabled={salvando}
          className="rounded-lg bg-brand px-5 py-2 text-white font-medium disabled:opacity-50">
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        <button type="button" onClick={() => router.back()}
          className="rounded-lg border border-gray-300 px-5 py-2">
          Cancelar
        </button>
      </div>
    </form>
  );
}
