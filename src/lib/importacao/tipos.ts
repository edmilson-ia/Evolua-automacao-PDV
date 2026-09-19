/** Limites da importação de produtos por planilha. */
export const LIMITE_BYTES = 5 * 1024 * 1024;
export const LIMITE_LINHAS = 2000;
export const TAMANHO_LOTE = 100;

export type Celula = string | number;

export type Planilha = { colunas: string[]; linhas: Celula[][] };

export const CAMPOS = [
  { id: "sku", rotulo: "SKU (código)", apelidos: ["sku", "codigo", "codigo do produto", "cod", "ref", "referencia"] },
  { id: "nome", rotulo: "Nome", apelidos: ["nome", "produto", "descricao do produto", "titulo"] },
  { id: "categoria", rotulo: "Categoria", apelidos: ["categoria", "grupo", "departamento"] },
  { id: "preco_custo", rotulo: "Preço de custo", apelidos: ["preco custo", "preco de custo", "custo"] },
  { id: "preco_venda", rotulo: "Preço de venda", apelidos: ["preco venda", "preco de venda", "preco", "valor", "venda"] },
  { id: "quantidade", rotulo: "Quantidade em estoque", apelidos: ["quantidade", "qtd", "qtde", "estoque", "saldo"] },
  { id: "estoque_minimo", rotulo: "Estoque mínimo", apelidos: ["estoque minimo", "minimo", "qtd minima"] },
  { id: "unidade", rotulo: "Unidade", apelidos: ["unidade", "un", "und"] },
  { id: "descricao", rotulo: "Descrição", apelidos: ["descricao", "detalhes", "observacao"] },
  { id: "codigo_barras", rotulo: "Código de barras", apelidos: ["codigo de barras", "cod de barras", "cod barras", "codbarras", "barras", "ean", "ean13", "gtin"] },
  { id: "imagem", rotulo: "Link da imagem (foto)", apelidos: ["link imagem", "link da imagem", "url imagem", "url da imagem", "link foto", "link da foto", "url foto", "imagem url", "foto url"] },
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
  codigo_barras?: string;
  /** Link (https) da foto do produto: baixada DEPOIS da importação, em lotes (POST /api/produtos/imagens). */
  imagem_link?: string;
};

export type LinhaValidada = { linha: number; dados: DadosLinha; erros: string[] };

export type LinhaPlano = {
  linha: number;
  acao: Acao;
  dados: DadosLinha;
  produtoId: string | null;
  quantidadeAtual: number | null;
  categoriaNova: boolean;
  /** O produto que já existe (por SKU) já tem foto. */
  tinhaFoto: boolean;
  /** Nome igual a outro produto: já existe no estoque ou aparece antes no arquivo. */
  repetido: { motivo: "estoque" | "arquivo"; com: string; produtoId?: string; tinhaFoto?: boolean } | null;
};

/** Foto a baixar depois da importação. */
export type FotoPendente = { produto_id: string; linha: number; nome: string; url: string };

export type ErroLinha = { linha: number; sku: string; erro: string };

export type Plano = {
  itens: LinhaPlano[];
  erros: ErroLinha[];
  categoriasNovas: string[];
  avisos: { semSku: number; semPreco: number };
  totais: { criar: number; atualizar: number; reativar: number; erros: number; repetidos: number };
};
