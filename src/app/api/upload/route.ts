import { NextResponse } from "next/server";
import { exigirApi } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";

const TIPOS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const negado = await exigirApi(["admin"]);
  if (negado) return negado;
  const form = await req.formData();
  const file = form.get("file");
  // "pasta" separa imagens de produto das de branding (logo/ícone)
  const pasta = form.get("pasta") === "branding" ? "branding" : "produtos";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
  }
  const ext = TIPOS[file.type];
  if (!ext) return NextResponse.json({ error: "Use imagem JPG, PNG ou WEBP" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Imagem acima de 5 MB" }, { status: 400 });

  const db = createServerClient();
  const path = `${getTenantId()}/${pasta}/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage.from("produtos").upload(path, file, { contentType: file.type });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = db.storage.from("produtos").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl }, { status: 201 });
}
