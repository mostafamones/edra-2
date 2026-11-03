/** Only public, build-time values belong here. */
export const publicEnv = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  cookieDomain: import.meta.env.VITE_EDRA_COOKIE_DOMAIN,
  marketingOrigin: import.meta.env.VITE_EDRA_MARKETING_ORIGIN,
  appOrigin: import.meta.env.VITE_EDRA_APP_ORIGIN,
  learnOrigin: import.meta.env.VITE_EDRA_LEARN_ORIGIN,
};
