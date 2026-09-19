-- Venda sem internet: chave de idempotência + venda offline. Rode INTEIRO no SQL Editor do Supabase (depois da 0009).
-- Se aparecer o aviso de "operação destrutiva" (drop function), clique em "Run this query": senão NADA roda e não dá erro.
-- A função fechar_venda troca de assinatura (a antiga sai, ganha 3 parâmetros com padrão).
--
-- Regras:
--  * chave (uuid gerado pelo aparelho): a MESMA venda enviada duas vezes devolve a venda que já existe,
--    sem descontar o estoque de novo. Duas chamadas simultâneas com a mesma chave são serializadas.
--  * offline = true: a venda já aconteceu no balcão, então é SEMPRE registrada; se faltar estoque ele fica
--    negativo (registrado na auditoria). Sem o sinal offline, estoque insuficiente continua recusando a venda.
--  * criado_em: só vale no modo offline (hora real da venda), de até 7 dias atrás e no máximo 5 min no futuro.

alter table vendas
  add column if not exists chave_idempotencia uuid,
  add column if not exists offline boolean not null default false,
  add column if not exists sincronizada_em timestamptz;

create unique index if not exists vendas_tenant_chave_uq
  on vendas (tenant_id, chave_idempotencia)
  where chave_idempotencia is not null;

drop function if exists fechar_venda(uuid, jsonb, text, numeric, numeric, uuid, text, uuid, boolean, text);

create or replace function fechar_venda(
  p_tenant_id uuid, p_itens jsonb, p_forma_pagamento text,
  p_desconto numeric, p_valor_recebido numeric,
  p_operador_id uuid, p_operador_nome text,
  p_cliente_id uuid, p_entrega boolean, p_entrega_endereco text,
  p_chave uuid default null, p_offline boolean default false, p_criado_em timestamptz default null
) returns uuid as $$
declare
  v_venda_id uuid;
  v_existente vendas%rowtype;
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_prod produtos%rowtype;
  v_cli clientes%rowtype;
  v_caixa caixas%rowtype;
  v_obrigatorio boolean;
  v_qtd numeric;
  v_offline boolean := coalesce(p_offline, false);
  v_criado timestamptz := now();
  v_negativos jsonb := '[]'::jsonb;
begin
  if p_operador_id is null then raise exception 'Operador obrigatório'; end if;

  -- Mesma chave = mesma venda: serializa chamadas simultâneas e devolve a que já existe
  if p_chave is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || p_chave::text, 0));
    select * into v_existente from vendas where tenant_id = p_tenant_id and chave_idempotencia = p_chave;
    if found then
      if v_existente.operador_id is distinct from p_operador_id then
        raise exception 'Chave de venda já usada por outro operador';
      end if;
      return v_existente.id;
    end if;
  end if;

  if v_offline and p_criado_em is not null then
    if p_criado_em > now() + interval '5 minutes' or p_criado_em < now() - interval '7 days' then
      raise exception 'Data da venda offline inválida (máximo 7 dias atrás)';
    end if;
    v_criado := p_criado_em;
  end if;

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
    cliente_id, cliente_nome, cliente_telefone, entrega, entrega_endereco, caixa_id,
    chave_idempotencia, offline, sincronizada_em, criado_em
  ) values (
    p_tenant_id, 0, p_desconto, p_forma_pagamento, p_valor_recebido, p_operador_id, p_operador_nome,
    v_cli.id, v_cli.nome, v_cli.telefone, coalesce(p_entrega, false),
    case when p_entrega then btrim(p_entrega_endereco) end, v_caixa.id,
    p_chave, v_offline, case when v_offline then now() end, v_criado
  ) returning id into v_venda_id;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::numeric;
    select * into v_prod from produtos
      where id = (v_item->>'produto_id')::uuid and tenant_id = p_tenant_id and ativo
      for update;
    if not found then raise exception 'Produto não encontrado'; end if;
    if v_prod.quantidade < v_qtd then
      -- online: recusa. offline: a venda já aconteceu, então registra e o estoque fica negativo
      if not v_offline then raise exception 'Estoque insuficiente para %', v_prod.nome; end if;
      v_negativos := v_negativos || jsonb_build_object(
        'produto_id', v_prod.id, 'nome', v_prod.nome, 'estoque_antes', v_prod.quantidade, 'vendido', v_qtd);
    end if;

    insert into itens_venda (venda_id, produto_id, quantidade, preco_unitario, subtotal)
    values (v_venda_id, v_prod.id, v_qtd, v_prod.preco_venda, v_prod.preco_venda * v_qtd);

    insert into movimentos_estoque (tenant_id, produto_id, tipo, quantidade, motivo, venda_id, operador_id, operador_nome, criado_em)
    values (p_tenant_id, v_prod.id, 'venda', v_qtd,
            case when v_offline then 'Venda PDV (offline)' else 'Venda PDV' end,
            v_venda_id, p_operador_id, p_operador_nome, v_criado);

    update produtos set quantidade = quantidade - v_qtd where id = v_prod.id;
    v_total := v_total + v_prod.preco_venda * v_qtd;
  end loop;

  v_total := greatest(v_total - p_desconto, 0);
  update vendas set total = v_total,
    troco = case when p_valor_recebido is not null then greatest(p_valor_recebido - v_total, 0) end
  where id = v_venda_id;

  if v_offline then
    insert into auditoria (tenant_id, acao, entidade, entidade_id, operador_id, operador_nome, detalhe)
    values (p_tenant_id, 'venda_offline', 'venda', v_venda_id, p_operador_id, p_operador_nome,
            jsonb_build_object('vendida_em', v_criado, 'total', v_total, 'estoque_negativo', v_negativos));
  end if;

  return v_venda_id;
end;
$$ language plpgsql;

revoke execute on function fechar_venda(uuid, jsonb, text, numeric, numeric, uuid, text, uuid, boolean, text, uuid, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function fechar_venda(uuid, jsonb, text, numeric, numeric, uuid, text, uuid, boolean, text, uuid, boolean, timestamptz)
  to service_role;

-- Faz a API do Supabase enxergar já as colunas e a função nova
notify pgrst, 'reload schema';
