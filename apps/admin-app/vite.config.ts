import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import autoprefixer from "autoprefixer";
import tailwindcss from "tailwindcss";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Garante uma só instância de React (evita "Invalid hook call" com react-router no monorepo). */
function pkgDir(name: string): string {
  return path.dirname(require.resolve(`${name}/package.json`));
}

const reactRoot = pkgDir("react");
const reactDomRoot = pkgDir("react-dom");
/** Mesma instância que `react` — evita `require_jsx_runtime is not a function` no deps pre-bundle. */
const reactJsxRuntime = path.join(reactRoot, "jsx-runtime.js");
const reactJsxDevRuntime = path.join(reactRoot, "jsx-dev-runtime.js");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  /** Backend Express (Stripe admin, audit, etc.). Em dev, o browser chama `/api/*` no mesmo origin e o Vite reencaminha para aqui — evita CORS. */
  const apiProxyTarget = env.VITE_API_PROXY_TARGET?.trim() || env.VITE_API_URL?.trim() || "http://127.0.0.1:3000";

  return {
  plugins: [react()],
  /** Garante Tailwind no dev — em monorepos o `postcss.config.js` por vezes não é aplicado ao CSS. */
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: path.join(__dirname, "tailwind.config.ts") }),
        autoprefixer(),
      ],
    },
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      react: reactRoot,
      "react-dom": reactDomRoot,
      "react/jsx-runtime": reactJsxRuntime,
      "react/jsx-dev-runtime": reactJsxDevRuntime,
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-router",
      "react-router-dom",
    ],
    /** Pre-bundle do Query com alias de React quebra o interop do jsx-runtime; deixa o Vite tratar o pacote. */
    exclude: ["@tanstack/react-query"],
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  };
});
