// Deploy-time configuration.
//
// Live sync is OFF until you fill in a Supabase project here (see the
// "Live sync" section of the README — it's a one-table setup using
// supabase/schema.sql). With these left empty the app is fully local and
// groups share via copy-paste share codes instead.
//
// The anon key is designed to be public (it ends up in every visitor's
// browser either way); access control lives in the database functions.

export const CONFIG = {
  SUPABASE_URL: '',       // e.g. 'https://abcdefghijkl.supabase.co'
  SUPABASE_ANON_KEY: '',  // Project Settings → API → anon public key
  SYNC_POLL_MS: 20000,    // how often to check the server for changes
};
