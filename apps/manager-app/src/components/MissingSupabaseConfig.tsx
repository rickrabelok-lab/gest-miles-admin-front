/**
 * Exibido em produção quando VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não estão definidas
 * (ex.: Vercel sem Environment Variables). Evita tela branca por throw no import.
 */
const MissingSupabaseConfig = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 py-12 text-center text-slate-100">
    <h1 className="text-xl font-semibold text-white">Configuração do Supabase ausente</h1>
    <p className="max-w-md text-sm text-slate-300">
      O app precisa das variáveis de ambiente do Supabase no deploy. Sem elas, nada é exibido
      (antes o app quebrava com tela branca).
    </p>
    <div className="max-w-lg rounded-xl border border-slate-700 bg-slate-900/80 p-4 text-left text-sm">
      <p className="mb-2 font-medium text-white">No Vercel:</p>
      <ol className="list-decimal space-y-2 pl-5 text-slate-300">
        <li>Abra o projeto → <strong>Settings</strong> → <strong>Environment Variables</strong></li>
        <li>
          Adicione (para <strong>Production</strong>, <strong>Preview</strong> e <strong>Development</strong> se quiser):
        </li>
      </ol>
      <ul className="mt-2 space-y-1 font-mono text-xs text-emerald-300">
        <li>VITE_SUPABASE_URL = URL do projeto (Supabase → Settings → API)</li>
        <li>VITE_SUPABASE_ANON_KEY = anon public key</li>
      </ul>
      <p className="mt-3 text-slate-400">
        Salve e faça um <strong>Redeploy</strong> (Deployments → ⋮ → Redeploy). Variáveis{" "}
        <code className="text-slate-200">VITE_*</code> só entram no build.
      </p>
    </div>
    <p className="text-xs text-slate-500">
      Link antigo com <strong>404 NOT_FOUND</strong>: deployment removido ou URL mudou — use o domínio atual em
      Vercel → Deployments → domínio do último deploy com sucesso.
    </p>
  </div>
);

export default MissingSupabaseConfig;
