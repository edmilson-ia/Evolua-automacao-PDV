import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Raiz: cada perfil cai na sua tela inicial.
export default async function Home() {
  const sessao = await getSessao();
  if (!sessao) redirect("/login");
  redirect(sessao.perfil === "admin" ? "/dashboard" : "/pdv");
}
