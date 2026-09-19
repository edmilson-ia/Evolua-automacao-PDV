"use client";

import { useRouter } from "next/navigation";

export default function ExcluirClienteButton({ id, nome }: { id: string; nome: string }) {
  const router = useRouter();
  async function excluir() {
    if (!confirm(`Excluir o cliente "${nome}"?`)) return;
    const res = await fetch(`/api/clientes/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
    else alert("Não foi possível excluir.");
  }
  return (
    <button onClick={excluir} className="text-red-600 hover:underline">
      Excluir
    </button>
  );
}
