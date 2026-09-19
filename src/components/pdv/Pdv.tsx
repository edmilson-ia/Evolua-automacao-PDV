"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import LogoutButton from "@/components/auth/LogoutButton";
import AbrirCaixa from "@/components/caixa/AbrirCaixa";
import FecharCaixa from "@/components/caixa/FecharCaixa";
import ModalCaixa from "@/components/caixa/ModalCaixa";
import MovimentoCaixa from "@/components/caixa/MovimentoCaixa";
import InstallPwaButton from "@/components/pwa/InstallPwaButton";
import { brl } from "@/lib/format";
import { gerarPayloadPix, gerarTxid, type PixConfig } from "@/lib/pix";
import type { Perfil } from "@/lib/session";
import { formatarTelefone } from "@/lib/telefone";
import type { Branding } from "@/lib/tenant";
import type { CaixaAberto } from "@/types/caixa";
import type { Cliente } from "@/types/cliente";
import type { Produto } from "@/types/produto";
import { FORMA_LABEL, FORMAS_PDV, type FormaPagamento } from "@/types/venda";
import type { Venda } from "@/types/venda";
import BuscaCliente from "./BuscaCliente";
import { tocarBeep } from "@/lib/beep";
import { baixarEstoqueLocal, buscarNoCatalogo, contarCatalogo, enfileirar, type VendaPendente } from "@/lib/offline/armazem";
import { fetchComTimeout } from "@/lib/offline/sincronizar";
import PendentesOffline from "./PendentesOffline";
import Recibo from "./Recibo";
import { useVendasOffline } from "./useVendasOffline";

type CartItem = { produto: Produto; quantidade: number };
type Forma = FormaPagamento;
type Aviso = {
  tipo: "erro" | "info";
  texto: string;
  /** Sugestão de correção: adicionar o máximo disponível. */
  maximo?: { produto: Produto; qtd: number };
};

/** Busca na cópia do catálogo guardada no aparelho (sem internet). null = este aparelho ainda não baixou o catálogo. */
async function buscarLocal(tenantId: string, termo: string): Promise<Produto[] | null> {
  try {
    return (await contarCatalogo(tenantId)) > 0 ? await buscarNoCatalogo(tenantId, termo) : null;
  } catch {
    return null;
  }
}

/** uuid v4 para identificar a venda (o servidor não grava duas vezes a mesma chave). */
function novaChave(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
  );
}

/** O termo é o SKU ou o código de barras (leitor USB) exato do produto. */
const casaCodigo = (p: Produto, termo: string) =>
  p.sku.toLowerCase() === termo.toLowerCase() || (!!p.codigo_barras && p.codigo_barras === termo);

const fmtQtd = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const num = (s: string) => Number(s.replace(",", ".")) || 0;

/** Aceita "3x produto", "3*produto" ou "3x7891234" (quantidade + produto/código), ou só o produto. */
function parseEntrada(raw: string) {
  const m = raw.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:\*|[xX](?=\s|\d))\s*(.*)$/);
  if (m) return { qtd: num(m[1]), termo: m[2].trim() };
  return { qtd: null as number | null, termo: raw.trim() };
}

