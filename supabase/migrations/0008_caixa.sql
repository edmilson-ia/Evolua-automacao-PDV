-- Abertura e fechamento de caixa. Rode INTEIRO no SQL Editor do Supabase (depois da 0007).
-- Se aparecer o aviso de "operação destrutiva" (drop), clique em "Run this query".
-- O esperado de cada caixa é calculado NO BANCO a partir das vendas concluídas (canceladas ficam fora).

-- ============ CONFIGURAÇÃO POR LOJA ============
alter table tenants add column if not exists caixa_obrigatorio boolean not null default false;

-- ============ CAIXAS ============
create table if not exists caixas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  terminal text not null check (char_length(btrim(terminal)) between 1 and 30),
  operador_id uuid not null,
  operador_nome text not null,
  aberto_em timestamptz not null default now(),
  valor_inicial numeric(12,2) not null default 0 check (valor_inicial >= 0),
  status text not null default 'aberto' check (status in ('aberto', 'fechado')),
  fechado_em timestamptz,
  fechado_por_id uuid,
  fechado_por_nome text,
  valor_contado numeric(12,2),   -- dinheiro contado na gaveta
  diferenca numeric(12,2),       -- dinheiro: contado - esperado
  conferencia jsonb,             -- esperado x contado x diferença por forma de pagamento (+ resumo do turno)
  observacao text,
  check ((status = 'aberto' and fechado_em is null) or (status = 'fechado' and fechado_em is not null))
);
-- Um caixa aberto por operador e um por terminal (dentro da loja)
create unique index if not exists caixas_operador_aberto_key on caixas (tenant_id, operador_id) where status = 'aberto';
create unique index if not exists caixas_terminal_aberto_key on caixas (tenant_id, lower(terminal)) where status = 'aberto';
create index if not exists caixas_tenant_data_idx on caixas (tenant_id, aberto_em desc);

create table if not exists movimentos_caixa (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  caixa_id uuid not null references caixas(id) on delete cascade,
  tipo text not null check (tipo in ('sangria', 'suprimento')),
  valor numeric(12,2) not null check (valor > 0),
  motivo text not null check (char_length(btrim(motivo)) >= 3),
  operador_id uuid not null,
  operador_nome text not null,
  criado_em timestamptz not null default now()
);
create index if not exists movimentos_caixa_caixa_idx on movimentos_caixa (caixa_id, criado_em);

-- vendas.caixa_id já existe (0005): agora aponta para o caixa
alter table vendas drop constraint if exists vendas_caixa_id_fkey;
alter table vendas add constraint vendas_caixa_id_fkey foreign key (caixa_id) references caixas(id);
create index if not exists vendas_caixa_idx on vendas (caixa_id) where caixa_id is not null;

-- Só o servidor (service role) acessa: RLS ligado sem policies
alter table caixas enable row level security;
alter table movimentos_caixa enable row level security;
revoke all on caixas, movimentos_caixa from anon, authenticated;

-- ============ FUNÇÕES ============
-- Códigos de erro: P0002 = não encontrado, P0004 = sem permissão, P0001 = regra de negócio.

-- Resumo do turno: vendas por forma (concluídas), canceladas (fora), sangrias/suprimentos e dinheiro esperado.
create or replace function caixa_resumo(p_tenant_id uuid, p_caixa_id uuid) returns jsonb as $$
declare
  c caixas%rowtype;
  r record;
  v_sang numeric;
  v_supr numeric;
