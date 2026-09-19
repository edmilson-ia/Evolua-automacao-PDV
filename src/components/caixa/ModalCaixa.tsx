"use client";

/** Janela por cima da tela (PDV e /caixa). Sem `onFechar` a pessoa não consegue dispensar (ex.: caixa obrigatório). */
export default function ModalCaixa({
  titulo,
  onFechar,
  children,
}: {
  titulo: string;
  onFechar?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onKeyDown={(e) => e.key === "Escape" && onFechar?.()}
    >
      <div className="max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 text-gray-900 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">{titulo}</h2>
          {onFechar && (
            <button type="button" onClick={onFechar} className="text-gray-500 hover:text-gray-800">
              Fechar (Esc)
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
