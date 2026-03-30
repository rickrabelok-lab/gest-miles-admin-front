import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "../admin-app/*",
                "../../admin-app/*",
                "../../../admin-app/*",
                "../../../../admin-app/*",
                "apps/admin-app/*",
                "*/admin-app/src/*"
              ],
              message: "Nao importe codigo do admin-app no manager-app. Extraia para packages/shared quando necessario."
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
              message: "Nao importe codigo do client-app no manager-app. Extraia para packages/shared quando necessario."
            }
          ]
        }
      ],
    },
  },
);
