-- Cancelamento de venda: guarda quem/quando/por quê e devolve os produtos ao estoque (tudo ou nada).

alter table vendas
  add column if not exists cancelada_em timestamptz,
  add column if not exists motivo_cancelamento text,
  add column if not exists cancelada_por text;

create or replace function cancelar_venda(
  p_tenant_id uuid,
  p_venda_id uuid,
  p_motivo text,
  p_por text default null
) returns void as $$
declare
  v vendas%rowtype;
  it record;
begin
  -- trava a venda: dois cancelamentos simultâneos não devolvem o estoque duas vezes
  select * into v from vendas where id = p_venda_id and tenant_id = p_tenant_id for update;
  if not found then
    raise exception 'Venda não encontrada';
  end if;
  if v.status = 'cancelada' then
    raise exception 'Esta venda já foi cancelada';
  end if;

  for it in select produto_id, quantidade from itens_venda where venda_id = p_venda_id loop
    insert into movimentos_estoque (tenant_id, produto_id, tipo, quantidade, motivo, venda_id)
    values (p_tenant_id, it.produto_id, 'entrada', it.quantidade, 'Cancelamento de venda', p_venda_id);

    update produtos
       set quantidade = quantidade + it.quantidade
     where id = it.produto_id and tenant_id = p_tenant_id;
  end loop;

  update vendas
     set status = 'cancelada',
         cancelada_em = now(),
         motivo_cancelamento = p_motivo,
         cancelada_por = p_por
   where id = p_venda_id;
end;
$$ language plpgsql;
