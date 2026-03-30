/** Igual ao mile-manager-pro-1: evita tela branca sem variáveis VITE_SUPABASE_*. */
export default function MissingSupabaseConfig() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 py-12 text-center text-slate-100">
      <h1 className="text-xl font-semibold text-white">Configuração do Supabase ausente</h1>
      <p className="max-w-md text-sm text-slate-300">
        Defina <code className="text-emerald-300">VITE_SUPABASE_URL</code> e{" "}
        <code className="text-emerald-300">VITE_SUPABASE_ANON_KEY</code> em{" "}
        <code className="text-slate-200">apps/admin-app/.env.local</code> e reinicie o servidor.
      </p>
    </div>
  );
}
