import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "../manager-app/*",
                "../../manager-app/*",
                "../../../manager-app/*",
                "../../../../manager-app/*",
                "apps/manager-app/*",
                "*/manager-app/src/*"
              ],
              message: "Nao importe codigo do manager-app no admin-app. Extraia para packages/shared quando necessario."
            },
            {
              group: [
                "../client-app/*",
                "../../client-app/*",
                "../../../client-app/*",
                "../../../../client-app/*",
                "apps/client-app/*",
                "*/client-app/src/*"
              ],
              message: "Nao importe codigo do client-app no admin-app. Extraia para packages/shared quando necessario."
            }
          ]
        }
      ]
    },
  },
])
