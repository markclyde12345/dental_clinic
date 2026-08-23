const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'server', '.env') });
const supabase = require('./server/config/db');

async function run() {
  try {
    const { error: apptError } = await supabase
      .from('appointments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    const { error: invError } = await supabase
      .from('invoices')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

    if (apptError || invError) {
      console.log('Error cleaning:', apptError?.message || invError?.message);
    } else {
      console.log('✅ Successfully cleared appointments and invoices.');
    }
  } catch (err) {
    console.error('Catch error:', err);
  }
}

run();
