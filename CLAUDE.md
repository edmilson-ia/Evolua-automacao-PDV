@AGENTS.md

# Evolua Automação PDV

PDV + estoque + catálogo **white-label**, várias lojas na mesma instalação (multi-tenant), instalável como **PWA**. Repositório privado: `edmilson-ia/Evolua-automacao-PDV` (branch `main`).
Responda **sempre em português informal, explicando passo a passo**. Este projeto é da Evolua Automação e não tem relação com a Expertize.

## Stack
Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, Storage) · zod · jose · sharp · qrcode.

Peculiaridades do Next 16 (consulte `node_modules/next/dist/docs/` antes de usar qualquer API do Next):
- `params` e `searchParams` são **Promises** (`await`).
- "middleware" agora é `src/proxy.ts`.
- Service worker **escrito à mão** em `public/sw.js`. **Não** usar plugin webpack de PWA (`@serwist/next`, `next-pwa`): o Turbopack não os suporta.

## Comandos
```bash
npm run dev            # http://localhost:3000 (launch.json: evolua-pdv)
npm run build && npm start   # produção (PWA/service worker só registram em produção)
npx tsc --noEmit       # typecheck
npm run lint           # eslint
```
Não há suíte de testes: regras de segurança, dinheiro e estoque são provadas por **scripts** em `scripts/` (um por tarefa), com o servidor rodando:
```bash
node --env-file=.env.local scripts/test-quem-vendeu.mjs
node --env-file=.env.local scripts/test-multi-loja.mjs   # isolamento entre lojas
node --env-file=.env.local scripts/test-caixa.mjs        # caixa (valores, permissões, concorrência)
```

## Arquitetura
```
src/app/(app)/      painel (nav): dashboard, estoque, /pdv/vendas, configurações
src/app/(caixa)/    PDV tela cheia (/pdv)
src/app/(public)/   /login (pergunta a loja), recuperar-senha, offline e /c/[slug] (catálogo, login e manifest POR LOJA)
src/app/plataforma/ área do super-admin (lojas, onboarding)
src/app/api/        rotas de API (auth, produtos, vendas, movimentos, usuários, branding, upload...)
src/app/manifest.ts manifest dinâmico por marca; ícones em src/app/pwa/icon/[size]
src/components/     pdv, estoque, auth, branding, pwa (componentes pequenos)
src/lib/            session.ts (JWT, sem Next), auth.ts, tenant.ts, loja.ts (slug), storage.ts, telefone.ts, pix.ts, taxas.ts, format.ts, supabase/
src/proxy.ts        primeira barreira de acesso
supabase/migrations/  0001..NNNN, aplicadas À MÃO pelo usuário
```
- **Multi-loja**: a loja vem SEMPRE de `sessao.tenantId` (claim `tid` do JWT). `exigirApi()` devolve `{ ok, sessao }` ou a resposta de erro; não existe `getTenantId()` e nunca se aceita loja do corpo/URL nas rotas privadas. Só as telas públicas resolvem a loja pelo slug da URL (`/c/[slug]`, `getLojaPorSlug`). Perfis: `admin` | `operador` (de uma loja) e `super_admin` (dono da plataforma, sem loja, só `/plataforma`). Loja e perfil ficam em `app_metadata` do Supabase Auth (o usuário não edita). Loja suspensa (`tenants.ativo=false`) perde o acesso em ≤30 s (`lojaAtiva`, cache).
- Acesso ao banco: **service role** no servidor (`createServerClient()`), sempre filtrando por `tenant_id`. RLS ligado em todas as tabelas SEM policies e funções sem `execute` para anon/authenticated: só o servidor acessa (a service role ignora RLS, então o isolamento entre lojas depende do código + `test-multi-loja.mjs`). Dinheiro/estoque mudam só por funções SQL transacionais (`fechar_venda`, `cancelar_venda`, `registrar_movimento`).
- Sessão: cookie httpOnly com JWT HS256 (12 h), `SESSION_SECRET`. Perfis em `app_metadata.perfil`: `admin` | `operador`.
- Login por **telefone** dentro da loja (`src/lib/telefone.ts`): o mesmo telefone pode existir em lojas diferentes. O Supabase exige e-mail, então o usuário recebe e-mail interno `<dígitos>@<slug>.evolua.test` (nunca exibido; usuários antigos mantêm `@tel.evolua.test`). O login recebe a loja (`/c/<slug>/login`).
- Recuperação de senha: operador pede ao admin da loja; admin da loja pede ao super-admin (`/plataforma`); o super-admin usa o `SETUP_CODE` (da plataforma: NUNCA dar a clientes).
- Por loja (colunas de `tenants`): `slug`, marca, `pix_chave`/`pix_cidade` e `taxa_debito`/`taxa_credito` (`getConfigPagamento`). Imagens em `produtos/<tenant>/...`; só a pasta da própria loja é aceita em `imagem_url`/branding.
- Quem fez: `vendas` e `movimentos_estoque` guardam `operador_id` + `operador_nome` (cópia do nome na hora); cancelamentos e movimentos manuais também vão para `auditoria`. O operador vem SEMPRE da sessão, nunca do corpo da requisição. Operador só lista as próprias vendas.
- Caixa: tabelas `caixas` e `movimentos_caixa`; `tenants.caixa_obrigatorio` (padrão desligado, toggle em Pagamentos). O esperado é calculado NO BANCO (`caixa_resumo`: vendas concluídas por forma; canceladas fora) e o fechamento é cego. `fechar_venda` liga a venda ao caixa aberto de quem vende (`for share`) e recusa sem caixa quando obrigatório; `fechar_caixa` trava com `for update`; `cancelar_venda` recusa venda de caixa já fechado. Erros das funções: P0002 não encontrado, P0004 sem permissão, P0001 regra (`statusDoErroCaixa`).
- Datas sempre em America/Sao_Paulo (`src/lib/format.ts`). Taxas de cartão por loja (`src/lib/taxas.ts` recebe as taxas), calculadas na exibição.
- PIX: QR estático (`src/lib/pix.ts`) com a chave da loja; **não confirma pagamento**.
- Clientes: tabela `clientes` por loja (nome, telefone só dígitos, e-mail, endereço; exclusão lógica). Operador busca/cadastra; só admin edita/exclui. A venda guarda `cliente_id` + cópia de nome/telefone e, se `entrega`, `entrega_endereco` (o banco confere que o cliente é da loja; nome/telefone vêm do cadastro, não do corpo). Sem taxa/status de entrega ainda.

