"use client";

import { useEffect, useRef, useState } from "react";
import { tocarBeep } from "@/lib/beep";

type Detectado = { rawValue: string };
type DetectorNativo = { detect(fonte: HTMLVideoElement): Promise<Detectado[]> };
type ConstrutorDetector = new (opcoes: { formats: string[] }) => DetectorNativo;

const FORMATOS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];
const REPETIDO_MS = 2500; // o mesmo código lido de novo dentro deste tempo é ignorado (a câmera lê várias vezes por segundo)

function mensagemDoErro(e: unknown): string {
  const nome = e instanceof DOMException ? e.name : "";
  if (nome === "NotAllowedError") return "Sem permissão para usar a câmera. Permita o acesso nas configurações do navegador e tente de novo.";
  if (nome === "NotFoundError") return "Nenhuma câmera foi encontrada neste aparelho.";
  if (nome === "NotReadableError") return "A câmera está sendo usada por outro aplicativo. Feche-o e tente de novo.";
  return "Não foi possível abrir a câmera.";
}

/**
 * Lê código de barras pela câmera do aparelho (celular ou notebook). Usa o leitor nativo do navegador quando existe
 * (Chrome/Android) e, no resto (iPhone/Safari), a biblioteca ZXing, carregada só quando a câmera é aberta.
 * A câmera só funciona em endereço seguro (https ou localhost).
 */
export default function LeitorCamera({
  titulo = "Aponte para o código de barras",
  continuo = false,
  retorno = null,
  onLido,
  onFechar,
}: {
  titulo?: string;
  /** true = continua lendo (PDV: bipa vários produtos seguidos); false = fecha ao ler o primeiro. */
  continuo?: boolean;
  /** Texto de resposta da tela que recebeu o código (ex.: "Produto não encontrado"). */
  retorno?: string | null;
  onLido: (codigo: string) => void;
  onFechar: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trilhaRef = useRef<MediaStreamTrack | null>(null);
  const onLidoRef = useRef(onLido);
  const onFecharRef = useRef(onFechar);
  const continuoRef = useRef(continuo);
  const [erro, setErro] = useState("");
  const [ultimo, setUltimo] = useState("");
  const [temLanterna, setTemLanterna] = useState(false);
  const [lanterna, setLanterna] = useState(false);

  useEffect(() => {
    onLidoRef.current = onLido;
    onFecharRef.current = onFechar;
    continuoRef.current = continuo;
  });

  useEffect(() => {
    let parar = false;
    let stream: MediaStream | null = null;
    let controle: { stop(): void } | null = null;
    let timer: number | undefined;
    const visto = { codigo: "", em: 0 };

    const lido = (codigo: string) => {
      const agora = Date.now();
      if (codigo === visto.codigo && agora - visto.em < REPETIDO_MS) return;
      visto.codigo = codigo;
      visto.em = agora;
      tocarBeep("ok");
      setUltimo(codigo);
      onLidoRef.current(codigo);
      if (!continuoRef.current) onFecharRef.current();
    };

    async function iniciar() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setErro("A câmera só funciona em endereço seguro (https). Abra o sistema pelo endereço publicado.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        setErro(mensagemDoErro(e));
        return;
      }
      if (parar) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const trilha = stream.getVideoTracks()[0];
      trilhaRef.current = trilha;
      const capacidades = trilha.getCapabilities?.() as { torch?: boolean } | undefined;
      if (capacidades?.torch) setTemLanterna(true);

      const Detector = (window as unknown as { BarcodeDetector?: ConstrutorDetector }).BarcodeDetector;
      if (Detector) {
        const detector = new Detector({ formats: FORMATOS });
        timer = window.setInterval(async () => {
          if (video.readyState < 2) return;
          try {
            const achados = await detector.detect(video);
            if (achados[0]?.rawValue) lido(achados[0].rawValue);
          } catch {
            /* quadro sem código: segue tentando */
          }
        }, 250);
        return;
      }
      // Sem leitor nativo (iPhone/Safari): ZXing
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      if (parar) return;
      const dicas = new Map([
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF]],
      ]);
      const leitor = new BrowserMultiFormatReader(dicas, { delayBetweenScanAttempts: 200 });
      controle = await leitor.decodeFromVideoElement(video, (resultado) => {
        if (resultado) lido(resultado.getText());
      });
    }

    void iniciar();
    return () => {
      parar = true;
      window.clearInterval(timer);
      controle?.stop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function alternarLanterna() {
    const proxima = !lanterna;
    try {
      await trilhaRef.current?.applyConstraints({ advanced: [{ torch: proxima } as MediaTrackConstraintSet] });
      setLanterna(proxima);
    } catch {
      /* aparelho não aceitou: mantém como está */
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-label="Leitor de código de barras">
      <div className="flex items-center justify-between gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="font-semibold">{titulo}</span>
        <button onClick={onFechar} className="rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold" aria-label="Fechar a câmera">
          {continuo ? "Concluir" : "Fechar"}
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {!erro && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-[80%] max-w-sm rounded-xl border-4 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}
        {erro && (
          <p className="absolute inset-x-4 top-1/3 rounded-xl bg-red-600 p-4 text-center font-medium">{erro}</p>
        )}
      </div>

      <div className="space-y-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm">
        {ultimo && <p className="text-emerald-300">Lido: {ultimo}</p>}
        {retorno && <p className="font-medium text-amber-300">{retorno}</p>}
        {temLanterna && (
          <button onClick={alternarLanterna} className="rounded-lg bg-white/20 px-4 py-2 font-semibold">
            {lanterna ? "Apagar lanterna" : "Acender lanterna"}
          </button>
        )}
        {!erro && !ultimo && <p className="text-white/70">Deixe o código dentro do quadro, bem iluminado.</p>}
      </div>
    </div>
  );
}
