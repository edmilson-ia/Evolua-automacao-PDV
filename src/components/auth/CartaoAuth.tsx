import type { Branding } from "@/lib/tenant";

/** Moldura das telas de login/primeiro acesso, com a marca do cliente. */
export default function CartaoAuth({
  branding,
  titulo,
  subtitulo,
  children,
}: {
  branding: Branding;
  titulo: string;
  subtitulo: string;
  children: React.ReactNode;
}) {
  const cor = branding.cor_primaria ?? "#2563eb";
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-8 text-white" style={{ background: cor }}>
          {branding.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo_url} alt={branding.nome_fantasia} className="h-16 w-auto rounded-lg bg-white/95 p-1.5" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-3xl font-bold">
              {branding.nome_fantasia.charAt(0)}
            </span>
          )}
          <div className="text-center">
            <h1 className="text-2xl font-bold">{branding.nome_fantasia}</h1>
            <p className="text-sm text-white/85">{subtitulo}</p>
          </div>
        </div>
        <div className="p-6">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">{titulo}</h2>
          {children}
        </div>
      </div>
    </main>
  );
}
