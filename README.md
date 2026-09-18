# Evolua Automação PDV

Sistema de **PDV (frente de caixa) + estoque + catálogo**, **white-label** (cada cliente coloca a própria marca) e instalável como **app no celular (PWA)**.

Stack: **Next.js 16** (App Router) · React 19 · TypeScript · Tailwind CSS 4 · **Supabase** (Postgres, Auth e Storage).

## O que o sistema faz

| Módulo | Recursos |
|---|---|
| **PDV** (`/pdv`) | Modo caixa em tela cheia; leitura por código de barras/SKU; `3x produto` para quantidade; atalhos F4/F6/F8/F9; pagamento em Dinheiro, Débito, Crédito e **PIX (QR Code)**; troco; desconto; recibo imprimível; aviso de estoque insuficiente |
| **Vendas** (`/pdv/vendas`) | Histórico por dia com **quem vendeu** (o operador vê só as próprias vendas; o admin vê todas), totais por forma de pagamento, **valor líquido após taxa de cartão** (débito 2,0% / crédito 3,5%), **cancelamento de venda** (devolve o estoque) |
| **Estoque** (`/estoque`) | CRUD de produtos com foto e categoria, alerta de estoque baixo, **movimentos** (entrada, saída e ajuste de inventário) |
| **Dashboard** (`/dashboard`) | Faturamento bruto/líquido, ticket médio, gráfico por hora/dia, mais vendidos, valor em estoque, **margem de lucro**, **vendas por operador** |
| **Catálogo público** (`/catalogo`) | Vitrine por categoria com busca; não expõe custo nem estoque exato |
| **Marca** (`/configuracoes/branding`) | Nome, cor, logo e ícone do app por cliente |
| **Usuários** (`/configuracoes/usuarios`) | Login por **telefone**; perfis **administrador** e **operador (caixa)** |
| **PWA** | Manifest dinâmico por marca, ícones gerados, service worker próprio (telas em cache; API nunca), botão "Instalar app" |

## Como rodar localmente

Pré-requisitos: Node 20+ e um projeto no [Supabase](https://supabase.com).

```bash
npm install
cp .env.local.example .env.local   # preencha os valores (tabela abaixo)
npm run dev                        # http://localhost:3000
```

### 1) Banco de dados (Supabase → SQL Editor)

Rode, **nesta ordem**, os arquivos de `supabase/migrations/`:

1. `0001_schema_inicial.sql` — tabelas, funções `fechar_venda` e `registrar_movimento`, tenant padrão
2. `0002_storage_produtos.sql` — bucket público de imagens
3. `0003_formas_pagamento.sql` — débito e crédito
4. `0004_cancelar_venda.sql` — cancelamento de venda
5. `0005_quem_vendeu.sql` — operador em vendas e movimentos, tabela `auditoria`

### 2) Variáveis de ambiente (`.env.local`)

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave **secreta** do Supabase (só servidor) |
| `SESSION_SECRET` | Assina o cookie de sessão (mín. 32 caracteres aleatórios) |
| `SETUP_CODE` | Código do primeiro acesso e da recuperação de senha do administrador |
| `PIX_KEY` / `PIX_CITY` | Chave PIX exibida no QR Code do PDV e cidade do recebedor |

> Nunca faça commit do `.env.local` (já está no `.gitignore`).

### 3) Primeiro acesso

Abra `/setup`, informe o `SETUP_CODE`, seu nome, telefone e senha: isso cria o **administrador**. Depois disso a tela some. Novos usuários são criados em **Usuários**.

## Segurança

- Login por telefone; senha guardada pelo Supabase Auth; sessão em cookie `httpOnly` assinado (12 h); freio de tentativas.
- Duas camadas de proteção: `src/proxy.ts` (filtro rápido) e verificação em **cada** rota de API e página sensível (`exigirApi` / `exigirPagina`).
- **Operador** só acessa PDV, histórico de vendas e catálogo, e **não recebe preço de custo**.
- Ao criar uma rota nova: chame `exigirApi`/`exigirPagina` e, se o operador puder usá-la, libere no `proxy.ts`.
- Enquanto o cadastro público do Supabase Auth estiver ligado, desative **"Allow new users to sign up"** no painel.

## Estrutura

```
src/
  app/
    (app)/       painel: dashboard, estoque, vendas, configurações
    (caixa)/     PDV em tela cheia
    (public)/    login, setup, recuperar senha, catálogo, offline
    api/         rotas de API (auth, produtos, vendas, movimentos, usuários...)
    manifest.ts  manifest do PWA (dinâmico por marca)
    pwa/icon/    ícones PNG gerados a partir da marca
  components/    pdv, estoque, auth, branding, pwa
  lib/           sessão, auth, telefone, PIX, taxas, Supabase
  proxy.ts       proteção de rotas (Next 16)
public/sw.js     service worker (PWA)
supabase/migrations/   SQL do banco (aplicar em ordem)
```

## Testes

Scripts de teste (rodam contra o servidor local, criam só dados "TESTE" e apagam tudo por id no final):

```bash
node --env-file=.env.local scripts/test-quem-vendeu.mjs
```

## Publicação e app no celular

O PWA só instala em **HTTPS**. Depois de publicado (ex.: VPS com Node + proxy reverso + certificado), o app é instalado pelo navegador: Android/Chrome → "Instalar app"; iPhone/Safari → Compartilhar → "Adicionar à Tela de Início".

```bash
npm run build
npm start
```

## Pendências

- Publicação na VPS (domínio + HTTPS)
- Pagamento integrado com confirmação automática (API do PicPay)

---

© Evolua Automação. Todos os direitos reservados.
