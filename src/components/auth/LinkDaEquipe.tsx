"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/**
 * Link de acesso para os colaboradores (operadores): o mesmo login da loja, pronto para copiar, mandar pelo WhatsApp
 * ou abrir no celular por QR Code. O funcionário entra com o telefone e a senha que o administrador cadastrou.
 */
export default function LinkDaEquipe({ link, nomeLoja }: { link: string; nomeLoja: string }) {
  const [copiado, setCopiado] = useState(false);
  const [qr, setQr] = useState("");
  const [mostrarQr, setMostrarQr] = useState(false);

  const mensagem =
    `Olá! Este é o acesso ao sistema da ${nomeLoja}:\n${link}\n\n` +
    "Entre com o seu telefone (com DDD) e a senha que eu te passei.\n" +
    "Dica: no celular, toque em \"Instalar app\" na tela de login para ficar como um aplicativo.";

  useEffect(() => {
    if (!mostrarQr) return;
    let cancelado = false;
    QRCode.toDataURL(link, { width: 240, margin: 1, errorCorrectionLevel: "M" }).then((url) => {
      if (!cancelado) setQr(url);
    });
    return () => {
      cancelado = true;
    };
  }, [mostrarQr, link]);

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.prompt("Copie o texto abaixo (Ctrl+C):", texto);
    }
  }

  return (
    <section className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-sky-900">Link de acesso da equipe (colaboradores)</h2>
      <p className="mt-1 text-sm text-sky-900/80">
        Mande este link aos seus funcionários. Eles entram com o <strong>telefone e a senha</strong> que você cadastra abaixo
        e veem só o que o perfil <strong>operador</strong> permite (PDV, vendas, caixa e clientes).
      </p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Link de acesso da equipe"
          className="w-full min-w-0 flex-1 rounded-lg border border-sky-300 bg-white px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button onClick={() => copiar(link)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
            {copiado ? "Copiado ✔" : "Copiar link"}
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Enviar por WhatsApp
          </a>
          <button onClick={() => setMostrarQr((v) => !v)} className="rounded-lg border border-sky-400 bg-white px-4 py-2 text-sm font-medium text-sky-800">
            {mostrarQr ? "Esconder QR Code" : "Mostrar QR Code"}
          </button>
        </div>
      </div>

      {mostrarQr && (
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-white p-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR Code do link de acesso da equipe" className="h-40 w-40" />
          ) : (
            <span className="text-sm text-gray-500">Gerando…</span>
          )}
          <p className="max-w-xs text-sm text-gray-700">
            O funcionário aponta a câmera do celular para o QR Code e o login da loja abre na hora.
          </p>
        </div>
      )}

      <details className="mt-3 text-sm text-sky-900">
        <summary className="cursor-pointer font-medium">Como o funcionário instala como aplicativo</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Android (Chrome):</strong> abrir o link e tocar em <strong>Instalar app</strong> (ou menu ⋮ → Instalar aplicativo).</li>
          <li><strong>iPhone (Safari):</strong> abrir o link, tocar em <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>.</li>
          <li><strong>Computador:</strong> é só abrir o link no navegador.</li>
        </ul>
      </details>
    </section>
  );
}
