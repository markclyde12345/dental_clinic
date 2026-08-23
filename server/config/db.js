const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || supabaseUrl.includes('your-project') || !supabaseKey) {
  console.warn('⚠️ WARNING: Supabase URL/Key is not configured. Please set them in your .env file.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
