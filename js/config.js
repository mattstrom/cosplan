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
  SUPABASE_URL: 'https://shexrvtbgomgxikgvukl.supabase.co',       // e.g. 'https://abcdefghijkl.supabase.co'
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoZXhydnRiZ29tZ3hpa2d2dWtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5MDYwMzQsImV4cCI6MjA5OTQ4MjAzNH0.dskRyWt0JdPz2gTLS2GD2xJO1Yt7dSCasuE0hoXUJNA',  // Project Settings → API → anon public key
  SYNC_POLL_MS: 20000,    // how often to check the server for changes
  REFETCH_MS: 15 * 60 * 1000, // how often an open tab re-pulls URL-imported Sched schedules
};
