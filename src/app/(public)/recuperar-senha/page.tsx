import type { Metadata } from "next";
import CartaoAuth from "@/components/auth/CartaoAuth";
import FormRecuperarSenha from "@/components/auth/FormRecuperarSenha";
import { getBranding } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Esqueceu a senha" };

export default async function RecuperarSenhaPage() {
  return (
    <CartaoAuth branding={await getBranding()} titulo="Esqueceu sua senha?" subtitulo="Recuperação de acesso">
      <FormRecuperarSenha />
    </CartaoAuth>
  );
}
