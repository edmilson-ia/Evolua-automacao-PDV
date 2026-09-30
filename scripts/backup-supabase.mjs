#!/usr/bin/env node
// Backup automático dos dados do Supabase (todas as lojas, não só uma).
// Roda via cron na VPS, todo dia de madrugada. Não altera nada: só LÊ pelo REST
// (com a service role key) e salva um arquivo .json.gz por dia.
//
// O QUE ENTRA: todas as linhas das tabelas do sistema (produtos, vendas, itens_venda,
// movimentos_estoque, clientes, caixas, movimentos_caixa, tenants, categorias, auditoria).
// O QUE NÃO ENTRA: os arquivos do Storage (fotos de produto/marca) — só o link delas,
// que já está salvo nas linhas de "produtos"/"tenants". Backup de imagem é outra etapa,
// ainda não pedida.
//
// Uso:  node --env-file=.env.production scripts/backup-supabase.mjs
// Variáveis: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (já existem no .env* do projeto)
//            BACKUP_DIR (padrão: /var/backups/evolua-pdv)
//            BACKUP_RETENCAO_DIAS (padrão: 30)

import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

const TABELAS = [
  "tenants",
  "categorias",
  "produtos",
  "movimentos_estoque",
  "vendas",
  "itens_venda",
  "clientes",
  "caixas",
  "movimentos_caixa",
  "auditoria",
];

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DIR = process.env.BACKUP_DIR || "/var/backups/evolua-pdv";
const RETENCAO_DIAS = Number(process.env.BACKUP_RETENCAO_DIAS || 30);
const PAGINA = 1000; // limite do PostgREST por página

if (!URL_BASE || !CHAVE) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (rode com --env-file).");
  process.exit(1);
}

/** Busca TODAS as linhas de uma tabela, paginando pelo cabeçalho Range do PostgREST. */
async function baixarTabela(tabela) {
  const linhas = [];
  let inicio = 0;
  for (;;) {
    const res = await fetch(`${URL_BASE}/rest/v1/${tabela}?select=*&order=id`, {
      headers: {
        apikey: CHAVE,
        Authorization: `Bearer ${CHAVE}`,
        Range: `${inicio}-${inicio + PAGINA - 1}`,
        Prefer: "count=exact",
      },
    });
    if (!res.ok && res.status !== 206) {
      throw new Error(`Falha ao ler "${tabela}": HTTP ${res.status} — ${await res.text()}`);
    }
    const pagina = await res.json();
    linhas.push(...pagina);
    if (pagina.length < PAGINA) break;
    inicio += PAGINA;
  }
  return linhas;
}

/** Apaga backups mais antigos que RETENCAO_DIAS, para o disco da VPS não encher sozinho. */
function limparAntigos() {
  const limite = Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000;
  let removidos = 0;
  for (const nome of readdirSync(DIR)) {
    if (!nome.startsWith("evolua-pdv-") || !nome.endsWith(".json.gz")) continue;
    const caminho = path.join(DIR, nome);
    if (statSync(caminho).mtimeMs < limite) {
      unlinkSync(caminho);
      removidos++;
    }
  }
  return removidos;
}

async function main() {
  const inicio = Date.now();
  mkdirSync(DIR, { recursive: true, mode: 0o700 });

  const dump = { gerado_em: new Date().toISOString(), projeto: URL_BASE, tabelas: {} };
  const contagens = [];
  for (const tabela of TABELAS) {
    const linhas = await baixarTabela(tabela);
    dump.tabelas[tabela] = linhas;
    contagens.push(`${tabela}=${linhas.length}`);
  }

  const carimbo = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16); // 2026-09-30-03-20
  const arquivo = path.join(DIR, `evolua-pdv-${carimbo}.json.gz`);
  writeFileSync(arquivo, gzipSync(Buffer.from(JSON.stringify(dump)), { level: 9 }));

  const removidos = limparAntigos();
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
  console.log(
    `[${new Date().toISOString()}] backup ok em ${segundos}s -> ${arquivo} (${statSync(arquivo).size} bytes) | ${contagens.join(", ")} | backups antigos removidos: ${removidos}`,
  );
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] BACKUP FALHOU:`, err.message || err);
  process.exit(1);
});
