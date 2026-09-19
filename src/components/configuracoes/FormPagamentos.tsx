"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfigPagamento } from "@/lib/tenant";

const input = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5";
const label = "mb-1 block text-sm font-medium text-gray-700";

export default function FormPagamentos({ inicial }: { inicial: ConfigPagamento }) {
  const router = useRouter();
  const [pixChave, setPixChave] = useState(inicial.pix_chave);
  const [pixCidade, setPixCidade] = useState(inicial.pix_cidade);
  const [debito, setDebito] = useState(String(inicial.debito));
  const [credito, setCredito] = useState(String(inicial.credito));
  const [caixaObrigatorio, setCaixaObrigatorio] = useState(inicial.caixa_obrigatorio);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setOk(false);
    setEnviando(true);
    try {
      const res = await fetch("/api/configuracoes/pagamentos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pix_chave: pixChave,
          pix_cidade: pixCidade,
          // Aceita vírgula decimal (2,5)
          taxa_debito: debito.replace(",", "."),
          taxa_credito: credito.replace(",", "."),
          caixa_obrigatorio: caixaObrigatorio,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Não foi possível salvar");
      setOk(true);
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível salvar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="max-w-xl space-y-6">
      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">PIX</h2>
        <div>
          <label htmlFor="p-chave" className={label}>Chave PIX</label>
          <input id="p-chave" value={pixChave} onChange={(e) => setPixChave(e.target.value)} maxLength={77} autoComplete="off" className={input} />
          <p className="mt-1 text-xs text-gray-500">CPF/CNPJ, telefone, e-mail ou chave aleatória. Aparece no QR Code do PDV.</p>
        </div>
        <div>
          <label htmlFor="p-cidade" className={label}>Cidade do recebedor</label>
          <input id="p-cidade" value={pixCidade} onChange={(e) => setPixCidade(e.target.value)} maxLength={15} placeholder="SAO PAULO" className={input} />
          <p className="mt-1 text-xs text-gray-500">Máximo de 15 caracteres, sem acento (padrão do PIX).</p>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">Taxas da maquininha</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="p-deb" className={label}>Débito (%)</label>
            <input id="p-deb" inputMode="decimal" value={debito} onChange={(e) => setDebito(e.target.value)} required className={input} />
          </div>
          <div>
            <label htmlFor="p-cred" className={label}>Crédito (%)</label>
            <input id="p-cred" inputMode="decimal" value={credito} onChange={(e) => setCredito(e.target.value)} required className={input} />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Usadas só para calcular o valor líquido no histórico e no dashboard (não aparecem no recibo do cliente).
          Se mudar a taxa, o histórico antigo é recalculado com a nova.
        </p>
      </section>

      <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
        <h2 className="font-semibold">Caixa</h2>
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={caixaObrigatorio} onChange={(e) => setCaixaObrigatorio(e.target.checked)} className="mt-1 h-5 w-5" />
          <span>
            <span className="font-medium">Exigir caixa aberto para vender</span>
            <span className="block text-xs text-gray-500">
              Desligado: o caixa é opcional. Ligado: o PDV só vende depois de abrir o caixa (valor inicial), e o fechamento
              confere o que foi vendido por forma de pagamento.
            </span>
          </span>
        </label>
      </section>

      {erro && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      {ok && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✔ Configurações salvas.</p>}
      <button disabled={enviando} className="rounded-lg bg-brand px-6 py-3 font-semibold text-white disabled:opacity-50">
        {enviando ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}
