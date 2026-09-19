"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CaixaAberto } from "@/types/caixa";
import AbrirCaixa from "./AbrirCaixa";
import FecharCaixa from "./FecharCaixa";
import ModalCaixa from "./ModalCaixa";
import MovimentoCaixa from "./MovimentoCaixa";

type Janela = "abrir" | "movimento" | "fechar" | null;

/** Botões do caixa do próprio usuário na página /caixa (no PDV as mesmas janelas abrem pelo menu). */
export default function AcoesCaixa({ caixa, obrigatorio }: { caixa: CaixaAberto | null; obrigatorio: boolean }) {
  const router = useRouter();
  const [janela, setJanela] = useState<Janela>(null);
  const fechar = () => setJanela(null);
  const btn = "rounded-lg px-4 py-2 font-semibold";

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {caixa ? (
          <>
            <button onClick={() => setJanela("movimento")} className={`${btn} border border-sky-600 text-sky-700`}>
              Sangria / Suprimento
            </button>
            <button onClick={() => setJanela("fechar")} className={`${btn} bg-red-600 text-white`}>
              Fechar caixa
            </button>
            <Link href="/pdv" className={`${btn} border border-gray-300 text-gray-700`}>
              Ir para o PDV
            </Link>
          </>
        ) : (
          <button onClick={() => setJanela("abrir")} className={`${btn} bg-emerald-600 text-white`}>
            Abrir caixa
          </button>
        )}
      </div>

      {janela === "abrir" && (
        <ModalCaixa titulo="Abrir caixa" onFechar={fechar}>
          <AbrirCaixa
            obrigatorio={obrigatorio}
            onAberto={() => {
              fechar();
              router.refresh();
            }}
          />
        </ModalCaixa>
      )}
      {janela === "movimento" && caixa && (
        <ModalCaixa titulo="Sangria / Suprimento" onFechar={fechar}>
          <MovimentoCaixa
            caixaId={caixa.id}
            onConcluido={() => {
              fechar();
              router.refresh();
            }}
          />
        </ModalCaixa>
      )}
      {janela === "fechar" && caixa && (
        <ModalCaixa titulo="Fechar caixa" onFechar={fechar}>
          <FecharCaixa caixaId={caixa.id} />
        </ModalCaixa>
      )}
    </>
  );
}
