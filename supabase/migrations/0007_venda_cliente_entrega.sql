-- Cliente na venda + entrega. Rode INTEIRO no SQL Editor do Supabase (depois da 0006).
-- Nome e telefone do cliente e o endereço da entrega são COPIADOS para a venda: o histórico e o recibo
-- não mudam se o cadastro do cliente for editado depois. A função troca de assinatura (a antiga sai).

alter table vendas
  add column if not exists cliente_id uuid references clientes(id) on delete set null,
  add column if not exists cliente_nome text,
  add column if not exists cliente_telefone text,
  add column if not exists entrega boolean not null default false,
  add column if not exists entrega_endereco text;

alter table vendas drop constraint if exists vendas_entrega_endereco_check;
alter table vendas add constraint vendas_entrega_endereco_check
  check (not entrega or (cliente_id is not null and entrega_endereco is not null and btrim(entrega_endereco) <> ''));

create index if not exists vendas_cliente_idx on vendas (tenant_id, cliente_id) where cliente_id is not null;

drop function if exists fechar_venda(uuid, jsonb, text, numeric, numeric, uuid, text);

-- Fecha venda: venda + itens + baixa de estoque numa única transação, com operador, cliente e entrega.
-- p_itens: [{"produto_id": "...", "quantidade": 2}, ...]
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
  v_qtd numeric;
begin
  if p_operador_id is null then raise exception 'Operador obrigatório'; end if;

  -- O cliente precisa ser DESTA loja e estar ativo; nome/telefone vêm do cadastro, nunca do navegador
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
    cliente_id, cliente_nome, cliente_telefone, entrega, entrega_endereco
  ) values (
    p_tenant_id, 0, p_desconto, p_forma_pagamento, p_valor_recebido, p_operador_id, p_operador_nome,
    v_cli.id, v_cli.nome, v_cli.telefone, coalesce(p_entrega, false),
    case when p_entrega then btrim(p_entrega_endereco) end
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

-- Só o servidor (service_role) chama; a API pública do Supabase não
revoke execute on function fechar_venda(uuid, jsonb, text, numeric, numeric, uuid, text, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function fechar_venda(uuid, jsonb, text, numeric, numeric, uuid, text, uuid, boolean, text)
  to service_role;

-- Faz a API do Supabase enxergar já a função nova (evita "function not found in the schema cache")
notify pgrst, 'reload schema';
