const nodemailer = require('nodemailer');

/**
 * Sends a high-deliverability HTML + Plain Text email to the specified recipient.
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject line
 * @param {string} htmlContent - HTML content of the email
 * @param {string} [textContent] - Optional plain-text fallback content
 */
const sendEmail = async (to, subject, htmlContent, textContent) => {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS) {
      console.log('⚠️ Gmail credentials missing in .env. Skipping email sending.');
      return false;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
      }
    });

    // Auto-generate clean plain-text fallback if none provided
    const plainText = textContent || htmlContent
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const mailOptions = {
      from: `"Fano Dental Clinic" <${process.env.GMAIL_USER}>`,
      to,
      subject,
      text: plainText,
      html: htmlContent,
      headers: {
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'High'
      }
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent successfully to ${to}. Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    return false;
  }
};

module.exports = sendEmail;
