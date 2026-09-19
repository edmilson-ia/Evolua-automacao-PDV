"use client";

import Link from "next/link";
import { useState } from "react";
import { mascararTelefone } from "@/lib/telefone";

const mascarar = (v: string) => (/[@a-zA-Z]/.test(v) ? v : mascararTelefone(v));

export default function FormRecuperarSenha() {
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (senha !== confirmar) {
      setErro("As senhas não são iguais");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/recuperar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identificador: telefone, codigo, senha }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Não foi possível redefinir a senha");
      setPronto(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível redefinir a senha");
    } finally {
      setEnviando(false);
    }
  }

  if (pronto) {
    return (
      <div className="space-y-4 text-center">
        <p className="rounded-lg bg-emerald-50 p-4 text-emerald-800">✔ Senha redefinida! Entre com a nova senha.</p>
        <Link href="/plataforma/login" className="block w-full rounded-lg bg-brand py-3 text-lg font-semibold text-white">
          Ir para o login
        </Link>
      </div>
    );
  }

  const input = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5";
  const label = "mb-1 block text-sm font-medium text-gray-700";

  return (
    <div className="space-y-5">
      <div className="space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
        <p>
          <strong>Sou operador (caixa):</strong> peça ao administrador da loja para redefinir a sua senha em{" "}
          <strong>Usuários → Redefinir senha</strong>.
        </p>
        <p>
          <strong>Sou administrador da loja:</strong> peça ao responsável pela plataforma para redefinir a sua senha.
        </p>
      </div>

      <form onSubmit={enviar} className="space-y-4">
        <p className="text-sm font-semibold text-gray-800">Sou o dono da plataforma</p>
        <div>
          <label htmlFor="r-tel" className={label}>Telefone (com DDD)</label>
          <input
            id="r-tel"
            type="tel"
            inputMode="tel"
            value={telefone}
            onChange={(e) => setTelefone(mascarar(e.target.value))}
            placeholder="(11) 98765-4321"
            required
            autoComplete="username"
            className={input}
          />
        </div>
        <div>
          <label htmlFor="r-codigo" className={label}>Código de configuração</label>
          <input id="r-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoComplete="off" className={input} />
          <p className="mt-1 text-xs text-gray-500">
            É o <strong>SETUP_CODE</strong> do arquivo .env.local do servidor. Só quem tem acesso ao servidor consegue.
          </p>
        </div>
        <div>
          <label htmlFor="r-senha" className={label}>Nova senha (mín. 8)</label>
          <input id="r-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} autoComplete="new-password" className={input} />
        </div>
        <div>
          <label htmlFor="r-conf" className={label}>Repita a nova senha</label>
          <input id="r-conf" type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required minLength={8} autoComplete="new-password" className={input} />
        </div>
        {erro && (
          <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </p>
        )}
        <button disabled={enviando} className="w-full rounded-lg bg-brand py-3 text-lg font-semibold text-white disabled:opacity-50">
          {enviando ? "Aguarde..." : "Redefinir senha"}
        </button>
      </form>

      <Link href="/plataforma/login" className="block text-center text-sm font-medium text-brand hover:underline">
        ← Voltar ao login
      </Link>
    </div>
  );
}
