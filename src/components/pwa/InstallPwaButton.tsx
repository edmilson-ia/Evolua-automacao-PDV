"use client";

import { useEffect, useState } from "react";

// Evento não padronizado do Chrome/Edge/Android que permite disparar o instalador.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Botão "Instalar app".
 *  - Android / Chrome / Edge: abre o instalador do navegador.
 *  - iPhone/iPad (Safari não tem instalador programável): mostra o passo a passo.
 *  - Já instalado (ou navegador sem suporte): não aparece.
 */
export default function InstallPwaButton({ className }: { className?: string }) {
  const [evento, setEvento] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [instalado, setInstalado] = useState(false);
  const [ajudaIos, setAjudaIos] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setInstalado(standalone);
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    }, 0);

    const antes = (e: Event) => {
      e.preventDefault();
      setEvento(e as BeforeInstallPromptEvent);
    };
    const depois = () => {
      setInstalado(true);
      setEvento(null);
    };
    window.addEventListener("beforeinstallprompt", antes);
    window.addEventListener("appinstalled", depois);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", antes);
      window.removeEventListener("appinstalled", depois);
    };
  }, []);

  if (instalado || (!evento && !ios)) return null;

  async function instalar() {
    if (evento) {
      await evento.prompt();
      await evento.userChoice;
      setEvento(null);
    } else {
      setAjudaIos(true);
    }
  }

  return (
    <>
      <button type="button" onClick={instalar} className={className}>
        Instalar app
      </button>
      {ajudaIos && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-gray-900 shadow-2xl">
            <h2 className="mb-2 text-lg font-bold">Instalar no iPhone / iPad</h2>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Abra este site no <strong>Safari</strong>.</li>
              <li>Toque no botão <strong>Compartilhar</strong> (quadrado com seta para cima).</li>
              <li>Escolha <strong>Adicionar à Tela de Início</strong>.</li>
            </ol>
            <button
              type="button"
              onClick={() => setAjudaIos(false)}
              className="mt-4 w-full rounded-lg bg-brand py-2 font-medium text-white"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
