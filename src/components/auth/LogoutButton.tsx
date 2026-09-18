"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton({ className, children = "Sair" }: { className?: string; children?: React.ReactNode }) {
  const router = useRouter();

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Apaga páginas guardadas pelo modo offline, para não sobrar tela de quem saiu
    if ("caches" in window) {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n.startsWith("evolua-pages")).map((n) => caches.delete(n)));
    }
    router.replace("/login");
    router.refresh();
  }
  return (
    <button type="button" onClick={sair} className={className}>
      {children}
    </button>
  );
}
