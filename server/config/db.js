const { createClient } = require('@supabase/supabase-js');

const DEFAULT_SUPABASE_URL = 'https://cusxuaugwkjjqbjesksg.supabase.co';
const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1c3h1YXVnd2tqanFiamVza3NnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjAzNTExNCwiZXhwIjoyMDk3NjExMTE0fQ.0I5sNvjYQe0d116bwicMoTj6j-dELXTy-Pw4KSr02B4';

const supabaseUrl = process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project')
  ? process.env.SUPABASE_URL
  : DEFAULT_SUPABASE_URL;

const supabaseKey = process.env.SUPABASE_KEY
  ? process.env.SUPABASE_KEY
  : DEFAULT_SUPABASE_KEY;

console.log('✅ Supabase config loaded. URL:', supabaseUrl.replace(/\/\/.*@/, '//<credentials>@'));

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
