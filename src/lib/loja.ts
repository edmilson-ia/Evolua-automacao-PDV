import { z } from "zod";

// Endereço (slug) da loja: vai na URL (/c/<slug>) e no e-mail interno dos usuários.
const RESERVADOS = new Set([
  "plataforma", "api", "c", "login", "logout", "setup", "admin", "www", "offline", "pwa", "static",
  "dashboard", "estoque", "pdv", "clientes", "configuracoes", "catalogo", "recuperar-senha",
]);

export const slugSchema = z
  .string({ error: "Informe o endereço da loja" })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/, "Use de 3 a 30 letras minúsculas, números ou hífen")
  .refine((s) => !RESERVADOS.has(s), "Este endereço é reservado");
