-- Separa "cartao" em "debito" e "credito".
-- "cartao" continua permitido apenas para não invalidar vendas antigas.
alter table vendas drop constraint if exists vendas_forma_pagamento_check;
alter table vendas
  add constraint vendas_forma_pagamento_check
  check (forma_pagamento in ('dinheiro', 'debito', 'credito', 'cartao', 'pix'));
