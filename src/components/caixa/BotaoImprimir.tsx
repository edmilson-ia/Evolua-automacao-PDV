"use client";

export default function BotaoImprimir() {
  return (
    <button onClick={() => window.print()} className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 print:hidden">
      Imprimir relatório
    </button>
  );
}
