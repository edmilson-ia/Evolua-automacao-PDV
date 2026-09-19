"use client";

import Link from "next/link";
import { useState } from "react";
import { mascararTelefone } from "@/lib/telefone";

// Só aceita caminhos internos (evita redirecionar o usuário para outro site após o login)
const destinoSeguro = (d: string | null) => (d && d.startsWith("/") && !d.startsWith("//") ? d : null);

// Aplica a máscara de telefone; se a pessoa digitar letras/@ (acesso antigo por e-mail), deixa como está
const mascarar = (v: string) => (/[@a-zA-Z]/.test(v) ? v : mascararTelefone(v));

/** modo "login": entra na loja `loja` (sem loja = dono da plataforma). modo "setup": primeiro acesso da plataforma. */
export default function FormLogin({ de, modo, loja }: { de: string | null; modo: "login" | "setup"; loja?: string }) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [verSenha, setVerSenha] = useState(false);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const res = await fetch(modo === "login" ? "/api/auth/login" : "/api/plataforma/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modo === "login" ? { loja, identificador: telefone, senha } : { codigo, nome, telefone, senha }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Não foi possível entrar");
      // Navegação completa: garante que o layout já leia o cookie novo
      window.location.assign(destinoSeguro(de) ?? j.destino ?? "/pdv");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível entrar");
      setEnviando(false);
    }
  }

  const input = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5";
  const label = "mb-1 block text-sm font-medium text-gray-700";

  return (
    <form onSubmit={enviar} className="space-y-4">
      {modo === "setup" && (
        <>
          <div>
            <label htmlFor="f-codigo" className={label}>Código de configuração</label>
            <input id="f-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} required autoComplete="off" className={input} />
            <p className="mt-1 text-xs text-gray-500">Está no arquivo .env.local do servidor (SETUP_CODE).</p>
          </div>
          <div>
            <label htmlFor="f-nome" className={label}>Seu nome</label>
            <input id="f-nome" value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" className={input} />
          </div>
        </>
      )}
      <div>
        <label htmlFor="f-telefone" className={label}>Telefone (com DDD)</label>
        <input id="f-telefone"
          type="tel"
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(mascarar(e.target.value))}
          placeholder="(11) 98765-4321"
          required
          autoComplete="username"
          autoFocus={modo === "login"}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="f-senha" className={label}>Senha</label>
        <div className="relative">
          <input id="f-senha"
            type={verSenha ? "text" : "password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
            minLength={modo === "setup" ? 8 : undefined}
            autoComplete={modo === "login" ? "current-password" : "new-password"}
            className={`${input} pr-16`}
          />
          <button
            type="button"
            onClick={() => setVerSenha((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
          >
            {verSenha ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {modo === "setup" && <p className="mt-1 text-xs text-gray-500">Mínimo de 8 caracteres.</p>}
        {modo === "login" && (
          <div className="mt-2 text-right text-sm">
            {loja ? (
              <span className="text-gray-500">Esqueceu a senha? Peça ao administrador da loja.</span>
            ) : (
              <Link href="/recuperar-senha" className="font-medium text-brand hover:underline">
                Esqueceu sua senha?
              </Link>
            )}
          </div>
        )}
      </div>
      {erro && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      <button disabled={enviando} className="w-full rounded-lg bg-brand py-3 text-lg font-semibold text-white disabled:opacity-50">
        {enviando ? "Aguarde..." : modo === "login" ? "Entrar" : "Criar acesso do dono e entrar"}
      </button>
    </form>
  );
}
