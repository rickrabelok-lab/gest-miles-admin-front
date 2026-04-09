export {
  type AppRole,
  type OperationalRole,
  OPERATIONAL_ROLES,
  normalizeManagerRole,
  isOperationalRole,
  mapPerfilRoleForOperationalUi,
  mapPerfilRolePreservingGlobalAdmin,
} from "./roles";
export type { BonusOffer, CalendarPricesParams, DemoFlight, LoyaltyProgram } from "./contracts";
export { AuthProvider, useAuth } from "./contexts/AuthContext";
export { APP_CONFIG_KEYS, DEFAULT_APP_CONFIG } from "./config/appConfigDefaults";
export { AppConfigProvider, useAppConfig, useOptionalAppConfig, type AppConfigContextValue } from "./config/AppConfigContext";
export { isSupabaseConfigured, supabase } from "./lib/supabase";
