"use client";

import { useState } from "react";
import Recibo from "@/components/pdv/Recibo";
import type { Venda } from "@/types/venda";

type Largura = 58 | 80;

const VENDA_TESTE: Venda = {
  id: "teste",
  total: 47.8,
  desconto: 0,
  forma_pagamento: "dinheiro",
  valor_recebido: 50,
  troco: 2.2,
  status: "concluida",
  criado_em: new Date().toISOString(),
  operador_nome: "Teste de impressão",
  itens_venda: [
    { id: "1", quantidade: 2, preco_unitario: 9.9, subtotal: 19.8, produtos: { nome: "Refrigerante Cola 2L", unidade: "un" } },
    { id: "2", quantidade: 1, preco_unitario: 26.9, subtotal: 26.9, produtos: { nome: "Arroz tipo 1 5kg", unidade: "un" } },
    { id: "3", quantidade: 1, preco_unitario: 1.1, subtotal: 1.1, produtos: { nome: "Produto com nome bem comprido para testar a quebra de linha", unidade: "un" } },
  ],
};

export default function ConfigImpressao({ inicial, nomeFantasia }: { inicial: Largura; nomeFantasia: string }) {
  const [largura, setLargura] = useState<Largura>(inicial);
  const [salvo, setSalvo] = useState<Largura>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/configuracoes/impressao", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ largura_cupom: largura }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Não foi possível salvar");
      setSalvo(largura);
      setMsg({ ok: true, texto: "Salvo! O PDV já imprime nessa largura." });
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "Erro inesperado" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="space-y-4">
        <fieldset className="rounded-lg border border-gray-200 p-4">
          <legend className="px-1 text-sm font-semibold">Largura do papel</legend>
          {([80, 58] as const).map((l) => (
            <label key={l} className="mt-2 flex items-start gap-2 text-sm">
              <input type="radio" name="largura" checked={largura === l} onChange={() => setLargura(l)} className="mt-1" />
              <span>
                <strong>{l} mm</strong>
                <span className="block text-gray-500">
                  {l === 80 ? "Impressora de balcão (cerca de 42 a 48 caracteres por linha)." : "Impressora pequena/portátil (cerca de 32 caracteres por linha)."}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {msg && (
          <div role="status" className={`rounded-lg border p-3 text-sm ${msg.ok ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-800"}`}>
            {msg.texto}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={salvar} disabled={salvando || largura === salvo} className="rounded-lg bg-brand px-4 py-2 font-medium text-white disabled:opacity-50">
            {salvando ? "Salvando…" : "Salvar"}
          </button>
          <button onClick={() => window.print()} className="rounded-lg border border-brand px-4 py-2 font-medium text-brand">
            Imprimir cupom de teste
          </button>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <p className="mb-2 font-semibold">Como conferir na sua impressora (USB)</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Instale a impressora no Windows e deixe-a como padrão.</li>
            <li>Escolha a largura acima e clique em <strong>Imprimir cupom de teste</strong>.</li>
            <li>Na janela de impressão, deixe as <strong>margens em &quot;Nenhuma&quot;</strong> e a escala em 100%.</li>
            <li>Conferiu o texto inteiro, sem cortar nas bordas? Então está pronto.</li>
          </ol>
          <p className="mt-3 font-semibold">Imprimir direto, sem abrir a janela</p>
          <p>
            Abra o Chrome do caixa com o atalho <code className="rounded bg-white px-1">chrome.exe --kiosk-printing</code>.
            Aí o botão Imprimir do PDV manda direto para a impressora padrão.
          </p>
        </div>
      </section>

      <section>
        <p className="mb-2 text-sm font-semibold">Pré-visualização ({largura} mm)</p>
        <div className="recibo-print inline-block rounded-lg border border-gray-300 bg-white p-2 shadow-sm">
          <Recibo venda={VENDA_TESTE} nomeFantasia={nomeFantasia} largura={largura} />
        </div>
      </section>
    </div>
  );
}
