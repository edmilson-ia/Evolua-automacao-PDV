"use client";

import { useEffect, useRef, useState } from "react";
import { formatarTelefone } from "@/lib/telefone";
import type { Cliente } from "@/types/cliente";

/** Consulta de clientes no PDV. "Selecionar" liga o cliente à venda em andamento (e habilita a entrega). */
export default function BuscaCliente({ onFechar, onSelecionar }: { onFechar: () => void; onSelecionar: (c: Cliente) => void }) {
  const [termo, setTermo] = useState("");
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const pedido = useRef(0);

  // Busca enquanto digita (com pequena espera). Sem termo, lista os primeiros clientes.
  useEffect(() => {
    const meu = ++pedido.current;
    const t = setTimeout(async () => {
      setCarregando(true);
      setErro("");
      try {
        const res = await fetch(`/api/clientes?q=${encodeURIComponent(termo.trim())}`);
        if (!res.ok) throw new Error();
        const dados = (await res.json()) as Cliente[];
        if (meu === pedido.current) setClientes(dados);
      } catch {
        if (meu === pedido.current) setErro("Não foi possível buscar os clientes. Verifique a conexão.");
      } finally {
        if (meu === pedido.current) setCarregando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [termo]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
      onKeyDown={(e) => e.key === "Escape" && onFechar()}
      role="dialog"
      aria-modal="true"
      aria-label="Pesquisar cliente"
    >
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">Pesquisar cliente</h2>
          <button onClick={onFechar} aria-label="Fechar" className="rounded-lg px-3 py-1 text-2xl leading-none text-gray-500 hover:bg-gray-100">
            ×
          </button>
        </div>

        <input
          autoFocus
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome, telefone ou e-mail"
          autoComplete="off"
          className="mb-3 w-full rounded-lg border-2 border-gray-300 px-3 py-3 text-lg outline-none focus:border-sky-500"
        />

        <div className="min-h-32 flex-1 overflow-y-auto">
          {erro && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
          {!erro && carregando && <p className="py-6 text-center text-gray-500">Buscando...</p>}
          {!erro && !carregando && clientes.length === 0 && (
            <p className="py-6 text-center text-gray-500">
              {termo.trim() ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda."}
            </p>
          )}
          <ul className="space-y-2">
            {!erro &&
              clientes.map((c) => (
                <li key={c.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold">{c.nome}</div>
                    <button
                      onClick={() => onSelecionar(c)}
                      className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1 text-sm font-bold text-white hover:bg-emerald-700"
                    >
                      Selecionar
                    </button>
                  </div>
                  <dl className="mt-1 space-y-0.5 text-sm text-gray-600">
                    <div>📞 {c.telefone ? formatarTelefone(c.telefone) : "—"}</div>
                    <div>✉ {c.email ?? "—"}</div>
                    <div>📍 {c.endereco ?? "—"}</div>
                  </dl>
                </li>
              ))}
          </ul>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          {/* Nova aba: o carrinho da venda em andamento não se perde */}
          <a href="/clientes/novo" target="_blank" rel="noopener" className="text-sm font-medium text-brand hover:underline">
            + Cadastrar novo cliente
          </a>
          <button onClick={onFechar} className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700">
            Fechar (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
