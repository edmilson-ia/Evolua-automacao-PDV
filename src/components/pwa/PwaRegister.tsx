"use client";

import { useEffect } from "react";

// Só registra em produção: em desenvolvimento o service worker atrapalharia o hot reload.
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sem service worker o app continua funcionando, só não abre offline */
    });
  }, []);
  return null;
}
