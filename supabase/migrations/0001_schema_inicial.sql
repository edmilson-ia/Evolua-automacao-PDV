-- Evolua Automação — schema inicial (MVP single-tenant, preparado para multi-tenant)

create extension if not exists "pgcrypto";

-- ============ TENANTS / BRANDING ============
create table tenants (
  id uuid primary key default gen_random_uuid(),
  nome_fantasia text not null default 'Evolua Automação',
  logo_url text,
  icone_url text,
  cor_primaria text default '#2563eb',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Tenant padrão do MVP (id fixo, usado em src/lib/tenant.ts)
insert into tenants (id) values ('00000000-0000-0000-0000-000000000001');

-- ============ CATEGORIAS ============
create table categorias (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now(),
  unique (tenant_id, nome)
);

-- ============ PRODUTOS ============
create table produtos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  categoria_id uuid references categorias(id) on delete set null,
  nome text not null,
  sku text not null,
  descricao text,
  imagem_url text,
  preco_custo numeric(12,2) not null default 0 check (preco_custo >= 0),
  preco_venda numeric(12,2) not null default 0 check (preco_venda >= 0),
  quantidade numeric(12,3) not null default 0,
  estoque_minimo numeric(12,3) not null default 0,
  unidade text not null default 'un',
  visivel_catalogo boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, sku)
);
create index produtos_tenant_nome_idx on produtos (tenant_id, nome);

-- ============ VENDAS ============
create table vendas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  total numeric(12,2) not null check (total >= 0),
  desconto numeric(12,2) not null default 0 check (desconto >= 0),
  forma_pagamento text not null check (forma_pagamento in ('dinheiro','cartao','pix')),
  valor_recebido numeric(12,2),
  troco numeric(12,2),
  status text not null default 'concluida' check (status in ('concluida','cancelada')),
  criado_em timestamptz not null default now()
);
create index vendas_tenant_data_idx on vendas (tenant_id, criado_em desc);

create table itens_venda (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  quantidade numeric(12,3) not null check (quantidade > 0),
  preco_unitario numeric(12,2) not null check (preco_unitario >= 0),
  subtotal numeric(12,2) not null check (subtotal >= 0)
);

-- ============ MOVIMENTOS DE ESTOQUE ============
create table movimentos_estoque (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada','saida','venda','ajuste')),
  quantidade numeric(12,3) not null check (quantidade > 0),
  motivo text,
  venda_id uuid references vendas(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index mov_estoque_produto_idx on movimentos_estoque (produto_id, criado_em desc);

-- ============ FUNÇÕES ============

-- Atualiza timestamp de produtos
create or replace function set_atualizado_em() returns trigger as $$
begin new.atualizado_em = now(); return new; end;
$$ language plpgsql;

create trigger produtos_atualizado_em before update on produtos
for each row execute function set_atualizado_em();

-- Registra movimento de estoque e ajusta a quantidade do produto (atômico)
create or replace function registrar_movimento(
  p_tenant_id uuid, p_produto_id uuid, p_tipo text, p_quantidade numeric, p_motivo text default null
) returns void as $$
declare delta numeric;
begin
  delta := case when p_tipo = 'entrada' then p_quantidade else -p_quantidade end;
  -- 'ajuste' é tratado como entrada; para reduzir, usar tipo 'saida'
  if p_tipo = 'ajuste' then delta := p_quantidade; end if;

  insert into movimentos_estoque (tenant_id, produto_id, tipo, quantidade, motivo)
  values (p_tenant_id, p_produto_id, p_tipo, p_quantidade, p_motivo);

  update produtos set quantidade = quantidade + delta
  where id = p_produto_id and tenant_id = p_tenant_id;
end;
$$ language plpgsql;

-- Fecha venda: cria venda + itens + baixa de estoque numa única transação
-- p_itens: [{"produto_id": "...", "quantidade": 2}, ...]
create or replace function fechar_venda(
  p_tenant_id uuid, p_itens jsonb, p_forma_pagamento text,
  p_desconto numeric default 0, p_valor_recebido numeric default null
) returns uuid as $$
declare
  v_venda_id uuid;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_prod produtos%rowtype;
  v_qtd numeric;
begin
  insert into vendas (tenant_id, total, desconto, forma_pagamento, valor_recebido)
  values (p_tenant_id, 0, p_desconto, p_forma_pagamento, p_valor_recebido)
  returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::numeric;
    select * into v_prod from produtos
      where id = (v_item->>'produto_id')::uuid and tenant_id = p_tenant_id and ativo
      for update;
    if not found then raise exception 'Produto não encontrado'; end if;
    if v_prod.quantidade < v_qtd then
      raise exception 'Estoque insuficiente para %', v_prod.nome;
    end if;

    insert into itens_venda (venda_id, produto_id, quantidade, preco_unitario, subtotal)
    values (v_venda_id, v_prod.id, v_qtd, v_prod.preco_venda, v_prod.preco_venda * v_qtd);

    insert into movimentos_estoque (tenant_id, produto_id, tipo, quantidade, motivo, venda_id)
    values (p_tenant_id, v_prod.id, 'venda', v_qtd, 'Venda PDV', v_venda_id);

    update produtos set quantidade = quantidade - v_qtd where id = v_prod.id;
    v_total := v_total + v_prod.preco_venda * v_qtd;
  end loop;

  v_total := greatest(v_total - p_desconto, 0);
  update vendas set total = v_total,
    troco = case when p_valor_recebido is not null then greatest(p_valor_recebido - v_total, 0) end
  where id = v_venda_id;

  return v_venda_id;
end;
$$ language plpgsql;

-- ============ RLS (multi-tenant futuro) ============
-- No MVP o acesso é feito via service role nas API routes.
-- Habilitar RLS + policies por tenant_id quando entrar autenticação.
