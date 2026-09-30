// Public settings for the browser. These two values are safe to publish:
// the anon key can only do what the database's Row Level Security allows
// (read visible products and store settings). Never put the service role key here.
window.SASI_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY",
};
