@AGENTS.md

# Evolua Automação PDV

PDV + estoque + catálogo **white-label**, instalável como **PWA**. Repositório privado: `edmilson-ia/Evolua-automacao-PDV` (branch `main`).
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
```

## Arquitetura
```
src/app/(app)/      painel (nav): dashboard, estoque, /pdv/vendas, configurações
src/app/(caixa)/    PDV tela cheia (/pdv)
src/app/(public)/   login, setup, recuperar-senha, catálogo, offline
src/app/api/        rotas de API (auth, produtos, vendas, movimentos, usuários, branding, upload...)
src/app/manifest.ts manifest dinâmico por marca; ícones em src/app/pwa/icon/[size]
src/components/     pdv, estoque, auth, branding, pwa (componentes pequenos)
src/lib/            session.ts (JWT, sem Next), auth.ts, tenant.ts, telefone.ts, pix.ts, taxas.ts, format.ts, supabase/
src/proxy.ts        primeira barreira de acesso
supabase/migrations/  0001..NNNN, aplicadas À MÃO pelo usuário
```
- Acesso ao banco: **service role** no servidor (`createServerClient()`), sempre filtrando por `tenant_id`. Dinheiro/estoque mudam só por funções SQL transacionais (`fechar_venda`, `cancelar_venda`, `registrar_movimento`).
- Sessão: cookie httpOnly com JWT HS256 (12 h), `SESSION_SECRET`. Perfis em `app_metadata.perfil`: `admin` | `operador`.
- Login por **telefone** (`src/lib/telefone.ts`); o Supabase exige e-mail, então o usuário recebe e-mail interno `<dígitos>@tel.evolua.test` (nunca exibido).
- Recuperação de senha: operador pede ao admin; admin usa `SETUP_CODE`.
- Quem fez: `vendas` e `movimentos_estoque` guardam `operador_id` + `operador_nome` (cópia do nome na hora); cancelamentos e movimentos manuais também vão para `auditoria`. O operador vem SEMPRE da sessão, nunca do corpo da requisição. Operador só lista as próprias vendas.
- Datas sempre em America/Sao_Paulo (`src/lib/format.ts`). Taxas de cartão em `src/lib/taxas.ts` (débito 2,0%, crédito 3,5%), calculadas na exibição.
- PIX: QR estático (`src/lib/pix.ts`) com `PIX_KEY`/`PIX_CITY`; **não confirma pagamento**.

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

## Roteiro (ordem: 6 → 1 → 2 → 3 → 5 → 4)
6 Quem vendeu · 1 Multi-loja (multi-tenant) · 2 Abertura/fechamento de caixa · 3 Importar produtos por planilha · 5 Impressora térmica e leitor de código · 4 Venda sem internet (por último: mexe na criação de vendas e no `sw.js`).
