-- Período de teste por loja. Rode INTEIRO no SQL Editor do Supabase (depois da 0010).
-- Não tem "drop": o aviso de operação destrutiva não deve aparecer.
--
-- teste_ate: até quando a loja está em teste grátis. Vazio (null) = loja definitiva (é o caso de todas as lojas
-- que já existem, inclusive a sua). Depois dessa data o acesso é bloqueado, sem apagar nada: prorrogar ou ativar
-- a loja em /plataforma devolve tudo.

alter table tenants add column if not exists teste_ate timestamptz;

-- Faz a API do Supabase enxergar já a coluna nova
notify pgrst, 'reload schema';
