"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Branding } from "@/lib/tenant";

const CORES = ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#ea580c", "#0f172a"];

async function erroDaResposta(res: Response, padrao: string) {
  const j = await res.json().catch(() => null);
  return typeof j?.error === "string" ? j.error : padrao;
}

/** Campo de imagem: escolhe o arquivo, envia na hora e mostra a prévia. */
function CampoImagem({
  titulo,
  ajuda,
  valor,
  onChange,
  onErro,
  quadrado,
}: {
  titulo: string;
  ajuda: string;
  valor: string | null;
  onChange: (url: string | null) => void;
  onErro: (msg: string) => void;
  quadrado?: boolean;
}) {
  const [enviando, setEnviando] = useState(false);
  const id = `img-${titulo}`;

  async function escolher(file: File) {
    setEnviando(true);
    onErro("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("pasta", "branding");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await erroDaResposta(res, "Falha no envio da imagem"));
      onChange((await res.json()).url);
    } catch (e) {
      onErro(e instanceof Error ? e.message : "Falha no envio da imagem");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <div className="mb-1 text-sm font-medium text-gray-700">{titulo}</div>
      <div className="flex items-center gap-4 rounded-lg border border-dashed border-gray-300 bg-white p-3">
        <div
          className={`flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden border bg-gray-50 ${
            quadrado ? "rounded-2xl" : "rounded-lg"
          }`}
        >
          {valor ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={valor} alt={titulo} className="h-full w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-xs text-gray-400">Sem imagem</span>
          )}
        </div>
        <div className="flex flex-col items-start gap-2">
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void escolher(f);
              e.target.value = "";
            }}
          />
          <label
            htmlFor={id}
            className="cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:brightness-90"
          >
            {enviando ? "Enviando..." : valor ? "Trocar imagem" : "Escolher imagem"}
          </label>
          {valor && (
            <button type="button" onClick={() => onChange(null)} className="text-sm text-red-600 hover:underline">
              Remover
            </button>
          )}
          <p className="text-xs text-gray-500">{ajuda}</p>
        </div>
      </div>
    </div>
  );
}

export default function FormBranding({ inicial }: { inicial: Branding }) {
  const router = useRouter();
  const [nome, setNome] = useState(inicial.nome_fantasia);
  const [cor, setCor] = useState(inicial.cor_primaria ?? "#2563eb");
  const [logo, setLogo] = useState<string | null>(inicial.logo_url);
  const [icone, setIcone] = useState<string | null>(inicial.icone_url);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setOk(false);
    setSalvando(true);
    try {
      const res = await fetch("/api/branding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome_fantasia: nome, cor_primaria: cor, logo_url: logo, icone_url: icone }),
      });
      if (!res.ok) throw new Error(await erroDaResposta(res, "Não foi possível salvar"));
      setOk(true);
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar");
    } finally {
      setSalvando(false);
    }
  }

  const input = "w-full rounded-lg border border-gray-300 px-3 py-2";
  const inicialLetra = (nome.trim().charAt(0) || "E").toUpperCase();

  return (
    <form onSubmit={salvar} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Nome fantasia</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} required className={input} />
          <p className="mt-1 text-xs text-gray-500">Aparece no topo do sistema, no catálogo e como nome do app instalado.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Cor da marca</label>
          <div className="flex flex-wrap items-center gap-2">
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                aria-label={`Cor ${c}`}
                className={`h-9 w-9 rounded-full border-2 ${cor.toLowerCase() === c ? "border-gray-900" : "border-white shadow"}`}
                style={{ background: c }}
              />
            ))}
            <input
              type="color"
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              aria-label="Escolher outra cor"
              className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
            />
            <span className="font-mono text-sm text-gray-600">{cor}</span>
          </div>
        </div>

        <CampoImagem
          titulo="Logo"
          ajuda="Aparece no topo do sistema, do PDV e do catálogo. Prefira PNG com fundo transparente."
          valor={logo}
          onChange={setLogo}
          onErro={setErro}
        />
        <CampoImagem
          titulo="Ícone do app"
          ajuda="Ícone na tela inicial do celular. Ideal: quadrado, 512×512 px. Sem ícone, o sistema usa a logo."
          valor={icone}
          onChange={setIcone}
          onErro={setErro}
          quadrado
        />

        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {ok && (
          <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            ✔ Salvo! Quem já instalou o app pode levar algum tempo para ver o novo ícone (ou reinstale).
          </p>
        )}
        <button
          disabled={salvando}
          className="rounded-lg bg-brand px-6 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Salvar marca"}
        </button>
      </div>

      {/* Prévia ao vivo */}
      <aside className="h-fit space-y-4 rounded-xl border border-gray-200 bg-white p-4">
        <div className="text-sm font-semibold text-gray-700">Prévia</div>
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 px-3 py-2 text-white" style={{ background: cor }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-8 w-auto rounded bg-white/95 p-0.5" />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded bg-white/25 font-bold">{inicialLetra}</span>
            )}
            <span className="truncate font-semibold">{nome || "Nome fantasia"}</span>
          </div>
          <div className="space-y-2 p-3">
            <div className="h-2 w-3/4 rounded bg-gray-200" />
            <div className="h-2 w-1/2 rounded bg-gray-200" />
            <div className="inline-block rounded px-3 py-1 text-xs font-medium text-white" style={{ background: cor }}>
              Botão
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl text-3xl font-bold text-white"
            style={{ background: icone || logo ? "#fff" : cor, border: "1px solid #e5e7eb" }}
          >
            {icone || logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(icone ?? logo)!} alt="" className={`h-full w-full ${icone ? "object-cover" : "object-contain p-2"}`} />
            ) : (
              inicialLetra
            )}
          </div>
          <div className="text-xs text-gray-500">
            Ícone na tela inicial
            <div className="font-medium text-gray-800">{nome || "Nome fantasia"}</div>
          </div>
        </div>
      </aside>
    </form>
  );
}
