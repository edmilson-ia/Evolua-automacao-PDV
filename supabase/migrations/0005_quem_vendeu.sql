-- Quem vendeu: operador em cada venda e movimento de estoque + trilha de auditoria.
-- Rode INTEIRO no SQL Editor do Supabase. As funções mudam de assinatura: as antigas são removidas.

-- ============ COLUNAS ============
-- operador_id = id do usuário no Supabase Auth (sem FK: apagar o usuário não pode apagar/travar a venda).
-- operador_nome = cópia do nome na hora do fato: o histórico não muda se o usuário for renomeado.
alter table vendas
  add column if not exists operador_id uuid,
  add column if not exists operador_nome text,
  add column if not exists caixa_id uuid; -- reservado para a abertura/fechamento de caixa

alter table movimentos_estoque
  add column if not exists operador_id uuid,
  add column if not exists operador_nome text;

create index if not exists vendas_operador_idx on vendas (tenant_id, operador_id, criado_em desc);

-- ============ AUDITORIA ============
create table if not exists auditoria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  acao text not null,                 -- 'venda_cancelada' | 'movimento_estoque'
  entidade text not null,             -- 'venda' | 'produto'
  entidade_id uuid,
  operador_id uuid,
  operador_nome text,
  detalhe jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists auditoria_tenant_data_idx on auditoria (tenant_id, criado_em desc);

-- Sem policies: só a service role (servidor) enxerga a tabela; a chave pública não.
alter table auditoria enable row level security;

-- ============ FUNÇÕES (novas assinaturas) ============
drop function if exists registrar_movimento(uuid, uuid, text, numeric, text);
drop function if exists fechar_venda(uuid, jsonb, text, numeric, numeric);
drop function if exists cancelar_venda(uuid, uuid, text, text);

-- Movimento MANUAL de estoque (entrada/saída/ajuste). Grava também na auditoria.
create or replace function registrar_movimento(
  p_tenant_id uuid, p_produto_id uuid, p_tipo text, p_quantidade numeric, p_motivo text,
  p_operador_id uuid, p_operador_nome text
) returns void as $$
declare delta numeric;
begin
  if p_operador_id is null then raise exception 'Operador obrigatório'; end if;
  delta := case when p_tipo = 'entrada' then p_quantidade else -p_quantidade end;
  -- 'ajuste' é tratado como entrada; para reduzir, usar tipo 'saida'
  if p_tipo = 'ajuste' then delta := p_quantidade; end if;

  insert into movimentos_estoque (tenant_id, produto_id, tipo, quantidade, motivo, operador_id, operador_nome)
  values (p_tenant_id, p_produto_id, p_tipo, p_quantidade, p_motivo, p_operador_id, p_operador_nome);

  update produtos set quantidade = quantidade + delta
  where id = p_produto_id and tenant_id = p_tenant_id;

  insert into auditoria (tenant_id, acao, entidade, entidade_id, operador_id, operador_nome, detalhe)
  values (p_tenant_id, 'movimento_estoque', 'produto', p_produto_id, p_operador_id, p_operador_nome,
          jsonb_build_object('tipo', p_tipo, 'quantidade', p_quantidade, 'motivo', p_motivo));
end;
$$ language plpgsql;

-- Fecha venda: venda + itens + baixa de estoque numa única transação, com o operador da sessão.
-- p_itens: [{"produto_id": "...", "quantidade": 2}, ...]
create or replace function fechar_venda(
  p_tenant_id uuid, p_itens jsonb, p_forma_pagamento text,
  p_desconto numeric, p_valor_recebido numeric,
  p_operador_id uuid, p_operador_nome text
) returns uuid as $$
declare
  v_venda_id uuid;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_prod produtos%rowtype;
  v_qtd numeric;
begin
  if p_operador_id is null then raise exception 'Operador obrigatório'; end if;

  insert into vendas (tenant_id, total, desconto, forma_pagamento, valor_recebido, operador_id, operador_nome)
  values (p_tenant_id, 0, p_desconto, p_forma_pagamento, p_valor_recebido, p_operador_id, p_operador_nome)
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

    insert into movimentos_estoque (tenant_id, produto_id, tipo, quantidade, motivo, venda_id, operador_id, operador_nome)
    values (p_tenant_id, v_prod.id, 'venda', v_qtd, 'Venda PDV', v_venda_id, p_operador_id, p_operador_nome);

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

-- Cancela venda: devolve o estoque e registra quem cancelou (na venda e na auditoria).
create or replace function cancelar_venda(
  p_tenant_id uuid, p_venda_id uuid, p_motivo text,
  p_operador_id uuid, p_operador_nome text
) returns void as $$
declare
  v vendas%rowtype;
  it record;
begin
  if p_operador_id is null then raise exception 'Operador obrigatório'; end if;

  -- trava a venda: dois cancelamentos simultâneos não devolvem o estoque duas vezes
  select * into v from vendas where id = p_venda_id and tenant_id = p_tenant_id for update;
  if not found then
    raise exception 'Venda não encontrada';
  end if;
  if v.status = 'cancelada' then
    raise exception 'Esta venda já foi cancelada';
  end if;

  for it in select produto_id, quantidade from itens_venda where venda_id = p_venda_id loop
    insert into movimentos_estoque (tenant_id, produto_id, tipo, quantidade, motivo, venda_id, operador_id, operador_nome)
    values (p_tenant_id, it.produto_id, 'entrada', it.quantidade, 'Cancelamento de venda', p_venda_id, p_operador_id, p_operador_nome);

    update produtos
       set quantidade = quantidade + it.quantidade
     where id = it.produto_id and tenant_id = p_tenant_id;
  end loop;

  update vendas
     set status = 'cancelada',
         cancelada_em = now(),
         motivo_cancelamento = p_motivo,
         cancelada_por = p_operador_nome
   where id = p_venda_id;

  insert into auditoria (tenant_id, acao, entidade, entidade_id, operador_id, operador_nome, detalhe)
  values (p_tenant_id, 'venda_cancelada', 'venda', p_venda_id, p_operador_id, p_operador_nome,
          jsonb_build_object('motivo', p_motivo, 'total', v.total, 'vendido_por', v.operador_nome));
end;
$$ language plpgsql;