begin
  select * into c from caixas where id = p_caixa_id and tenant_id = p_tenant_id;
  if not found then raise exception 'Caixa não encontrado' using errcode = 'P0002'; end if;

  select
    coalesce(sum(total) filter (where status = 'concluida' and forma_pagamento = 'dinheiro'), 0) as dinheiro,
    coalesce(sum(total) filter (where status = 'concluida' and forma_pagamento = 'debito'), 0) as debito,
    coalesce(sum(total) filter (where status = 'concluida' and forma_pagamento = 'credito'), 0) as credito,
    coalesce(sum(total) filter (where status = 'concluida' and forma_pagamento = 'pix'), 0) as pix,
    count(*) filter (where status = 'concluida') as qtd,
    count(*) filter (where status = 'cancelada') as canc_qtd,
    coalesce(sum(total) filter (where status = 'cancelada'), 0) as canc_total
  into r
  from vendas where caixa_id = p_caixa_id and tenant_id = p_tenant_id;

  select coalesce(sum(valor) filter (where tipo = 'sangria'), 0), coalesce(sum(valor) filter (where tipo = 'suprimento'), 0)
    into v_sang, v_supr
  from movimentos_caixa where caixa_id = p_caixa_id and tenant_id = p_tenant_id;

  return jsonb_build_object(
    'valor_inicial', c.valor_inicial,
    'vendas', jsonb_build_object(
      'dinheiro', r.dinheiro, 'debito', r.debito, 'credito', r.credito, 'pix', r.pix,
      'qtd', r.qtd, 'total', r.dinheiro + r.debito + r.credito + r.pix),
    'canceladas', jsonb_build_object('qtd', r.canc_qtd, 'total', r.canc_total),
    'sangrias', v_sang,
    'suprimentos', v_supr,
    'esperado_dinheiro', c.valor_inicial + r.dinheiro + v_supr - v_sang
  );
end;
$$ language plpgsql;

create or replace function abrir_caixa(
  p_tenant_id uuid, p_operador_id uuid, p_operador_nome text, p_terminal text, p_valor_inicial numeric
) returns uuid as $$
declare
  v_id uuid;
  v_outro text;
begin
  if p_operador_id is null then raise exception 'Operador obrigatório'; end if;
  if p_terminal is null or btrim(p_terminal) = '' then raise exception 'Informe o terminal'; end if;
  if p_valor_inicial is null or p_valor_inicial < 0 then raise exception 'Valor inicial inválido'; end if;

  if exists (select 1 from caixas where tenant_id = p_tenant_id and operador_id = p_operador_id and status = 'aberto') then
    raise exception 'Você já tem um caixa aberto';
  end if;
  select operador_nome into v_outro from caixas
    where tenant_id = p_tenant_id and lower(terminal) = lower(btrim(p_terminal)) and status = 'aberto';
  if found then raise exception 'O terminal % já está com caixa aberto por %', btrim(p_terminal), v_outro; end if;

  insert into caixas (tenant_id, terminal, operador_id, operador_nome, valor_inicial)
  values (p_tenant_id, btrim(p_terminal), p_operador_id, p_operador_nome, p_valor_inicial)
  returning id into v_id;

  insert into auditoria (tenant_id, acao, entidade, entidade_id, operador_id, operador_nome, detalhe)
  values (p_tenant_id, 'caixa_aberto', 'caixa', v_id, p_operador_id, p_operador_nome,
          jsonb_build_object('terminal', btrim(p_terminal), 'valor_inicial', p_valor_inicial));
  return v_id;
end;
$$ language plpgsql;

-- Sangria (tira dinheiro da gaveta) ou suprimento (coloca). Só no caixa aberto, por quem o abriu (ou admin).
create or replace function movimentar_caixa(
  p_tenant_id uuid, p_caixa_id uuid, p_tipo text, p_valor numeric, p_motivo text,
  p_operador_id uuid, p_operador_nome text, p_admin boolean
) returns void as $$
declare
  c caixas%rowtype;
  v_esperado numeric;
begin
  if p_operador_id is null then raise exception 'Operador obrigatório'; end if;
  if p_tipo not in ('sangria', 'suprimento') then raise exception 'Tipo inválido'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe um valor maior que zero'; end if;
  if p_motivo is null or char_length(btrim(p_motivo)) < 3 then raise exception 'Informe o motivo'; end if;

  select * into c from caixas where id = p_caixa_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Caixa não encontrado' using errcode = 'P0002'; end if;
  if c.status <> 'aberto' then raise exception 'Este caixa já foi fechado'; end if;
  if not coalesce(p_admin, false) and c.operador_id <> p_operador_id then
    raise exception 'Só quem abriu o caixa (ou um administrador) pode movimentá-lo' using errcode = 'P0004';
  end if;

  if p_tipo = 'sangria' then
    v_esperado := (caixa_resumo(p_tenant_id, p_caixa_id)->>'esperado_dinheiro')::numeric;
    if p_valor > v_esperado then
      raise exception 'Sangria maior que o dinheiro do caixa (há R$ % no caixa)', round(v_esperado, 2);
    end if;
  end if;

  insert into movimentos_caixa (tenant_id, caixa_id, tipo, valor, motivo, operador_id, operador_nome)
  values (p_tenant_id, p_caixa_id, p_tipo, p_valor, btrim(p_motivo), p_operador_id, p_operador_nome);

  insert into auditoria (tenant_id, acao, entidade, entidade_id, operador_id, operador_nome, detalhe)
  values (p_tenant_id, 'caixa_' || p_tipo, 'caixa', p_caixa_id, p_operador_id, p_operador_nome,
          jsonb_build_object('valor', p_valor, 'motivo', btrim(p_motivo)));
