"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatarTelefone, mascararTelefone } from "@/lib/telefone";
import { dataBR, estadoDoTeste } from "@/lib/teste";

export type LojaAdmin = {
  id: string;
  slug: string;
  nome_fantasia: string;
  ativo: boolean;
  /** Fim do teste grátis (vazio = loja definitiva). */
  teste_ate: string | null;
  criado_em: string;
  usuarios: { id: string; nome: string; telefone: string | null; perfil: string | null }[];
};

const input = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2";
const label = "mb-1 block text-xs font-medium text-gray-700";

async function erroDe(res: Response, padrao: string) {
  const j = await res.json().catch(() => null);
  return typeof j?.error === "string" ? j.error : padrao;
}

/** Situação do teste grátis de uma loja: dias restantes, vencido ou (sem selo) definitiva. */
function SeloTeste({ testeAte }: { testeAte: string | null }) {
  const estado = estadoDoTeste(testeAte);
  if (estado.modo === "definitiva") return null;
  if (estado.modo === "vencido") {
    return <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-black">TESTE VENCIDO em {dataBR(estado.venceEm)}</span>;
  }
  return (
    <span className="ml-2 rounded-full bg-sky-600 px-2 py-0.5 text-xs font-bold text-white">
      TESTE: {estado.diasRestantes} {estado.diasRestantes === 1 ? "dia" : "dias"} (até {dataBR(estado.venceEm)})
    </span>
  );
}

