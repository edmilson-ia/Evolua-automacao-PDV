// PM2 na VPS: `pm2 start ecosystem.config.cjs`. A porta 3100 é a do Traefik (host.docker.internal:3100).
// As chaves ficam em .env.production (só no servidor, nunca no git). Veja scripts/publicar-vps.sh.
module.exports = {
  apps: [
    {
      name: "evolua-pdv",
      cwd: __dirname,
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3100 -H 0.0.0.0",
      env: { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
      autorestart: true,
      // Protege os outros apps da VPS (n8n, jedeposito...): reinicia este se passar de 700 MB
      max_memory_restart: "700M",
    },
  ],
};
