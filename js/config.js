// Runtime configuration for Kathalu frontend.
// Override via window.KATHALU_CONFIG before loading storage.js/auth.js.
export const CONFIG = Object.assign(
  {
    SUPABASE_URL: "https://cohsteoqoxnhehpsogqd.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_YTVGfTVdIS9oO8dpTLdkDw_p4WbBqDl",
    API_URL: "https://kathalu.fly.dev",
    EMAIL_DOMAIN: "kathalu.local",
  },
  window.KATHALU_CONFIG || {}
);
