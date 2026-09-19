-- Multi-loja: várias lojas na mesma instalação + cadastro de clientes + RLS.
-- Rode INTEIRO no SQL Editor do Supabase. É compatível com o código anterior (pode rodar antes do deploy).

-- ============ LOJAS (tenants) ============
-- slug = identificador na URL (/c/<slug>) e no e-mail interno dos usuários.
-- PIX e taxas de cartão passam a ser POR LOJA (saem do .env e do código).
alter table tenants
  add column if not exists slug text,
  add column if not exists pix_chave text,
  add column if not exists pix_cidade text,
  add column if not exists taxa_debito numeric(5,2) not null default 2.00 check (taxa_debito >= 0 and taxa_debito <= 30),
  add column if not exists taxa_credito numeric(5,2) not null default 3.50 check (taxa_credito >= 0 and taxa_credito <= 30);

-- Loja que já existe (id fixo do MVP) vira "evolua"; qualquer outra linha ganha um slug provisório.
update tenants set slug = 'evolua' where id = '00000000-0000-0000-0000-000000000001' and slug is null;
update tenants set slug = 'loja-' || substr(id::text, 1, 8) where slug is null;

alter table tenants alter column slug set not null;
create unique index if not exists tenants_slug_key on tenants (lower(slug));
alter table tenants drop constraint if exists tenants_slug_formato;
alter table tenants add constraint tenants_slug_formato check (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$');

-- ============ USUÁRIOS EXISTENTES → loja atual ============
-- A loja do usuário fica em app_metadata (o próprio usuário NÃO consegue editar), junto do perfil.
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                           || jsonb_build_object('tenant_id', '00000000-0000-0000-0000-000000000001')
 where raw_app_meta_data ? 'perfil'
   and not (raw_app_meta_data ? 'tenant_id');

-- ============ CLIENTES ============
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) >= 2),
  telefone text,          -- só dígitos, com DDD
  email text,
  endereco text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists clientes_tenant_nome_idx on clientes (tenant_id, nome);
-- Um telefone por cliente ativo dentro da loja (evita cadastro duplicado)
create unique index if not exists clientes_tenant_telefone_key
  on clientes (tenant_id, telefone) where telefone is not null and ativo;

drop trigger if exists clientes_atualizado_em on clientes;
create trigger clientes_atualizado_em before update on clientes
for each row execute function set_atualizado_em();

-- ============ SEGURANÇA NO BANCO (segunda barreira) ============
-- O servidor usa a service role (ignora RLS). O RLS abaixo, SEM policies, bloqueia qualquer acesso
-- direto pela API pública do Supabase (chaves anon/authenticated) a estas tabelas.
alter table tenants enable row level security;
alter table categorias enable row level security;
alter table produtos enable row level security;
alter table vendas enable row level security;
alter table itens_venda enable row level security;
alter table movimentos_estoque enable row level security;
alter table auditoria enable row level security;
alter table clientes enable row level security;

revoke all on all tables in schema public from anon, authenticated;
-- Só as nossas funções (fechar_venda etc.): ninguém chama pela API pública, só o servidor (service_role)
revoke execute on function registrar_movimento(uuid, uuid, text, numeric, text, uuid, text) from public, anon, authenticated;
revoke execute on function fechar_venda(uuid, jsonb, text, numeric, numeric, uuid, text) from public, anon, authenticated;
revoke execute on function cancelar_venda(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke execute on function set_atualizado_em() from public, anon, authenticated;
grant execute on function registrar_movimento(uuid, uuid, text, numeric, text, uuid, text) to service_role;
grant execute on function fechar_venda(uuid, jsonb, text, numeric, numeric, uuid, text) to service_role;
grant execute on function cancelar_venda(uuid, uuid, text, uuid, text) to service_role;
grant execute on function set_atualizado_em() to service_role;

-- Objetos criados no futuro por este usuário já nascem fechados para anon/authenticated
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
