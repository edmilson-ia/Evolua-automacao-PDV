#!/usr/bin/env bash
# Publica a versão ATUAL do git (último commit) na VPS da Hostinger: envia o código, compila no servidor
# (prioridade baixa, para não atrapalhar o n8n e os outros apps) e recarrega o PM2.
# Uso (no Git Bash, na pasta do projeto):  bash scripts/publicar-vps.sh
#
# O que NÃO muda: as chaves (.env.production fica só no servidor), o n8n, o Traefik e os outros apps.
# Atenção: durante o build (~1 min) o site pode ficar fora do ar por alguns segundos, porque o Next recria a pasta .next.
# Desfazer a publicação inteira:  ssh root@IP "pm2 delete evolua-pdv && rm /docker/n8n/dynamic/evolua-pdv.yml"
set -euo pipefail

HOST="${VPS_HOST:-root@2.25.208.127}"
DIR=/var/www/evolua-pdv
SITE="${SITE:-https://pdv.srv1974666.hstgr.cloud}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Há alterações sem commit. Faça o commit antes de publicar (o que vai para o ar é o último commit)."
  exit 1
fi

URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '\r"')
[ -n "$URL" ] || { echo "NEXT_PUBLIC_SUPABASE_URL não encontrada no .env.local"; exit 1; }

echo "1/3 enviando o código ($(git log --oneline -1))..."
git archive --format=tar HEAD | ssh "$HOST" "mkdir -p $DIR && tar -x -C $DIR"

echo "2/3 compilando no servidor (leva alguns minutos)..."
ssh "$HOST" "cd $DIR && export NEXT_PUBLIC_SUPABASE_URL='$URL' NEXT_TELEMETRY_DISABLED=1 && nice -n 19 npm ci && nice -n 19 npm run build"

echo "3/3 recarregando o app..."
ssh "$HOST" "cd $DIR && (pm2 reload evolua-pdv --update-env 2>/dev/null || pm2 start ecosystem.config.cjs) && pm2 save >/dev/null"

sleep 4
curl -fsS -o /dev/null -w "site no ar: HTTP %{http_code}\n" "$SITE/login"
