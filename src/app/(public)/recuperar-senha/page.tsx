import type { Metadata } from "next";
import CartaoAuth from "@/components/auth/CartaoAuth";
import FormRecuperarSenha from "@/components/auth/FormRecuperarSenha";
import { BRANDING_PADRAO } from "@/lib/tenant";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Esqueceu a senha" };

export default function RecuperarSenhaPage() {
  return (
    <CartaoAuth branding={BRANDING_PADRAO} titulo="Esqueceu sua senha?" subtitulo="Recuperação de acesso">
      <FormRecuperarSenha />
    </CartaoAuth>
  );
}
