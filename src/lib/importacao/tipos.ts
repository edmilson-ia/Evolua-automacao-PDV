/** Limites da importação de produtos por planilha. */
export const LIMITE_BYTES = 5 * 1024 * 1024;
export const LIMITE_LINHAS = 2000;
export const TAMANHO_LOTE = 100;

export type Celula = string | number;

export type Planilha = { colunas: string[]; linhas: Celula[][] };

export const CAMPOS = [
  { id: "sku", rotulo: "SKU (código)", obrigatorio: true, apelidos: ["sku", "codigo", "codigo do produto", "cod", "ref", "referencia"] },
  { id: "nome", rotulo: "Nome", obrigatorio: true, apelidos: ["nome", "produto", "descricao do produto", "titulo"] },
  { id: "categoria", rotulo: "Categoria", obrigatorio: false, apelidos: ["categoria", "grupo", "departamento"] },
  { id: "preco_custo", rotulo: "Preço de custo", obrigatorio: false, apelidos: ["preco custo", "preco de custo", "custo"] },
  { id: "preco_venda", rotulo: "Preço de venda", obrigatorio: false, apelidos: ["preco venda", "preco de venda", "preco", "valor", "venda"] },
  { id: "quantidade", rotulo: "Quantidade em estoque", obrigatorio: false, apelidos: ["quantidade", "qtd", "qtde", "estoque", "saldo"] },
  { id: "estoque_minimo", rotulo: "Estoque mínimo", obrigatorio: false, apelidos: ["estoque minimo", "minimo", "qtd minima"] },
  { id: "unidade", rotulo: "Unidade", obrigatorio: false, apelidos: ["unidade", "un", "und"] },
  { id: "descricao", rotulo: "Descrição", obrigatorio: false, apelidos: ["descricao", "detalhes", "observacao"] },
] as const;

export type CampoId = (typeof CAMPOS)[number]["id"];

/** Campo → índice da coluna da planilha (null = não importar). */
export type Mapeamento = Partial<Record<CampoId, number | null>>;

export type Acao = "criar" | "atualizar" | "reativar";

/** Só os campos mapeados aparecem: a atualização por SKU nunca mexe no que não foi mapeado. */
export type DadosLinha = {
  sku: string;
  nome?: string;
  categoria?: string | null;
  preco_custo?: number;
  preco_venda?: number;
  quantidade?: number;
  estoque_minimo?: number;
  unidade?: string;
  descricao?: string | null;
};

export type LinhaValidada = { linha: number; dados: DadosLinha; erros: string[] };

export type LinhaPlano = {
  linha: number;
  acao: Acao;
  dados: DadosLinha;
  produtoId: string | null;
  quantidadeAtual: number | null;
  categoriaNova: boolean;
};

export type ErroLinha = { linha: number; sku: string; erro: string };

export type Plano = {
  itens: LinhaPlano[];
  erros: ErroLinha[];
  categoriasNovas: string[];
  totais: { criar: number; atualizar: number; reativar: number; erros: number };
};
