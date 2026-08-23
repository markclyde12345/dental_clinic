const supabase = require('../config/db');

const logAction = async (userId, action, details) => {
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert([{
        user_id: userId || null,
        action,
        details: details || null
      }]);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Audit Log Error:', error.message);
  }
};

module.exports = logAction;
