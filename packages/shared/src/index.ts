export { AuthProvider, useAuth, type AppRole } from "./contexts/AuthContext";
export { APP_CONFIG_KEYS, DEFAULT_APP_CONFIG } from "./config/appConfigDefaults";
export { AppConfigProvider, useAppConfig, useOptionalAppConfig, type AppConfigContextValue } from "./config/AppConfigContext";
export { isSupabaseConfigured, supabase } from "./lib/supabase";