export default function GerenciarLojas({ lojas }: { lojas: LojaAdmin[] }) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [adminNome, setAdminNome] = useState("");
  const [adminTel, setAdminTel] = useState("");
  const [adminSenha, setAdminSenha] = useState("");
  const [diasTeste, setDiasTeste] = useState("7");
  const [exemplos, setExemplos] = useState(true);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function executar(fn: () => Promise<Response>, sucesso: string, padrao: string): Promise<boolean> {
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

  const json = (url: string, method: string, body: unknown) => () =>
    fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const feito = await executar(
      json("/api/plataforma/lojas", "POST", {
        nome_fantasia: nome,
        slug,
        admin: { nome: adminNome, telefone: adminTel, senha: adminSenha },
        dias_teste: Number(diasTeste),
        com_exemplos: exemplos && Number(diasTeste) > 0,
      }),
      `Loja ${nome} criada${Number(diasTeste) > 0 ? ` com ${diasTeste} dias de teste` : ""}. Link de acesso: /c/${slug.trim().toLowerCase()}/login`,
      "Não foi possível criar a loja",
    );
    if (feito) {
      setNome("");
      setSlug("");
      setAdminNome("");
      setAdminTel("");
      setAdminSenha("");
    }
  }

  function alternar(l: LojaAdmin) {
    const acao = l.ativo ? "suspender" : "reativar";
    if (!confirm(`Deseja ${acao} a loja "${l.nome_fantasia}"?${l.ativo ? " Ninguém da loja conseguirá entrar." : ""}`)) return;
    void executar(json(`/api/plataforma/lojas/${l.id}`, "PATCH", { ativo: !l.ativo }), `Loja ${l.ativo ? "suspensa" : "reativada"}.`, "Não foi possível alterar");
  }

  function prorrogar(l: LojaAdmin) {
    const resposta = prompt(`Prorrogar o teste de "${l.nome_fantasia}" por quantos dias? (1 a 90)`, "7");
    if (!resposta) return;
    void executar(json(`/api/plataforma/lojas/${l.id}`, "PATCH", { acao: "prorrogar", dias: Number(resposta) }), "Teste prorrogado.", "Não foi possível prorrogar");
  }

  function ativar(l: LojaAdmin) {
    if (!confirm(`Ativar a loja "${l.nome_fantasia}" de vez? O prazo de teste é removido e ela passa a ser uma loja definitiva.`)) return;
    void executar(json(`/api/plataforma/lojas/${l.id}`, "PATCH", { acao: "ativar" }), "Loja ativada (sem prazo).", "Não foi possível ativar");
  }

  async function copiar(texto: string, o_que: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setErro("");
      setOk(`Link ${o_que} copiado: ${texto}`);
    } catch {
      setOk("");
      setErro(`Não consegui copiar sozinho. Link ${o_que}: ${texto}`);
    }
  }

  function redefinirSenha(l: LojaAdmin, u: LojaAdmin["usuarios"][number]) {
    const nova = prompt(`Nova senha para ${u.nome} (mín. 8 caracteres):`);
    if (!nova) return;
    void executar(json(`/api/plataforma/lojas/${l.id}/usuarios/${u.id}`, "PUT", { senha: nova }), `Senha de ${u.nome} redefinida.`, "Não foi possível redefinir");
  }

  return (
    <div className="space-y-6">
      <form onSubmit={criar} className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Nova loja</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="l-nome" className={label}>Nome da loja</label>
            <input id="l-nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={60} className={input} />
          </div>
          <div>
            <label htmlFor="l-slug" className={label}>Endereço (link: /c/…)</label>
            <input id="l-slug" value={slug} onChange={(e) => setSlug(e.target.value)} required placeholder="minha-loja" autoCapitalize="none" className={input} />
          </div>
          <div>
            <label htmlFor="l-an" className={label}>Administrador: nome</label>
            <input id="l-an" value={adminNome} onChange={(e) => setAdminNome(e.target.value)} required maxLength={60} className={input} />
          </div>
          <div>
            <label htmlFor="l-at" className={label}>Administrador: telefone</label>
            <input id="l-at" type="tel" value={adminTel} onChange={(e) => setAdminTel(mascararTelefone(e.target.value))} required placeholder="(11) 98765-4321" className={input} />
          </div>
          <div>
            <label htmlFor="l-as" className={label}>Administrador: senha (mín. 8)</label>
            <input id="l-as" type="password" value={adminSenha} onChange={(e) => setAdminSenha(e.target.value)} required minLength={8} autoComplete="new-password" className={input} />
          </div>
          <div>
            <label htmlFor="l-dias" className={label}>Período de teste grátis</label>
            <select id="l-dias" value={diasTeste} onChange={(e) => setDiasTeste(e.target.value)} className={input}>
              <option value="7">7 dias</option>
              <option value="14">14 dias</option>
              <option value="30">30 dias</option>
              <option value="0">Sem teste (loja definitiva)</option>
            </select>
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" checked={exemplos && Number(diasTeste) > 0} disabled={Number(diasTeste) === 0} onChange={(e) => setExemplos(e.target.checked)} />
            Já vir com produtos de exemplo (para demonstrar)
          </label>
        </div>
        <button disabled={ocupado} className="rounded-lg bg-brand px-5 py-2.5 font-semibold text-white disabled:opacity-50">
          Criar loja e administrador
        </button>
      </form>

      {erro && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✔ {ok}</p>}

      <ul className="space-y-3">
        {lojas.map((l) => (
          <li key={l.id} className={`rounded-xl border bg-white p-4 ${l.ativo ? "border-gray-200" : "border-red-200 bg-red-50/40"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">
                  {l.nome_fantasia}
                  {!l.ativo && <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">SUSPENSA</span>}
                  <SeloTeste testeAte={l.teste_ate} />
                </div>
                <div className="text-sm text-gray-500">/c/{l.slug}</div>
              </div>
              <div className="flex flex-wrap gap-2">
              {l.teste_ate && (
                <>
                  <button onClick={() => prorrogar(l)} disabled={ocupado} className="rounded-lg border border-sky-400 px-3 py-1.5 text-sm font-medium text-sky-700">Prorrogar teste</button>
                  <button onClick={() => ativar(l)} disabled={ocupado} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">Ativar (fim do teste)</button>
                </>
              )}
              <button
                onClick={() => alternar(l)}
                disabled={ocupado}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${l.ativo ? "border-red-300 text-red-700" : "border-emerald-400 text-emerald-700"}`}
              >
                {l.ativo ? "Suspender" : "Reativar"}
              </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              <button onClick={() => copiar(`${window.location.origin}/c/${l.slug}`, "do catálogo")} className="text-brand hover:underline">Copiar link do catálogo</button>
              <button onClick={() => copiar(`${window.location.origin}/c/${l.slug}/login`, "de acesso")} className="text-brand hover:underline">Copiar link de acesso</button>
            </div>
            <ul className="mt-3 divide-y divide-gray-100 text-sm">
              {l.usuarios.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {u.nome} · {u.telefone ? formatarTelefone(u.telefone) : "sem telefone"} ·{" "}
                    <span className="text-gray-500">{u.perfil === "admin" ? "Administrador" : "Operador"}</span>
                  </span>
                  <button onClick={() => redefinirSenha(l, u)} disabled={ocupado} className="text-brand hover:underline">
                    Redefinir senha
                  </button>
                </li>
              ))}
              {l.usuarios.length === 0 && <li className="py-2 text-gray-500">Nenhum usuário.</li>}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
