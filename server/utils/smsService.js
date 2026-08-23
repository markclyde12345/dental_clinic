const twilio = require('twilio');

/**
 * Sends an SMS to a specified phone number using Twilio.
 * @param {string} to - Phone number in E.164 format (e.g. +639123456789)
 * @param {string} message - Message body text
 */
const sendSMS = async (to, message) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !fromNumber) {
      console.log('⚠️ Twilio credentials missing in .env. Skipping SMS sending.');
      return false;
    }

    const client = new twilio(accountSid, authToken);
    const response = await client.messages.create({
      body: message,
      from: fromNumber,
      to
    });

    console.log(`📱 SMS sent successfully to ${to}. SID: ${response.sid}`);
    return true;
  } catch (error) {
    console.error('❌ SMS sending failed:', error);
    return false;
  }
};

module.exports = sendSMS;
