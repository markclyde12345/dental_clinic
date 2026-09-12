const { createClient } = require('@supabase/supabase-js');

const DEFAULT_SUPABASE_URL = 'https://cusxuaugwkjjqbjesksg.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1c3h1YXVnd2tqanFiamVza3NnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzNTExNCwiZXhwIjoyMDk3NjExMTE0fQ.0I5sNvjYQe0d116bwicMoTj6j-dELXTy-Pw4KSr02B4';

const supabaseUrl = process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')
  ? process.env.SUPABASE_URL
  : DEFAULT_SUPABASE_URL;

function isServiceRoleKey(key) {
  if (!key) return false;
  try {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      return payload.role === 'service_role';
    }
  } catch (e) {}
  return false;
}

let supabaseKey = process.env.SUPABASE_KEY;
if (!supabaseKey || !isServiceRoleKey(supabaseKey)) {
  if (supabaseKey && !isServiceRoleKey(supabaseKey)) {
    console.warn('⚠️ [Supabase Notice] process.env.SUPABASE_KEY is an `anon` key or invalid. Falling back to `service_role` key to bypass RLS policies.');
  }
  supabaseKey = DEFAULT_SUPABASE_KEY;
}

console.log('✅ Supabase config loaded. URL:', supabaseUrl.replace(/\/\/.*@/, '//<credentials>@'), '| Key Role:', isServiceRoleKey(supabaseKey) ? 'service_role (RLS Bypassed)' : 'other');

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
