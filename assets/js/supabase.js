// Shared Supabase client for Literasea pages.
const SUPABASE_URL = "https://efpibindqlgscfsneuxu.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcGliaW5kcWxnc2Nmc25ldXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NTk4ODcsImV4cCI6MjA5NzIzNTg4N30.9UUT-DVsAgJFUsoUn5LF4JHwIyS1NPkiWZTglwV38ME";

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.supabaseClient = supabaseClient;
