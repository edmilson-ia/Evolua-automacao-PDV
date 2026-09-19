import { dataBR, type EstadoTeste } from "@/lib/teste";

/** Faixa no topo do painel enquanto a loja está no teste grátis (nos últimos 2 dias fica vermelha). */
export default function FaixaTeste({ teste }: { teste: EstadoTeste }) {
  if (teste.modo !== "teste") return null;
  const urgente = teste.diasRestantes <= 2;
  return (
    <div role="status" className={`px-3 py-1.5 text-center text-sm font-medium text-white print:hidden ${urgente ? "bg-red-600" : "bg-sky-600"}`}>
      Teste grátis:{" "}
      {teste.diasRestantes === 1 ? "último dia (vence hoje)" : `faltam ${teste.diasRestantes} dias`} — até {dataBR(teste.venceEm)}.
      Para continuar usando depois, fale com o suporte.
    </div>
  );
}
