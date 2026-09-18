"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { UsuarioAuth } from "@/lib/supabase/auth-admin";
import { formatarTelefone, mascararTelefone } from "@/lib/telefone";

const PERFIL_TXT = { admin: "Administrador", operador: "Operador (caixa)" } as const;

async function erroDe(res: Response, padrao: string) {
  const j = await res.json().catch(() => null);
  return typeof j?.error === "string" ? j.error : padrao;
}

export default function GerenciarUsuarios({ usuarios, meuId }: { usuarios: UsuarioAuth[]; meuId: string }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState<"admin" | "operador">("operador");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function executar(fn: () => Promise<Response>, sucesso: string, padrao: string) {
    setErro("");
    setOk("");
    setOcupado(true);
    try {
      const res = await fn();
      if (!res.ok) throw new Error(await erroDe(res, padrao));
      setOk(sucesso);
      router.refresh();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : padrao);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  const enviarJson = (url: string, method: string, body: unknown) => () =>
    fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const feito = await executar(enviarJson("/api/usuarios", "POST", { nome, telefone, senha, perfil }), `Usuário ${nome} criado.`, "Não foi possível criar o usuário");
    if (feito) {
      setNome("");
      setTelefone("");
      setSenha("");
    }
  }

  async function redefinirSenha(u: UsuarioAuth) {
    const nova = prompt(`Nova senha para ${u.nome} (mínimo 8 caracteres):`);
    if (!nova) return;
    await executar(enviarJson(`/api/usuarios/${u.id}`, "PUT", { senha: nova }), `Senha de ${u.nome} redefinida.`, "Não foi possível redefinir a senha");
  }

  async function alterarTelefone(u: UsuarioAuth) {
    const novo = prompt(`Telefone de ${u.nome} (com DDD):`, u.telefone ? formatarTelefone(u.telefone) : "");
    if (!novo) return;
    await executar(enviarJson(`/api/usuarios/${u.id}`, "PUT", { telefone: novo }), `Telefone de ${u.nome} atualizado.`, "Não foi possível alterar o telefone");
  }

  async function mudarPerfil(u: UsuarioAuth, novo: "admin" | "operador") {
    await executar(
      enviarJson(`/api/usuarios/${u.id}`, "PUT", { perfil: novo }),
      `${u.nome} agora é ${PERFIL_TXT[novo]}. A mudança vale no próximo login.`,
      "Não foi possível alterar o perfil",
    );
  }

  async function excluir(u: UsuarioAuth) {
    if (!confirm(`Excluir o usuário ${u.nome}?`)) return;
    await executar(() => fetch(`/api/usuarios/${u.id}`, { method: "DELETE" }), `Usuário ${u.nome} excluído.`, "Não foi possível excluir");
  }

  const input = "w-full rounded-lg border border-gray-300 px-3 py-2";
  const label = "mb-1 block text-sm font-medium text-gray-700";

  return (
    <div className="space-y-6">
      <form onSubmit={criar} className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-bold">Novo usuário</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="u-nome" className={label}>Nome</label>
            <input id="u-nome" value={nome} onChange={(e) => setNome(e.target.value)} required className={input} />
          </div>
          <div>
            <label htmlFor="u-tel" className={label}>Telefone (com DDD) — será o login</label>
            <input id="u-tel"
              type="tel"
              inputMode="tel"
              value={telefone}
              onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
              placeholder="(11) 98765-4321"
              required
              className={input}
            />
          </div>
          <div>
            <label htmlFor="u-senha" className={label}>Senha inicial (mín. 8)</label>
            <input id="u-senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={8} autoComplete="new-password" className={input} />
          </div>
          <div>
            <label htmlFor="u-perfil" className={label}>Perfil</label>
            <select id="u-perfil" value={perfil} onChange={(e) => setPerfil(e.target.value as "admin" | "operador")} className={input}>
              <option value="operador">Operador (caixa): só PDV e vendas</option>
              <option value="admin">Administrador: acesso total</option>
            </select>
          </div>
        </div>
        <button disabled={ocupado} className="mt-4 rounded-lg bg-brand px-6 py-2.5 font-semibold text-white disabled:opacity-50">
          {ocupado ? "Salvando..." : "Criar usuário"}
        </button>
      </form>

      {erro && <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      {ok && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">✔ {ok}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-3">Nome</th>
              <th className="p-3">Telefone (login)</th>
              <th className="p-3">Perfil</th>
              <th className="p-3">Último acesso</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t border-gray-100">
                <td className="p-3 font-medium">
                  {u.nome} {u.id === meuId && <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">você</span>}
                </td>
                <td className="whitespace-nowrap p-3">
                  {u.telefone ? (
                    formatarTelefone(u.telefone)
                  ) : (
                    // Usuário antigo (criado por e-mail): continua entrando pelo e-mail até cadastrar o telefone
                    <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800" title={u.email}>
                      sem telefone · entra por e-mail
                    </span>
                  )}
                </td>
                <td className="p-3">
                  {u.perfil ? (
                    <select
                      value={u.perfil}
                      disabled={ocupado}
                      onChange={(e) => mudarPerfil(u, e.target.value as "admin" | "operador")}
                      className="rounded border border-gray-300 px-2 py-1"
                    >
                      <option value="admin">Administrador</option>
                      <option value="operador">Operador (caixa)</option>
                    </select>
                  ) : (
                    <span className="text-red-600">sem perfil (não entra)</span>
                  )}
                </td>
                <td className="whitespace-nowrap p-3 text-gray-600">
                  {u.ultimo_login ? new Date(u.ultimo_login).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "nunca"}
                </td>
                <td className="space-x-3 whitespace-nowrap p-3 text-right">
                  <button onClick={() => alterarTelefone(u)} disabled={ocupado} className="text-brand hover:underline">
                    {u.telefone ? "Alterar telefone" : "Cadastrar telefone"}
                  </button>
                  <button onClick={() => redefinirSenha(u)} disabled={ocupado} className="text-brand hover:underline">
                    Redefinir senha
                  </button>
                  {u.id !== meuId && (
                    <button onClick={() => excluir(u)} disabled={ocupado} className="text-red-600 hover:underline">
                      Excluir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
