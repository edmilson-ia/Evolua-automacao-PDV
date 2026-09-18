import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sem conexão" };

// Mostrada pelo service worker quando não há internet nem cópia da página pedida.
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand text-4xl text-white">!</div>
      <h1 className="text-2xl font-bold">Sem conexão com a internet</h1>
      <p className="max-w-sm text-gray-600">
        Não foi possível carregar esta tela. Vendas, estoque e busca precisam de internet.
        Verifique a conexão e tente de novo.
      </p>
      {/* Link normal (não next/link): força uma nova requisição de página inteira */}
      <a href="/pdv" className="rounded-lg bg-brand px-6 py-3 font-semibold text-white">
        Tentar novamente
      </a>
    </main>
  );
}
