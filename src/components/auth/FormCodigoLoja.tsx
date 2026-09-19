"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { slugSchema } from "@/lib/loja";

/** Pergunta o endereço (slug) da loja e segue para o login dela. */
export default function FormCodigoLoja() {
  const router = useRouter();
  const [loja, setLoja] = useState("");
  const [erro, setErro] = useState("");

  function seguir(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugSchema.safeParse(loja);
    if (!slug.success) {
      setErro(slug.error.issues[0]?.message ?? "Endereço inválido");
      return;
    }
    router.push(`/c/${slug.data}/login`);
  }

  return (
    <form onSubmit={seguir} className="space-y-4">
      <div>
        <label htmlFor="f-loja" className="mb-1 block text-sm font-medium text-gray-700">
          Endereço da loja
        </label>
        <input
          id="f-loja"
          value={loja}
          onChange={(e) => setLoja(e.target.value)}
          placeholder="minha-loja"
          required
          autoFocus
          autoCapitalize="none"
          autoCorrect="off"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5"
        />
        <p className="mt-1 text-xs text-gray-500">É a última parte do link que a sua loja te passou (…/c/<strong>minha-loja</strong>).</p>
      </div>
      {erro && (
        <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
        </p>
      )}
      <button className="w-full rounded-lg bg-brand py-3 text-lg font-semibold text-white">Continuar</button>
    </form>
  );
}
