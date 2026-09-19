import Link from "next/link";

export default function LojaNaoEncontrada() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Loja não encontrada</h1>
        <p className="mb-6 text-gray-600">Confira o endereço ou peça o link correto para a loja.</p>
        <Link href="/login?trocar=1" className="font-medium text-brand hover:underline">
          Entrar em outra loja
        </Link>
      </div>
    </main>
  );
}