export default function Pdv({
  branding,
  pix,
  operador,
  perfil,
  caixa,
  caixaObrigatorio,
  larguraCupom,
  tenantId,
  operadorId,
}: {
  branding: Branding;
  pix: PixConfig;
  operador: string;
  perfil: Perfil;
  /** Caixa aberto de quem está logado (null = sem caixa aberto). */
  caixa: CaixaAberto | null;
  caixaObrigatorio: boolean;
  larguraCupom: 58 | 80;
  tenantId: string;
  operadorId: string;
}) {
  const router = useRouter();
  const cor = branding.cor_primaria ?? "#2563eb";
  // Loja que exige caixa: sem caixa aberto o PDV fica travado na tela de abertura (o servidor também recusa a venda)
  const bloqueado = caixaObrigatorio && !caixa;

  const [carrinho, setCarrinho] = useState<CartItem[]>([]);
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [ultimo, setUltimo] = useState<Produto | null>(null);

  const [busca, setBusca] = useState("");
  const [qtdCampo, setQtdCampo] = useState("1");
  const [resultados, setResultados] = useState<Produto[]>([]);
  const [idx, setIdx] = useState(-1);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  useEffect(() => {
    if (aviso?.tipo === "erro") tocarBeep("erro");
  }, [aviso]);

  const [pagando, setPagando] = useState(false);
  const [forma, setForma] = useState<Forma>("dinheiro");
  const [desconto, setDesconto] = useState("");
  const [recebido, setRecebido] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroVenda, setErroVenda] = useState<string | null>(null);
  const [vendaFeita, setVendaFeita] = useState<Venda | null>(null);
  const [txid, setTxid] = useState("");
  const [qr, setQr] = useState<{ payload: string; url: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const [menuAberto, setMenuAberto] = useState(false);
  const [clienteAberto, setClienteAberto] = useState(false);
  const [janelaCaixa, setJanelaCaixa] = useState<"abrir" | "movimento" | "fechar" | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [entrega, setEntrega] = useState(false);
  const [enderecoEntrega, setEnderecoEntrega] = useState("");
  const [agora, setAgora] = useState<Date | null>(null);
  const [abertura, setAbertura] = useState<Date | null>(null);
  const [online, setOnline] = useState(true);
  // Modo sem internet: cópia do catálogo, fila de vendas guardadas e envio automático quando a internet volta
  const offline = useVendasOffline(tenantId, operadorId, online);
  const [painelOffline, setPainelOffline] = useState(false);
  const [vendaOffline, setVendaOffline] = useState(false);
  const chaveRef = useRef<{ assinatura: string; chave: string } | null>(null);

  const buscaRef = useRef<HTMLInputElement>(null);
  const fimListaRef = useRef<HTMLLIElement>(null);
  const teclasRef = useRef<(e: KeyboardEvent) => void>(() => {});

  // ---------- totais ----------
  const subtotal = useMemo(
    () => carrinho.reduce((s, i) => s + i.produto.preco_venda * i.quantidade, 0),
    [carrinho],
  );
  const totalUnidades = useMemo(() => carrinho.reduce((s, i) => s + i.quantidade, 0), [carrinho]);
  const descontoNum = Math.min(num(desconto), subtotal);
  const total = subtotal - descontoNum;
  const recebidoNum = num(recebido);
  const troco = Math.max(recebidoNum - total, 0);
  const entregaOk = !entrega || enderecoEntrega.trim().length > 0;
  const podeFinalizar = carrinho.length > 0 && !enviando && entregaOk && (forma !== "dinheiro" || recebidoNum >= total);

  // PIX: payload muda com o valor (desconto) — o QR é regerado automaticamente
  const payloadPix =
    pagando && forma === "pix" && pix.chave && total > 0
      ? gerarPayloadPix({ chave: pix.chave, nome: branding.nome_fantasia, cidade: pix.cidade, valor: total, txid })
      : null;

  useEffect(() => {
    if (!payloadPix) return;
    let cancelado = false;
    QRCode.toDataURL(payloadPix, { width: 320, margin: 1, errorCorrectionLevel: "M" }).then((url) => {
      if (!cancelado) setQr({ payload: payloadPix, url });
    });
    return () => {
      cancelado = true;
    };
  }, [payloadPix]);

  async function copiarPix() {
    if (!payloadPix) return;
    try {
      await navigator.clipboard.writeText(payloadPix);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setAviso({ tipo: "erro", texto: "Não foi possível copiar automaticamente" });
    }
  }

  // ---------- relógio / conexão ----------
  useEffect(() => {
    const tick = () => {
      const agoraTs = new Date();
      setAgora(agoraTs);
      setAbertura((a) => a ?? agoraTs);
    };
    const inicial = setTimeout(() => {
      tick();
      setOnline(navigator.onLine);
    }, 0);
    const t = setInterval(tick, 1000);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      clearTimeout(inicial);
      clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // ---------- busca com debounce (sugestões enquanto digita) ----------
  useEffect(() => {
    const { termo } = parseEntrada(busca);
    if (!termo) return;
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetchComTimeout(`/api/produtos?q=${encodeURIComponent(termo)}`, {}, 4000);
        if (!res.ok || cancelado) return;
        setResultados(((await res.json()) as Produto[]).slice(0, 30));
        setIdx(-1);
      } catch {
        // Sem internet: sugere a partir da cópia do catálogo guardada no aparelho
        const local = await buscarLocal(tenantId, termo);
        if (local && !cancelado) {
          setResultados(local.slice(0, 30));
          setIdx(-1);
        }
      }
    }, 200);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [busca, tenantId]);

  useEffect(() => {
    fimListaRef.current?.scrollIntoView({ block: "end" });
  }, [carrinho.length]);

  const qtdNoCarrinho = (id: string) => carrinho.find((i) => i.produto.id === id)?.quantidade ?? 0;
  const disponivel = (p: Produto) => p.quantidade - qtdNoCarrinho(p.id);

  // Alerta ao digitar: produto identificado + quantidade acima do disponível
  const entrada = parseEntrada(busca);
  const qtdPedida = entrada.qtd ?? num(qtdCampo);
  const alvo =
    (idx >= 0 ? resultados[idx] : undefined) ??
    resultados.find((p) => casaCodigo(p, entrada.termo)) ??
    (resultados.length === 1 ? resultados[0] : undefined);
  const excede = !!alvo && entrada.termo !== "" && qtdPedida > disponivel(alvo);
  const alertaDigitando =
    excede && alvo
      ? `Só há ${fmtQtd(disponivel(alvo))} ${alvo.unidade} disponíveis de ${alvo.nome.trim().toUpperCase()}` +
        (qtdNoCarrinho(alvo.id) > 0 ? ` (${fmtQtd(qtdNoCarrinho(alvo.id))} já no carrinho)` : "")
      : null;

  // ---------- ações ----------
  function adicionar(p: Produto, qtd: number) {
    if (!(qtd > 0)) {
      setAviso({ tipo: "erro", texto: "Quantidade inválida" });
      return;
    }
    const noCarrinho = qtdNoCarrinho(p.id);
    if (noCarrinho + qtd > p.quantidade) {
      const disp = p.quantidade - noCarrinho;
      const nome = p.nome.trim().toUpperCase();
      setAviso({
        tipo: "erro",
        texto:
          `Estoque insuficiente! Só há ${fmtQtd(p.quantidade)} ${p.unidade} de ${nome} em estoque` +
          (noCarrinho > 0 ? ` (${fmtQtd(noCarrinho)} já no carrinho)` : "") +
          `. Você pediu ${fmtQtd(qtd)}.`,
        maximo: disp > 0 ? { produto: p, qtd: disp } : undefined,
      });
      return;
    }
    tocarBeep("ok");
    setCarrinho((c) =>
      c.some((i) => i.produto.id === p.id)
        ? c.map((i) => (i.produto.id === p.id ? { ...i, quantidade: i.quantidade + qtd } : i))
        : [...c, { produto: p, quantidade: qtd }],
    );
    setUltimo(p);
    setSelecionado(null);
    setBusca("");
    setResultados([]);
    setIdx(-1);
    setQtdCampo("1");
    setAviso(null);
  }

  async function confirmarEntrada() {
    const { qtd, termo } = parseEntrada(busca);
    if (!termo) return;
    const quantidade = qtd ?? num(qtdCampo);
    if (idx >= 0 && resultados[idx]) return adicionar(resultados[idx], quantidade);

    let lista: Produto[];
    try {
      const res = await fetchComTimeout(`/api/produtos?q=${encodeURIComponent(termo)}`, {}, 6000);
      if (!res.ok) return setAviso({ tipo: "erro", texto: "Erro ao buscar produto" });
      lista = (await res.json()) as Produto[];
    } catch {
      const local = await buscarLocal(tenantId, termo);
      if (!local) {
        return setAviso({
          tipo: "erro",
          texto: "Sem conexão com a internet e este aparelho ainda não baixou o catálogo. Conecte uma vez para poder vender offline.",
        });
      }
      lista = local;
    }
    const exato = lista.find((p) => casaCodigo(p, termo));
    if (exato) return adicionar(exato, quantidade);
    if (lista.length === 1) return adicionar(lista[0], quantidade);
    if (lista.length === 0) return setAviso({ tipo: "erro", texto: `Produto não encontrado: ${termo}` });
    setResultados(lista.slice(0, 30));
    setIdx(0);
    setAviso({ tipo: "info", texto: "Vários produtos encontrados: escolha na lista (↑ ↓ Enter)" });
  }

  /** Troca a quantidade de um item que já está no carrinho (não soma: substitui). */
  function alterarQuantidadeItem(i: number, nova: number) {
    const item = carrinho[i];
    if (!item) return;
    const nome = item.produto.nome.trim().toUpperCase();
    if (!(nova > 0)) {
      setAviso({ tipo: "erro", texto: "Quantidade inválida" });
      return;
    }
    if (nova > item.produto.quantidade) {
      setAviso({
        tipo: "erro",
        texto: `Estoque insuficiente! Só há ${fmtQtd(item.produto.quantidade)} ${item.produto.unidade} de ${nome} em estoque. Você pediu ${fmtQtd(nova)}.`,
      });
      return;
    }
    setCarrinho((c) => c.map((x, n) => (n === i ? { ...x, quantidade: nova } : x)));
    setSelecionado(null);
    setQtdCampo("1");
    setAviso({ tipo: "info", texto: `${nome}: quantidade alterada para ${fmtQtd(nova)} ${item.produto.unidade}` });
  }

  // Enter no campo Qtd: com produto digitado, adiciona com essa quantidade;
  // sem produto digitado, ajusta o item selecionado (ou o último) do carrinho.
  async function onKeyDownQtd(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (parseEntrada(busca).termo) {
      await confirmarEntrada();
    } else if (carrinho.length > 0) {
      alterarQuantidadeItem(selecionado ?? carrinho.length - 1, num(qtdCampo));
    } else {
      setAviso({ tipo: "info", texto: "Digite o produto no campo ao lado; depois a quantidade e Enter." });
    }
    buscaRef.current?.focus();
  }

  function removerItem(i: number | null) {
    if (carrinho.length === 0) return;
    const alvo = i ?? carrinho.length - 1;
    setCarrinho((c) => c.filter((_, n) => n !== alvo));
    setSelecionado(null);
  }

  function limparVenda() {
    if (carrinho.length === 0) return;
    if (!confirm("Cancelar a venda e limpar o carrinho?")) return;
    setCarrinho([]);
    setCliente(null);
    setSelecionado(null);
    setUltimo(null);
  }

  function abrirPagamento() {
    if (bloqueado) return;
    if (carrinho.length === 0) {
      setAviso({ tipo: "erro", texto: "Adicione ao menos um produto antes de finalizar" });
      return;
    }
    setForma("dinheiro");
    setEntrega(false);
    setEnderecoEntrega(cliente?.endereco ?? "");
    setDesconto("");
    setRecebido("");
    setErroVenda(null);
    setTxid(gerarTxid());
    setCopiado(false);
    setPagando(true);
  }

  async function finalizar() {
    setErroVenda(null);
    setEnviando(true);
    const corpo = {
      itens: carrinho.map((i) => ({ produto_id: i.produto.id, quantidade: i.quantidade })),
      forma_pagamento: forma,
      desconto: descontoNum,
      valor_recebido: forma === "dinheiro" ? recebidoNum : null,
    };
    // Rede que cai no meio do envio: tentar de novo usa a MESMA chave e o servidor não grava a venda duas vezes
    const assinatura = JSON.stringify([corpo, cliente?.id ?? null, entrega, enderecoEntrega]);
    if (chaveRef.current?.assinatura !== assinatura) chaveRef.current = { assinatura, chave: novaChave() };
    const chave = chaveRef.current.chave;

    let res: Response;
    try {
      res = await fetchComTimeout(
        "/api/vendas",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...corpo,
            cliente_id: cliente?.id ?? null,
            entrega,
            entrega_endereco: entrega ? enderecoEntrega : null,
            chave,
          }),
        },
        12000,
      );
    } catch {
      setEnviando(false);
      return guardarSemInternet(corpo, chave);
    }
    setEnviando(false);
    // Sessão vencida ou servidor fora do ar: a venda já aconteceu no balcão, então fica guardada e é enviada depois
    if (res.status === 401 || res.status === 502 || res.status === 503 || res.status === 504) {
      return guardarSemInternet(corpo, chave);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setErroVenda(json?.error ?? "Erro ao finalizar a venda");
      return;
    }
    chaveRef.current = null;
    setPagando(false);
    setVendaOffline(false);
    setVendaFeita(json as Venda);
    setCarrinho([]);
    setCliente(null);
    setEntrega(false);
    setSelecionado(null);
    setUltimo(null);
    void offline.baixarCatalogo(); // o estoque local acompanha o do servidor
  }

  /** Sem internet: guarda a venda no aparelho e mostra o cupom marcado como offline. */
  async function guardarSemInternet(corpo: VendaPendente["corpo"], chave: string) {
    if (cliente || entrega) {
      setErroVenda(
        "Sem conexão com a internet. Cliente e entrega só funcionam com internet: tire o cliente (F7) e finalize de novo. " +
          "A venda fica guardada neste aparelho e é enviada quando a internet voltar.",
      );
      return;
    }
    const criadoEm = new Date().toISOString();
    const itensVenda = carrinho.map((i, n) => ({
      id: `${chave}-${n}`,
      quantidade: i.quantidade,
      preco_unitario: i.produto.preco_venda,
      subtotal: i.produto.preco_venda * i.quantidade,
      produtos: { nome: i.produto.nome, unidade: i.produto.unidade },
    }));
    const venda: Venda = {
      id: `offline-${chave}`,
      total,
      desconto: descontoNum,
      forma_pagamento: forma,
      valor_recebido: forma === "dinheiro" ? recebidoNum : null,
      troco: forma === "dinheiro" ? troco : null,
      status: "concluida",
      criado_em: criadoEm,
      operador_id: operadorId,
      operador_nome: operador,
      offline: true,
      itens_venda: itensVenda,
    };
    try {
      await enfileirar({ chave, tenantId, operadorId, caixaId: caixa?.id ?? null, criadoEm, corpo, venda, estado: "pendente", erro: null });
    } catch {
      setErroVenda("Sem conexão com a internet e este navegador não deixa guardar a venda no aparelho. Tente de novo quando a internet voltar.");
      return;
    }
    await baixarEstoqueLocal(tenantId, corpo.itens).catch(() => {});
    chaveRef.current = null;
    void offline.recarregar();
    setPagando(false);
    setVendaOffline(true);
    setVendaFeita(venda);
    setCarrinho([]);
    setCliente(null);
    setEntrega(false);
    setSelecionado(null);
    setUltimo(null);
  }

  function novaVenda() {
    setVendaFeita(null);
    setVendaOffline(false);
    setTimeout(() => buscaRef.current?.focus(), 50);
  }

  // ---------- atalhos globais (F4 finalizar, F6 produto, F7 cliente, F8 remover, F9 cancelar) ----------
  useEffect(() => {
    teclasRef.current = (e: KeyboardEvent) => {
      if (vendaFeita || clienteAberto || janelaCaixa || bloqueado) return; // as janelas cuidam das próprias teclas
      if (pagando) {
        if (e.key === "Escape") setPagando(false);
        return;
      }
      if (e.key === "F6") {
        e.preventDefault();
        buscaRef.current?.focus();
      } else if (e.key === "F7") {
        e.preventDefault();
        setClienteAberto(true);
      } else if (e.key === "F4") {
        e.preventDefault();
        abrirPagamento();
      } else if (e.key === "F8") {
        e.preventDefault();
        removerItem(selecionado);
      } else if (e.key === "F9") {
        e.preventDefault();
        limparVenda();
      } else if (e.key === "Escape") {
        setMenuAberto(false);
        setResultados([]);
      }
    };
  });
  useEffect(() => {
    const handler = (e: KeyboardEvent) => teclasRef.current(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function onKeyDownBusca(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void confirmarEntrada();
    } else if (e.key === "ArrowDown" && resultados.length) {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp" && resultados.length) {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setBusca("");
      setResultados([]);
    }
  }

  const hora = agora?.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "";
  const horaAbertura = abertura?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) ?? "";

  const marca = branding.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={branding.logo_url} alt={branding.nome_fantasia} className="h-10 w-auto rounded bg-white/95 p-1 sm:h-12" />
  ) : (
    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-xl font-bold sm:h-12 sm:w-12">
      {branding.nome_fantasia.charAt(0)}
    </span>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-white text-gray-900">
      {/* ===== Topo ===== */}
      <header className="relative z-30 flex items-center gap-3 px-3 py-2 text-white" style={{ background: cor }}>
        {marca}
        <div className="min-w-0 flex-1 text-center leading-tight">
          <div className="text-sm sm:text-lg">{caixa ? `${caixa.terminal} | Caixa aberto` : "PDV | Venda à vista"}</div>
          <div className="truncate text-lg font-semibold uppercase text-amber-300 sm:text-2xl">
            {branding.nome_fantasia}
          </div>
        </div>
        <button
          onClick={() => setMenuAberto((v) => !v)}
          aria-label="Menu"
          className="flex h-11 w-11 flex-col items-center justify-center gap-1.5 rounded-md hover:bg-white/10"
        >
          <span className="h-0.5 w-6 bg-white" />
          <span className="h-0.5 w-6 bg-white" />
          <span className="h-0.5 w-6 bg-white" />
        </button>
        {menuAberto && (
          <nav className="absolute right-3 top-full mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-800 shadow-xl">
            {[
              { href: "/dashboard", label: "Dashboard", admin: true },
              { href: "/pdv/vendas", label: "Histórico de vendas", admin: false },
              { href: "/estoque", label: "Estoque", admin: true },
              { href: "/clientes", label: "Clientes", admin: false },
              { href: `/c/${branding.slug}`, label: "Catálogo público", admin: false },
              { href: "/configuracoes/branding", label: "Marca do cliente", admin: true },
              { href: "/configuracoes/pagamentos", label: "Pagamentos", admin: true },
              { href: "/configuracoes/usuarios", label: "Usuários", admin: true },
            ]
              .filter((l) => perfil === "admin" || !l.admin)
              .map((l) => (
              <Link key={l.href} href={l.href} className="block px-4 py-3 hover:bg-gray-100">
                {l.label}
              </Link>
            ))}
            <div className="border-t border-gray-100">
              {caixa ? (
                <>
                  <button onClick={() => { setMenuAberto(false); setJanelaCaixa("movimento"); }} className="block w-full px-4 py-3 text-left hover:bg-gray-100">
                    Sangria / Suprimento
                  </button>
                  <button onClick={() => { setMenuAberto(false); setJanelaCaixa("fechar"); }} className="block w-full px-4 py-3 text-left font-medium text-red-600 hover:bg-gray-100">
                    Fechar caixa
                  </button>
                </>
              ) : (
                <button onClick={() => { setMenuAberto(false); setJanelaCaixa("abrir"); }} className="block w-full px-4 py-3 text-left font-medium text-emerald-700 hover:bg-gray-100">
                  Abrir caixa
                </button>
              )}
              <Link href="/caixa" className="block px-4 py-3 hover:bg-gray-100">Caixas e relatórios</Link>
            </div>
            <InstallPwaButton className="block w-full border-t border-gray-100 px-4 py-3 text-left font-medium text-brand hover:bg-gray-100" />
            <LogoutButton className="block w-full border-t border-gray-100 px-4 py-3 text-left text-red-600 hover:bg-gray-100">
              Sair ({operador})
            </LogoutButton>
          </nav>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ===== Painel lateral (desktop) ===== */}
        <aside className="hidden w-[32%] max-w-md shrink-0 flex-col border-r border-gray-200 lg:flex">
          <div className="m-2 rounded-xl bg-emerald-600 p-3 text-white">
            <div className="truncate text-xl font-medium">Operador(a): {operador}</div>
            <div className="text-sm">Caixa: 01</div>
            <div className="text-sm">Abertura: {horaAbertura}</div>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            {ultimo?.imagem_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ultimo.imagem_url} alt={ultimo.nome} className="max-h-64 w-auto rounded-xl object-contain" />
                <div className="text-xl font-semibold uppercase" style={{ color: cor }}>{ultimo.nome}</div>
                <div className="text-2xl font-bold">{brl(ultimo.preco_venda)}</div>
                <div className="text-sm text-gray-500">
                  Em estoque: {fmtQtd(ultimo.quantidade)} {ultimo.unidade} · restam {fmtQtd(disponivel(ultimo))} após o carrinho
                </div>
              </>
            ) : ultimo ? (
              <>
                <div className="flex h-40 w-40 items-center justify-center rounded-2xl bg-gray-100 text-7xl font-bold text-gray-300">
                  {ultimo.nome.charAt(0).toUpperCase()}
                </div>
                <div className="text-xl font-semibold uppercase" style={{ color: cor }}>{ultimo.nome}</div>
                <div className="text-2xl font-bold">{brl(ultimo.preco_venda)}</div>
              </>
            ) : (
              <>
                {branding.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={branding.logo_url} alt={branding.nome_fantasia} className="max-h-56 w-auto object-contain" />
                ) : (
                  <div
                    className="flex h-40 w-40 items-center justify-center rounded-3xl text-8xl font-bold text-white"
                    style={{ background: cor }}
                  >
                    {branding.nome_fantasia.charAt(0)}
                  </div>
                )}
                <div className="text-3xl font-bold uppercase" style={{ color: cor }}>{branding.nome_fantasia}</div>
              </>
            )}
          </div>
          <ul className="space-y-1 px-4 pb-3 text-sm text-gray-600">
            <li><kbd className="rounded border bg-gray-100 px-1.5">F4</kbd> Finalizar venda</li>
            <li><kbd className="rounded border bg-gray-100 px-1.5">F6</kbd> Buscar produto</li>
            <li><kbd className="rounded border bg-gray-100 px-1.5">F7</kbd> Pesquisar / escolher cliente</li>
            <li><kbd className="rounded border bg-gray-100 px-1.5">F8</kbd> Remover item (selecionado ou último)</li>
            <li><kbd className="rounded border bg-gray-100 px-1.5">F9</kbd> Cancelar venda</li>
            <li><kbd className="rounded border bg-gray-100 px-1.5">3x produto</kbd> Vender 3 unidades</li>
          </ul>
        </aside>

        {/* ===== Área principal ===== */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Cliente + total */}
          <div className="m-2 flex items-stretch overflow-hidden rounded-xl bg-emerald-600 text-white">
            <div className="flex min-w-0 flex-1 flex-col justify-center px-3 py-2">
              <div className="truncate text-lg sm:text-2xl">
                <span className="sm:hidden">Cliente à vista</span>
                <span className="hidden sm:inline">Cliente: **CLIENTE À VISTA**</span>
              </div>
              <div className="text-xs sm:text-sm">CPF: 000.000.000-00</div>
            </div>
            <div className="flex items-baseline justify-end gap-1 bg-amber-400 px-4 py-2 text-black">
              <span className="text-base font-bold sm:text-xl">R$</span>
              <span className="text-4xl font-bold leading-none tabular-nums sm:text-6xl">
                {subtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Itens */}
          <ul className="min-h-0 flex-1 overflow-y-auto border-y border-gray-200">
            {carrinho.length === 0 && (
              <li className="flex h-full min-h-40 flex-col items-center justify-center gap-1 px-6 text-center text-gray-400">
                <span className="text-2xl font-semibold">Caixa livre</span>
                <span className="text-sm">Leia o código de barras ou digite o código/nome do produto</span>
              </li>
            )}
            {carrinho.map((i, n) => (
              <li
                key={i.produto.id}
                onClick={() => setSelecionado(selecionado === n ? null : n)}
                className={`cursor-pointer border-b border-gray-200 px-3 py-2 ${
                  selecionado === n ? "bg-sky-200" : n % 2 ? "bg-sky-50" : "bg-white"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2 text-xs text-gray-700 sm:text-sm">
                  <span>Item {n + 1}</span>
                  <span className="truncate">
                    SKU: {i.produto.sku} · restam {fmtQtd(i.produto.quantidade - i.quantidade)} em estoque
                  </span>
                  <span className="whitespace-nowrap">
                    {fmtQtd(i.quantidade)} {i.produto.unidade.toUpperCase()} x {brl(i.produto.preco_venda)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-lg font-bold uppercase sm:text-2xl" style={{ color: cor }}>
                    {i.produto.nome}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-xl font-bold tabular-nums sm:text-3xl" style={{ color: cor }}>
                      {brl(i.produto.preco_venda * i.quantidade)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removerItem(n);
                      }}
                      aria-label={`Remover ${i.produto.nome}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-red-100 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              </li>
            ))}
            <li ref={fimListaRef} aria-hidden />
          </ul>

          {/* Resumo */}
          <div className="flex items-center justify-between px-3 py-1 text-sm text-white" style={{ background: cor }}>
            <span>Itens({carrinho.length}) · Quantidade({totalUnidades.toFixed(2)})</span>
            <span>Total: {brl(subtotal)}</span>
          </div>

          {/* Entrada de produto */}
          <div className="relative p-3">
            {resultados.length > 0 && (
              <ul className="absolute bottom-full left-3 right-3 z-20 max-h-72 overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-xl">
                {resultados.map((p, n) => (
                  <li key={p.id}>
                    <button
                      disabled={disponivel(p) <= 0}
                      onMouseEnter={() => setIdx(n)}
                      onClick={() => adicionar(p, parseEntrada(busca).qtd ?? num(qtdCampo))}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left disabled:opacity-40 ${
                        idx === n ? "bg-sky-100" : ""
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{p.nome}</span>
                        <span className="block text-xs text-gray-500">
                          SKU {p.sku} ·{" "}
                          {p.quantidade <= 0
                            ? "sem estoque"
                            : disponivel(p) <= 0
                              ? "todo o estoque já está no carrinho"
                              : `${fmtQtd(disponivel(p))} ${p.unidade} disponíveis` +
                                (qtdNoCarrinho(p.id) > 0 ? ` (estoque ${fmtQtd(p.quantidade)})` : "")}
                        </span>
                      </span>
                      <span className="font-bold" style={{ color: cor }}>{brl(p.preco_venda)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {aviso && (
              <div
                role="alert"
                className={`mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border-2 px-3 py-2 ${
                  aviso.tipo === "erro"
                    ? "border-red-500 bg-red-50 text-red-800"
                    : "border-sky-400 bg-sky-50 text-sky-800"
                }`}
              >
                <span className="min-w-0 flex-1 text-sm font-semibold sm:text-base">
                  {aviso.tipo === "erro" && "⚠ "}
                  {aviso.texto}
                </span>
                {aviso.maximo && (
                  <button
                    onClick={() => adicionar(aviso.maximo!.produto, aviso.maximo!.qtd)}
                    className="whitespace-nowrap rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-700"
                  >
                    Adicionar só {fmtQtd(aviso.maximo.qtd)} {aviso.maximo.produto.unidade}
                  </button>
                )}
              </div>
            )}
            {!aviso && alertaDigitando && (
              <p className="mb-2 rounded-lg border-2 border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800">
                ⚠ {alertaDigitando}. Reduza a quantidade.
              </p>
            )}

            {cliente && (
              <p className="mb-2 flex items-center justify-between gap-2 rounded-lg border-2 border-emerald-500 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900">
                <span className="min-w-0 truncate">
                  <strong>Cliente:</strong> {cliente.nome}
                  {cliente.telefone && ` · ${formatarTelefone(cliente.telefone)}`}
                </span>
                <button onClick={() => setCliente(null)} aria-label="Remover cliente da venda" className="shrink-0 font-bold text-emerald-800 hover:text-red-600">
                  ✕
                </button>
              </p>
            )}

            <div className="flex flex-wrap items-end gap-2 sm:flex-nowrap sm:gap-3">
              <label className="min-w-0 basis-full sm:flex-1 sm:basis-0">
                <span className="text-sm text-gray-500">Produto (F6)</span>
                <input
                  ref={buscaRef}
                  autoFocus
                  value={busca}
                  onChange={(e) => {
                    setBusca(e.target.value);
                    setAviso(null);
                    if (!parseEntrada(e.target.value).termo) {
                      setResultados([]);
                      setIdx(-1);
                    }
                  }}
                  onKeyDown={onKeyDownBusca}
                  placeholder="Código, SKU ou nome"
                  autoComplete="off"
                  className="w-full rounded-lg border-2 px-3 py-3 text-xl outline-none focus:border-sky-500"
                  style={{ background: "#d5eef3", borderColor: cor }}
                />
              </label>
              <label className="w-28 sm:w-40">
                <span className="text-sm text-gray-500">Qtd (Enter)</span>
                <input
                  value={qtdCampo}
                  onChange={(e) => setQtdCampo(e.target.value)}
                  onKeyDown={onKeyDownQtd}
                  onFocus={(e) => e.currentTarget.select()}
                  enterKeyHint="done"
                  inputMode="decimal"
                  className={`w-full rounded-lg border-2 px-3 py-3 text-right text-xl outline-none focus:border-sky-500 ${
                    excede && entrada.qtd == null
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-gray-300 bg-gray-100 text-gray-700"
                  }`}
                />
              </label>
              <button
                onClick={() => setClienteAberto(true)}
                className="h-[54px] whitespace-nowrap rounded-lg border-2 bg-white px-3 text-base font-bold hover:bg-gray-50 sm:px-4"
                style={{ borderColor: cor, color: cor }}
              >
                Cliente<span className="hidden sm:inline"> (F7)</span>
              </button>
              <button
                onClick={abrirPagamento}
                className="h-[54px] min-w-0 flex-1 rounded-lg bg-emerald-600 px-4 text-lg font-bold text-white hover:bg-emerald-700 sm:flex-none sm:px-6"
              >
                Finalizar<span className="hidden sm:inline"> (F4)</span>
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* ===== Rodapé ===== */}
      <footer className="flex items-center justify-between px-3 py-1 text-white" style={{ background: cor }}>
        <div className="text-xs sm:text-sm">
          <span className="text-amber-300">Versão 0.1</span> ·{" "}
          <span className={online ? "text-emerald-300" : "text-red-300"}>● {online ? "On-line" : "Off-line"}</span>
          {offline.fila.length > 0 && (
            <button
              onClick={() => setPainelOffline(true)}
              className="ml-2 rounded bg-amber-400 px-2 py-0.5 text-xs font-semibold text-black"
            >
              {offline.fila.length} {offline.fila.length === 1 ? "venda aguardando" : "vendas aguardando"} envio
            </button>
          )}
        </div>
        <div className="hidden text-xs text-white/80 sm:block">{branding.nome_fantasia} • PDV</div>
        <div className="text-2xl font-semibold tabular-nums text-amber-300 sm:text-3xl">{hora}</div>
      </footer>

      {painelOffline && (
        <PendentesOffline
          fila={offline.fila}
          enviando={offline.enviando}
          semSessao={offline.semSessao}
          online={online}
          onEnviar={() => void offline.enviarAgora()}
          onDescartar={(chave) => void offline.descartar(chave)}
          onFechar={() => setPainelOffline(false)}
        />
      )}

      {/* ===== Caixa: abrir (obrigatório = sem como dispensar), sangria/suprimento e fechar ===== */}
      {!caixa && (bloqueado || janelaCaixa === "abrir") && (
        <ModalCaixa titulo="Abrir caixa" onFechar={bloqueado ? undefined : () => setJanelaCaixa(null)}>
          <AbrirCaixa
            obrigatorio={caixaObrigatorio}
            onAberto={() => {
              setJanelaCaixa(null);
              router.refresh();
            }}
          />
          {bloqueado && (
            <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
              <Link href="/caixa" className="font-medium text-brand hover:underline">Ver caixas</Link>
              <LogoutButton className="font-medium text-red-600 hover:underline">Sair ({operador})</LogoutButton>
            </div>
          )}
        </ModalCaixa>
      )}
      {caixa && janelaCaixa === "movimento" && (
        <ModalCaixa titulo="Sangria / Suprimento" onFechar={() => setJanelaCaixa(null)}>
          <MovimentoCaixa
            caixaId={caixa.id}
            onConcluido={() => {
              setJanelaCaixa(null);
              router.refresh();
            }}
          />
        </ModalCaixa>
      )}
      {caixa && janelaCaixa === "fechar" && (
        <ModalCaixa titulo="Fechar caixa" onFechar={() => setJanelaCaixa(null)}>
          <FecharCaixa caixaId={caixa.id} />
        </ModalCaixa>
      )}

      {/* ===== Pesquisar cliente (só consulta) ===== */}
      {clienteAberto && (
        <BuscaCliente
          onSelecionar={(c) => {
            setCliente(c);
            setClienteAberto(false);
            setTimeout(() => buscaRef.current?.focus(), 50);
          }}
          onFechar={() => {
            setClienteAberto(false);
            setTimeout(() => buscaRef.current?.focus(), 50);
          }}
        />
      )}

      {/* ===== Pagamento ===== */}
      {pagando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (podeFinalizar) void finalizar();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target instanceof HTMLInputElement) {
                e.preventDefault();
                if (podeFinalizar) void finalizar();
              }
            }}
            className="max-h-[96dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-bold">Pagamento</h2>
              <button type="button" onClick={() => setPagando(false)} className="text-gray-500 hover:text-gray-800">
                Fechar (Esc)
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-amber-400 px-4 py-3 text-right text-black">
              <div className="text-sm">Total a pagar</div>
              <div className="text-5xl font-bold tabular-nums">{brl(total)}</div>
            </div>

            <div className="mb-3 grid grid-cols-4 gap-2">
              {FORMAS_PDV.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setForma(f)}
                  className={`rounded-lg border-2 py-3 text-sm font-semibold sm:text-base ${
                    forma === f ? "border-transparent text-white" : "border-gray-300"
                  }`}
                  style={forma === f ? { background: cor } : undefined}
                >
                  {FORMA_LABEL[f]}
                </button>
              ))}
            </div>

            {forma === "pix" && (
              <div className="mb-3 rounded-xl border-2 border-teal-500 bg-teal-50 p-3 text-center">
                {pix.chave ? (
                  <>
                    <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">Chave PIX</div>
                    <div className="mb-2 text-3xl font-bold tracking-wider text-teal-900">{pix.chave}</div>
                    {qr && qr.payload === payloadPix ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={qr.url} alt="QR Code PIX" className="mx-auto h-56 w-56 rounded-lg bg-white p-2" />
                    ) : (
                      <div className="mx-auto flex h-56 w-56 items-center justify-center rounded-lg bg-white text-sm text-gray-400">
                        Gerando QR Code...
                      </div>
                    )}
                    <div className="mt-2 text-sm text-teal-800">
                      Valor: <strong>{brl(total)}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={copiarPix}
                      className="mt-2 rounded-lg border border-teal-600 bg-white px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-100"
                    >
                      {copiado ? "✔ Código copiado" : "Copiar Pix copia e cola"}
                    </button>
                    <p className="mt-2 text-xs text-teal-700">
                      O sistema não detecta o pagamento sozinho: confirme no app do banco que o PIX caiu antes de confirmar a venda.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-red-700">Chave PIX não configurada (Configurações → Pagamentos).</p>
                )}
              </div>
            )}

            <label className="mb-2 flex items-center justify-between gap-3 text-sm">
              Desconto (R$)
              <input
                value={desconto}
                onChange={(e) => setDesconto(e.target.value)}
                inputMode="decimal"
                className="w-32 rounded-lg border border-gray-300 px-2 py-2 text-right"
              />
            </label>

            {forma === "dinheiro" && (
              <>
                <label className="mb-2 flex items-center justify-between gap-3 text-sm">
                  Valor recebido (R$)
                  <input
                    autoFocus
                    value={recebido}
                    onChange={(e) => setRecebido(e.target.value)}
                    inputMode="decimal"
                    className="w-32 rounded-lg border-2 border-sky-400 px-2 py-2 text-right text-lg"
                  />
                </label>
                <div className="mb-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setRecebido(total.toFixed(2))}
                    className="rounded-full border px-3 py-1 text-sm hover:bg-gray-100">Valor exato</button>
                  {[10, 20, 50, 100].map((v) => (
                    <button key={v} type="button" onClick={() => setRecebido(String(v))}
                      className="rounded-full border px-3 py-1 text-sm hover:bg-gray-100">R$ {v}</button>
                  ))}
                </div>
                <div className="mb-3 flex items-baseline justify-between rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
                  <span>Troco</span>
                  <span className="text-3xl font-bold tabular-nums">{brl(recebidoNum >= total ? troco : 0)}</span>
                </div>
              </>
            )}

            <div className="mb-3 rounded-xl border border-gray-300 p-3">
              <label className={`flex items-center gap-2 font-semibold ${cliente ? "" : "text-gray-400"}`}>
                <input
                  type="checkbox"
                  checked={entrega}
                  disabled={!cliente}
                  onChange={(e) => setEntrega(e.target.checked)}
                  className="h-5 w-5"
                />
                É entrega?
              </label>
              {!cliente && <p className="mt-1 text-xs text-gray-500">Para entrega, escolha um cliente antes (Esc e depois F7).</p>}
              {entrega && (
                <label className="mt-2 block">
                  <span className="text-sm text-gray-600">
                    Endereço da entrega ({cliente?.nome}
                    {cliente?.telefone ? ` · ${formatarTelefone(cliente.telefone)}` : ""})
                  </span>
                  <textarea
                    value={enderecoEntrega}
                    onChange={(e) => setEnderecoEntrega(e.target.value)}
                    maxLength={200}
                    rows={2}
                    placeholder="Rua, número, bairro, cidade"
                    className="mt-1 w-full rounded-lg border-2 border-gray-300 px-3 py-2 outline-none focus:border-sky-500"
                  />
                  {!entregaOk && <span className="text-xs text-red-600">Informe o endereço da entrega.</span>}
                </label>
              )}
            </div>

            {erroVenda && <p className="mb-2 text-sm text-red-600">{erroVenda}</p>}

            <button
              type="submit"
              disabled={!podeFinalizar}
              autoFocus={forma !== "dinheiro"}
              className="w-full rounded-lg bg-emerald-600 py-3 text-lg font-bold text-white disabled:opacity-40"
            >
              {enviando ? "Finalizando..." : forma === "pix" ? "PIX recebido — confirmar venda" : "Confirmar venda (Enter)"}
            </button>
          </form>
        </div>
      )}

      {/* ===== Recibo ===== */}
      {vendaFeita && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            {vendaOffline ? (
              <p className="mb-3 rounded-lg bg-amber-50 p-2 text-center font-semibold text-amber-900">
                Venda guardada sem internet. Será enviada sozinha quando a conexão voltar.
              </p>
            ) : (
              <p className="mb-3 text-center text-lg font-semibold text-emerald-700">Venda concluída ✔</p>
            )}
            {vendaFeita.troco != null && Number(vendaFeita.troco) > 0 && (
              <p className="mb-3 rounded-lg bg-emerald-50 py-2 text-center text-emerald-800">
                Troco: <strong className="text-2xl">{brl(Number(vendaFeita.troco))}</strong>
              </p>
            )}
            <div className="recibo-print">
              <Recibo venda={vendaFeita} nomeFantasia={branding.nome_fantasia} largura={larguraCupom} pendente={vendaOffline} />
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => window.print()} className="flex-1 rounded-lg border border-gray-300 py-2 font-medium">
                Imprimir
              </button>
              <button
                autoFocus
                onClick={novaVenda}
                className="flex-1 rounded-lg bg-brand py-2 font-medium text-white"
              >
                Nova venda (Enter)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
