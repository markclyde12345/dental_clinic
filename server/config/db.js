const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// ─── Startup Guard ────────────────────────────────────────────────────────────
// Fail fast with a clear, actionable message instead of crashing deep inside
// the Supabase client constructor with a cryptic "supabaseUrl is required" trace.
if (!supabaseUrl || supabaseUrl.includes('your-project')) {
  const msg =
    '❌ FATAL: SUPABASE_URL is missing or still set to the placeholder value.\n' +
    '   → On Vercel: go to Settings > Environment Variables and add SUPABASE_URL.\n' +
    '   → Locally: add SUPABASE_URL to server/.env';
  console.error(msg);
  throw new Error(msg);
}

if (!supabaseKey) {
  const msg =
    '❌ FATAL: SUPABASE_KEY is missing.\n' +
    '   → On Vercel: go to Settings > Environment Variables and add SUPABASE_KEY.\n' +
    '   → Locally: add SUPABASE_KEY to server/.env';
  console.error(msg);
  throw new Error(msg);
}

console.log('✅ Supabase config loaded. URL:', supabaseUrl.replace(/\/\/.*@/, '//<credentials>@'));

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