end;
$$ language plpgsql;

-- Fecha o caixa. p_contados: {"dinheiro": 150.00, "debito": 30, "credito": 10, "pix": 20} (só o dinheiro é obrigatório).
create or replace function fechar_caixa(
  p_tenant_id uuid, p_caixa_id uuid, p_contados jsonb, p_observacao text,
  p_operador_id uuid, p_operador_nome text, p_admin boolean
) returns jsonb as $$
declare
  c caixas%rowtype;
  res jsonb;
  formas jsonb;
  conf jsonb;
  v_din numeric;
  v_deb numeric;
  v_cre numeric;
  v_pix numeric;
  e_din numeric;
  e_deb numeric;
  e_cre numeric;
  e_pix numeric;
begin
  if p_operador_id is null then raise exception 'Operador obrigatório'; end if;

  -- trava o caixa: vendas em andamento terminam antes; novas vendas não entram depois
  select * into c from caixas where id = p_caixa_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Caixa não encontrado' using errcode = 'P0002'; end if;
  if c.status <> 'aberto' then raise exception 'Este caixa já foi fechado'; end if;
  if not coalesce(p_admin, false) and c.operador_id <> p_operador_id then
    raise exception 'Só quem abriu o caixa (ou um administrador) pode fechá-lo' using errcode = 'P0004';
  end if;

  if p_contados is null or nullif(p_contados->>'dinheiro', '') is null then
    raise exception 'Informe o dinheiro contado';
  end if;
  v_din := (p_contados->>'dinheiro')::numeric;
  v_deb := nullif(p_contados->>'debito', '')::numeric;
  v_cre := nullif(p_contados->>'credito', '')::numeric;
  v_pix := nullif(p_contados->>'pix', '')::numeric;
  if v_din < 0 or coalesce(v_deb, 0) < 0 or coalesce(v_cre, 0) < 0 or coalesce(v_pix, 0) < 0 then
    raise exception 'Valores contados não podem ser negativos';
  end if;

  res := caixa_resumo(p_tenant_id, p_caixa_id);
  e_din := (res->>'esperado_dinheiro')::numeric;
  e_deb := (res->'vendas'->>'debito')::numeric;
  e_cre := (res->'vendas'->>'credito')::numeric;
  e_pix := (res->'vendas'->>'pix')::numeric;

  formas := jsonb_build_object(
    'dinheiro', jsonb_build_object('esperado', e_din, 'contado', v_din, 'diferenca', v_din - e_din),
    'debito', jsonb_build_object('esperado', e_deb, 'contado', v_deb, 'diferenca', v_deb - e_deb),
    'credito', jsonb_build_object('esperado', e_cre, 'contado', v_cre, 'diferenca', v_cre - e_cre),
    'pix', jsonb_build_object('esperado', e_pix, 'contado', v_pix, 'diferenca', v_pix - e_pix)
  );
  conf := jsonb_build_object('formas', formas, 'resumo', res);

  update caixas
     set status = 'fechado', fechado_em = now(), fechado_por_id = p_operador_id, fechado_por_nome = p_operador_nome,
         valor_contado = v_din, diferenca = v_din - e_din, conferencia = conf,
         observacao = nullif(btrim(coalesce(p_observacao, '')), '')
   where id = p_caixa_id;

  insert into auditoria (tenant_id, acao, entidade, entidade_id, operador_id, operador_nome, detalhe)
  values (p_tenant_id, 'caixa_fechado', 'caixa', p_caixa_id, p_operador_id, p_operador_nome,
          jsonb_build_object('terminal', c.terminal, 'aberto_por', c.operador_nome,
                             'esperado_dinheiro', e_din, 'contado_dinheiro', v_din, 'diferenca_dinheiro', v_din - e_din));
  return conf;
