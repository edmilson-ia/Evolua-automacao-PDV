"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatarTelefone, mascararTelefone } from "@/lib/telefone";
import type { Cliente } from "@/types/cliente";

const input = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5";
const label = "mb-1 block text-sm font-medium text-gray-700";

export default function FormCliente({ cliente }: { cliente?: Cliente }) {
  const router = useRouter();
  const [nome, setNome] = useState(cliente?.nome ?? "");
  const [telefone, setTelefone] = useState(cliente?.telefone ? formatarTelefone(cliente.telefone) : "");
  const [email, setEmail] = useState(cliente?.email ?? "");
  const [endereco, setEndereco] = useState(cliente?.endereco ?? "");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const res = await fetch(cliente ? `/api/clientes/${cliente.id}` : "/api/clientes", {
        method: cliente ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, telefone, email, endereco }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Não foi possível salvar o cliente");
      router.push("/clientes");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar o cliente");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="max-w-xl space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <div>
        <label htmlFor="c-nome" className={label}>Nome *</label>
        <input id="c-nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={80} autoFocus className={input} />
      </div>
      <div>
        <label htmlFor="c-tel" className={label}>Telefone (com DDD)</label>
        <input
          id="c-tel"
          type="tel"
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
          placeholder="(11) 98765-4321"
          className={input}
        />
      </div>
      <div>
        <label htmlFor="c-email" className={label}>E-mail</label>
        <input id="c-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="cliente@exemplo.com" className={input} />
      </div>
      <div>
        <label htmlFor="c-end" className={label}>Endereço</label>
        <textarea id="c-end" value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={200} rows={2} placeholder="Rua, número, bairro, cidade" className={input} />
      </div>
      {erro && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      <div className="flex gap-3">
        <button disabled={enviando} className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-white disabled:opacity-50">
          {enviando ? "Salvando..." : cliente ? "Salvar alterações" : "Cadastrar cliente"}
        </button>
        <button type="button" onClick={() => router.push("/clientes")} className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700">
          Cancelar
        </button>
      </div>
    </form>
  );
}