## Regras fixas (não quebrar)
1. **Segurança em 2 camadas**: `src/proxy.ts` filtra e TODA rota de API/página sensível chama `exigirApi()` / `exigirPagina()` (`src/lib/auth.ts`). Rota nova = proteger e, se o operador puder usar, liberar no proxy. **Operador nunca recebe preço de custo.**
2. **Segredos**: nunca commitar (`.env.local` é ignorado); nunca imprimir chaves no chat. **Nunca apagar usuários por domínio** (`@tel.evolua.test` é usado por usuários reais): em limpezas de teste, apague só **por id** o que você mesmo criou.
3. **Dados reais** do usuário (produtos "fanta" e "fanta uva", usuário admin) **não podem ser apagados nem alterados** em testes. Dados de teste têm prefixo **"TESTE"**, são criados por você e removidos ao final; confira o estado do banco **antes e depois**.
4. **Sem módulo fiscal** (NF-e/NFC-e) nesta fase: só deixar ponto de integração para API de terceiro (Focus NFe / PlugNotas) no futuro.
5. **Nomenclatura**: domínio em português (produto, venda, estoque); código/variáveis em inglês; componentes pequenos; sem código morto.
6. **Banco**: você NÃO tem acesso a DDL. Toda migration nova é um arquivo numerado (`0005_...sql`) no repositório; entregue o SQL pronto num bloco, peça ao usuário para rodar no SQL Editor do Supabase e **espere a confirmação** antes de continuar.
7. **VPS Hostinger** (roda n8n): nunca mexer sem pedido explícito.
8. Fora de escopo sem pedir: publicação (Netlify/VPS), pagamento integrado PicPay, nota fiscal.

## Fluxo de trabalho (cada etapa)
1. Apresentar **plano curto** (arquivos, tabelas, riscos) e **aguardar aprovação**.
2. Decisões de produto pendentes: perguntar ao usuário **uma por vez, com recomendação**.
3. Implementar. Se houver SQL: migration numerada + pedir para o usuário aplicar.
4. Verificar: `npx tsc --noEmit`, `npm run lint`, e **testes por script** quando houver regra de segurança/dinheiro/estoque.
5. **Demonstração visual**: screenshots no navegador do preview mostrando como ficou.
6. Atualizar README/CLAUDE.md se a arquitetura mudou. Commit em português com a linha final `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` e `git push`.

## Armadilhas já vividas
- **Migrations**: o SQL Editor mostra um aviso de "operação destrutiva" para `drop`; se o usuário não clicar em "Run this query", nada roda e não aparece erro. `PGRST202 ... in the schema cache` = migration não aplicada (ou cache velho: terminar com `notify pgrst, 'reload schema';`). Ao mudar a assinatura de uma função: `drop function if exists <antiga>` + revoke/grant de execute na nova (só `service_role`). Conferir o banco antes de testar (colunas + chamar a função com parâmetros nulos).
- **Login/demo**: Claude nunca digita senha em formulário. O navegador do preview e a janela do app instalado têm logins separados: o usuário precisa entrar no painel do PREVIEW para haver capturas logadas; senão, entregar checklist manual e dizer o que não foi visto.
- **Testes**: primeiro disparo depois de subir o servidor pode dar `fetch failed` (compilando). `Assertion failed ... UV_HANDLE_CLOSING` no fim de script Node no Windows é ruído inofensivo.
- **Shell**: evitar vários heredocs com aspas numa chamada Bash (erro de parse, nada roda); escrever o script no scratchpad com a ferramenta Write e rodar o arquivo.
- Ao concluir cada etapa, atualizar também a skill `evolua-automacao-pdv` (status, decisões, pendências).

## Roteiro (ordem: 6 → 1 → 2 → 3 → 5 → 4)
6 Quem vendeu (feito) · 1 Multi-loja + clientes + entrega (feito) · 2 Caixa (feito) · 3 Importar produtos por planilha · 5 Impressora térmica e leitor de código · 4 Venda sem internet (por último: mexe na criação de vendas e no `sw.js`).
