-- Código de barras nos produtos + largura do cupom por loja. Rode INTEIRO no SQL Editor do Supabase (depois da 0008).
-- Não tem "drop": o aviso de operação destrutiva não deve aparecer.

-- ============ LARGURA DO CUPOM (impressora térmica), POR LOJA ============
alter table tenants
  add column if not exists largura_cupom smallint not null default 80 check (largura_cupom in (58, 80));

-- ============ CÓDIGO DE BARRAS (separado do SKU) ============
alter table produtos
  add column if not exists codigo_barras text check (codigo_barras is null or codigo_barras ~ '^[A-Za-z0-9._-]{1,30}$');

-- Único por loja entre os produtos ativos (produto excluído libera o código)
create unique index if not exists produtos_tenant_codigo_barras_uq
  on produtos (tenant_id, codigo_barras)
  where codigo_barras is not null and ativo;

-- Faz a API do Supabase enxergar já as colunas novas
notify pgrst, 'reload schema';
