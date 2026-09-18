"use client";

import { useRouter } from "next/navigation";

export default function ExcluirProdutoButton({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  async function excluir() {
    if (!confirm(`Excluir "${nome}"? O histórico de vendas será mantido.`)) return;
    const res = await fetch(`/api/produtos/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else alert("Não foi possível excluir.");
  }
  return (
    <button onClick={excluir} className="text-red-600 hover:underline">
      Excluir
    </button>
  );
}
