import type { Produto } from "@/types/produto";
import type { Venda } from "@/types/venda";

/**
 * Armazenamento no aparelho (IndexedDB) para vender sem internet: cópia do catálogo e fila de vendas.
 * Tudo é separado por loja e a fila também por operador. Se o navegador bloquear o IndexedDB, as funções
 * falham e o PDV segue funcionando só com internet (quem chama trata o erro).
 */
const NOME_BANCO = "evolua-pdv-offline";
const VERSAO = 1;

export type VendaPendente = {
  /** uuid gerado no aparelho: o servidor usa para não gravar a mesma venda duas vezes. */
  chave: string;
  tenantId: string;
  operadorId: string;
  /** Caixa aberto quando a venda foi feita (para impedir fechar esse caixa com venda ainda pendente). */
  caixaId: string | null;
  criadoEm: string;
  corpo: {
    itens: { produto_id: string; quantidade: number }[];
    forma_pagamento: string;
    desconto: number;
    valor_recebido: number | null;
  };
  /** Cupom montado no aparelho, só para imprimir e mostrar enquanto a venda não foi enviada. */
  venda: Venda;
  /** "pendente" = tenta de novo sozinho; "problema" = o servidor recusou e alguém precisa decidir. */
  estado: "pendente" | "problema";
  erro: string | null;
};

type ProdutoLocal = Omit<Produto, "preco_custo"> & { chave: string; tenantId: string };

let bancoPromessa: Promise<IDBDatabase> | null = null;

function abrirBanco(): Promise<IDBDatabase> {
  if (bancoPromessa) return bancoPromessa;
  const nova = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB indisponível"));
    const abrir = indexedDB.open(NOME_BANCO, VERSAO);
    abrir.onupgradeneeded = () => {
      const db = abrir.result;
      db.createObjectStore("produtos", { keyPath: "chave" }).createIndex("tenant", "tenantId");
      const fila = db.createObjectStore("fila", { keyPath: "chave" });
      fila.createIndex("tenant", "tenantId");
      fila.createIndex("caixa", "caixaId");
    };
    abrir.onsuccess = () => resolve(abrir.result);
    abrir.onerror = () => reject(abrir.error);
  });
  bancoPromessa = nova;
  nova.catch(() => {
    bancoPromessa = null; // tenta de novo na próxima chamada
  });
  return nova;
}

const pedido = <T,>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const fimDaTransacao = (t: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });

// ---------- catálogo ----------

/** Troca a cópia do catálogo da loja pela lista nova. O preço de custo NUNCA é guardado no aparelho. */
export async function guardarCatalogo(tenantId: string, produtos: Produto[]): Promise<void> {
  const db = await abrirBanco();
  const t = db.transaction("produtos", "readwrite");
  const loja = t.objectStore("produtos");
  const antigos = await pedido(loja.index("tenant").getAllKeys(IDBKeyRange.only(tenantId)));
  for (const k of antigos) loja.delete(k);
  for (const p of produtos) {
    const { preco_custo: _custo, ...semCusto } = p;
    void _custo;
    loja.put({ ...semCusto, chave: `${tenantId}:${p.id}`, tenantId } satisfies ProdutoLocal);
  }
  await fimDaTransacao(t);
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function catalogoDaLoja(tenantId: string): Promise<ProdutoLocal[]> {
  const db = await abrirBanco();
  return pedido(db.transaction("produtos").objectStore("produtos").index("tenant").getAll(IDBKeyRange.only(tenantId)));
}

export async function contarCatalogo(tenantId: string): Promise<number> {
  return (await catalogoDaLoja(tenantId)).length;
}

/** Busca por nome, SKU ou código de barras na cópia local (igual à busca do servidor). Código exato vem primeiro. */
export async function buscarNoCatalogo(tenantId: string, termo: string): Promise<Produto[]> {
  const t = semAcento(termo.trim());
  if (!t) return [];
  const achados = (await catalogoDaLoja(tenantId)).filter(
    (p) => semAcento(p.nome).includes(t) || semAcento(p.sku).includes(t) || (p.codigo_barras ?? "").toLowerCase().includes(t),
  );
  const exato = (p: ProdutoLocal) => p.sku.toLowerCase() === t || p.codigo_barras === termo.trim();
  achados.sort((a, b) => Number(exato(b)) - Number(exato(a)) || a.nome.localeCompare(b.nome, "pt-BR"));
  return achados.map(({ chave: _c, tenantId: _t, ...p }) => {
    void _c;
    void _t;
    return { ...p, preco_custo: 0 } as Produto;
  });
}

/** Desconta do estoque LOCAL o que foi vendido sem internet (o servidor acerta de verdade no envio). */
export async function baixarEstoqueLocal(tenantId: string, itens: { produto_id: string; quantidade: number }[]): Promise<void> {
  const db = await abrirBanco();
  const t = db.transaction("produtos", "readwrite");
  const loja = t.objectStore("produtos");
  for (const i of itens) {
    const p = (await pedido(loja.get(`${tenantId}:${i.produto_id}`))) as ProdutoLocal | undefined;
    if (p) loja.put({ ...p, quantidade: p.quantidade - i.quantidade });
  }
  await fimDaTransacao(t);
}

// ---------- fila de vendas ----------

export async function enfileirar(venda: VendaPendente): Promise<void> {
  const db = await abrirBanco();
  const t = db.transaction("fila", "readwrite");
  t.objectStore("fila").put(venda);
  await fimDaTransacao(t);
}

/** Vendas guardadas deste operador nesta loja, da mais antiga para a mais nova. */
export async function listarFila(tenantId: string, operadorId: string): Promise<VendaPendente[]> {
  const db = await abrirBanco();
  const todas = await pedido(db.transaction("fila").objectStore("fila").index("tenant").getAll(IDBKeyRange.only(tenantId)));
  return (todas as VendaPendente[]).filter((v) => v.operadorId === operadorId).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

export async function atualizarNaFila(venda: VendaPendente): Promise<void> {
  return enfileirar(venda);
}

export async function removerDaFila(chave: string): Promise<void> {
  const db = await abrirBanco();
  const t = db.transaction("fila", "readwrite");
  t.objectStore("fila").delete(chave);
  await fimDaTransacao(t);
}

/** Quantas vendas guardadas ainda pertencem a este caixa (impede fechá-lo antes de enviar). */
export async function contarPendentesDoCaixa(caixaId: string): Promise<number> {
  const db = await abrirBanco();
  return pedido(db.transaction("fila").objectStore("fila").index("caixa").count(IDBKeyRange.only(caixaId)));
}