end;
$$ language plpgsql;

-- Venda: liga ao caixa aberto de quem vende e, se a loja exigir, recusa a venda sem caixa aberto.
-- (mesma assinatura da 0007; só o corpo muda)
create or replace function fechar_venda(
  p_tenant_id uuid, p_itens jsonb, p_forma_pagamento text,
  p_desconto numeric, p_valor_recebido numeric,
  p_operador_id uuid, p_operador_nome text,
  p_cliente_id uuid, p_entrega boolean, p_entrega_endereco text
) returns uuid as $$
declare
  v_venda_id uuid;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_prod produtos%rowtype;
  v_cli clientes%rowtype;
  v_caixa caixas%rowtype;
  v_obrigatorio boolean;
  v_qtd numeric;
begin
  if p_operador_id is null then raise exception 'Operador obrigatório'; end if;

  -- "for share": um fechamento de caixa em andamento espera esta venda terminar (e vice-versa)
  select * into v_caixa from caixas
    where tenant_id = p_tenant_id and operador_id = p_operador_id and status = 'aberto' for share;
  if not found then
    select caixa_obrigatorio into v_obrigatorio from tenants where id = p_tenant_id;
    if coalesce(v_obrigatorio, false) then raise exception 'Abra o caixa para vender'; end if;
  end if;

  if p_cliente_id is not null then
    select * into v_cli from clientes where id = p_cliente_id and tenant_id = p_tenant_id and ativo;
    if not found then raise exception 'Cliente não encontrado'; end if;
  end if;
  if p_entrega then
    if p_cliente_id is null then raise exception 'Escolha o cliente para a entrega'; end if;
    if p_entrega_endereco is null or btrim(p_entrega_endereco) = '' then
      raise exception 'Informe o endereço da entrega';
    end if;
  end if;

  insert into vendas (
    tenant_id, total, desconto, forma_pagamento, valor_recebido, operador_id, operador_nome,
    cliente_id, cliente_nome, cliente_telefone, entrega, entrega_endereco, caixa_id
  ) values (
    p_tenant_id, 0, p_desconto, p_forma_pagamento, p_valor_recebido, p_operador_id, p_operador_nome,
    v_cli.id, v_cli.nome, v_cli.telefone, coalesce(p_entrega, false),
    case when p_entrega then btrim(p_entrega_endereco) end, v_caixa.id
  ) returning id into v_venda_id;

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

-- Cancelamento: venda de caixa JÁ FECHADO não pode ser cancelada (o relatório fechado continua verdadeiro).
-- (mesma assinatura da 0005; só o corpo muda)
create or replace function cancelar_venda(
  p_tenant_id uuid, p_venda_id uuid, p_motivo text,
  p_operador_id uuid, p_operador_nome text
) returns void as $$
declare
  v vendas%rowtype;
  it record;
  v_caixa_status text;
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

  if v.caixa_id is not null then
    -- "for share": não cancela no meio de um fechamento de caixa
    select status into v_caixa_status from caixas where id = v.caixa_id for share;
    if v_caixa_status = 'fechado' then
      raise exception 'Esta venda é de um caixa já fechado e não pode ser cancelada';
    end if;
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

-- Funções novas: só o servidor (service_role) chama
revoke execute on function caixa_resumo(uuid, uuid) from public, anon, authenticated;
revoke execute on function abrir_caixa(uuid, uuid, text, text, numeric) from public, anon, authenticated;
revoke execute on function movimentar_caixa(uuid, uuid, text, numeric, text, uuid, text, boolean) from public, anon, authenticated;
revoke execute on function fechar_caixa(uuid, uuid, jsonb, text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function caixa_resumo(uuid, uuid) to service_role;
grant execute on function abrir_caixa(uuid, uuid, text, text, numeric) to service_role;
grant execute on function movimentar_caixa(uuid, uuid, text, numeric, text, uuid, text, boolean) to service_role;
grant execute on function fechar_caixa(uuid, uuid, jsonb, text, uuid, text, boolean) to service_role;

-- Faz a API do Supabase enxergar já as funções novas
notify pgrst, 'reload schema';
