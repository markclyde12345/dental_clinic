const supabase = require('../config/db');

/**
 * PayMongo Payment Controller for Fano Dental Clinic
 * Handles Checkout Sessions, Verification, and Webhooks for GCash, Maya, Cards, etc.
 */

// @desc    Create PayMongo Checkout Session
// @route   POST /api/payments/paymongo/checkout
// @access  Private (Patient, Receptionist, Admin)
const createPaymongoCheckout = async (req, res) => {
  try {
    const { invoice_id, success_url, cancel_url } = req.body;

    if (!invoice_id) {
      return res.status(400).json({ message: 'Invoice ID is required' });
    }

    // 1. Fetch invoice details from Supabase
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select(`
        id, amount, status, issued_at, paid_at, patient_id, appointment_id,
        patient:patient_id ( id, name, email, contact_number ),
        appointment:appointment_id ( id, appointment_date, notes )
      `)
      .eq('id', invoice_id)
      .single();

    if (invError || !invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // Authorization check: Patient can only pay their own invoices
    if (req.user.role === 'Patient' && invoice.patient_id !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized to pay this invoice' });
    }

    // Check if already paid
    if (invoice.status === 'Paid') {
      return res.status(400).json({ message: 'This invoice has already been paid' });
    }

    const amountFloat = parseFloat(invoice.amount || 0);
    if (isNaN(amountFloat) || amountFloat <= 0) {
      return res.status(400).json({ message: 'Invalid invoice amount' });
    }

    // PayMongo amounts are represented in centavos (PHP 1.00 = 100 centavos)
    const amountInCentavos = Math.round(amountFloat * 100);

    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    const isLiveKey = secretKey && !secretKey.includes('PLACEHOLDER') && secretKey.startsWith('sk_');

    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const defaultSuccessUrl = `${origin}/pages/patient-dashboard.html?payment=success&invoice_id=${invoice.id}`;
    const defaultCancelUrl = `${origin}/pages/patient-dashboard.html?payment=cancelled&invoice_id=${invoice.id}`;

    // 2. If valid PayMongo secret key is configured, invoke PayMongo Checkout API
    if (isLiveKey) {
      const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');
      const invoiceRef = invoice.id.slice(0, 8).toUpperCase();

      const paymongoPayload = {
        data: {
          attributes: {
            billing: {
              name: invoice.patient?.name || req.user.name || 'Valued Patient',
              email: invoice.patient?.email || req.user.email || 'patient@fanoclinic.com',
              phone: invoice.patient?.contact_number || '09171234567'
            },
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            description: `Payment for Fano Dental Clinic Invoice #${invoiceRef}`,
            line_items: [
              {
                currency: 'PHP',
                amount: amountInCentavos,
                name: `Dental Treatment - Invoice #${invoiceRef}`,
                quantity: 1,
                description: `Professional Dental Healthcare Service • Invoice Ref #${invoiceRef}`
              }
            ],
            payment_method_types: ['gcash', 'paymaya', 'card', 'grab_pay', 'dob', 'billease'],
            success_url: success_url || defaultSuccessUrl,
            cancel_url: cancel_url || defaultCancelUrl
          }
        }
      };

      const paymongoRes = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(paymongoPayload)
      });

      const paymongoData = await paymongoRes.json();

      if (!paymongoRes.ok || !paymongoData?.data?.attributes?.checkout_url) {
        console.error('[PayMongo API Error]', paymongoData);
        return res.status(502).json({
          message: paymongoData?.errors?.[0]?.detail || 'Error connecting to PayMongo gateway.',
          paymongo_errors: paymongoData?.errors
        });
      }

      return res.json({
        mode: 'live',
        checkout_url: paymongoData.data.attributes.checkout_url,
        checkout_id: paymongoData.data.id,
        invoice_id: invoice.id,
        amount: amountFloat,
        message: 'PayMongo checkout session initialized.'
      });
    }

    // 3. Sandbox / Fallback mode (when PayMongo secret key is not yet set in .env)
    const sandboxId = `sandbox_cs_${Date.now()}_${invoice.id.slice(0, 6)}`;
    return res.json({
      mode: 'sandbox',
      checkout_url: null,
      checkout_id: sandboxId,
      invoice_id: invoice.id,
      amount: amountFloat,
      invoice_ref: invoice.id.slice(0, 8).toUpperCase(),
      patient_name: invoice.patient?.name || req.user.name,
      message: 'PayMongo sandbox mode active. Set PAYMONGO_SECRET_KEY in server/.env for live hosted PayMongo checkout.'
    });

  } catch (error) {
    console.error('[PayMongo Checkout Error]', error);
    res.status(500).json({ message: error.message || 'Internal server error during checkout' });
  }
};

// @desc    Verify PayMongo Payment & Mark Invoice Paid
// @route   POST /api/payments/paymongo/verify
// @access  Private (Patient, Receptionist, Admin)
const verifyPaymongoPayment = async (req, res) => {
  try {
    const { invoice_id, checkout_id } = req.body;

    if (!invoice_id) {
      return res.status(400).json({ message: 'Invoice ID is required' });
    }

    // 1. Fetch current invoice
    const { data: invoice, error: invError } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .single();

    if (invError || !invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    // If already marked paid
    if (invoice.status === 'Paid') {
      return res.json({ success: true, message: 'Invoice is already marked as Paid.', invoice });
    }

    const secretKey = process.env.PAYMONGO_SECRET_KEY;
    const isLiveKey = secretKey && !secretKey.includes('PLACEHOLDER') && secretKey.startsWith('sk_');

    // 2. If live Checkout ID and live key, verify with PayMongo API
    if (isLiveKey && checkout_id && !checkout_id.startsWith('sandbox_')) {
      const authHeader = 'Basic ' + Buffer.from(secretKey + ':').toString('base64');
      const pmRes = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${checkout_id}`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json'
        }
      });

      const pmData = await pmRes.json();
      if (pmRes.ok && pmData?.data) {
        const payments = pmData.data.attributes?.payments || [];
        const isPaid = payments.some(p => p.attributes?.status === 'paid') || pmData.data.attributes?.status === 'paid';

        if (!isPaid) {
          return res.status(400).json({
            success: false,
            message: 'Payment has not been completed on PayMongo yet.'
          });
        }
      }
    }

    // 3. Mark invoice as Paid in Supabase
    const { data: updatedInvoice, error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'Paid',
        paid_at: new Date().toISOString()
      })
      .eq('id', invoice_id)
      .select()
      .single();

    if (updateError) throw updateError;

    return res.json({
      success: true,
      message: 'Payment confirmed! Invoice status updated to Paid.',
      invoice: updatedInvoice
    });

  } catch (error) {
    console.error('[PayMongo Verify Error]', error);
    res.status(500).json({ message: error.message || 'Error verifying payment' });
  }
};

// @desc    PayMongo Webhook Handler
// @route   POST /api/payments/paymongo/webhook
// @access  Public (Called by PayMongo servers)
const handlePaymongoWebhook = async (req, res) => {
  try {
    const event = req.body?.data;
    if (!event) {
      return res.status(400).send('Invalid webhook payload');
    }

    const eventType = event.attributes?.type;
    console.log(`[PayMongo Webhook] Received event: ${eventType}`);

    if (eventType === 'checkout_session.payment.paid' || eventType === 'payment.paid') {
      const paymentData = event.attributes?.data;
      const description = paymentData?.attributes?.description || '';

      // Match invoice ref from description: "Invoice #XXXXXXXX"
      const match = description.match(/Invoice #([A-F0-9]{8})/i);
      if (match && match[1]) {
        const refIdPrefix = match[1].toLowerCase();
        
        // Find invoice starting with this ID
        const { data: invoices } = await supabase
          .from('invoices')
          .select('id, amount, status');

        const targetInvoice = invoices?.find(inv => inv.id.toLowerCase().startsWith(refIdPrefix));
        if (targetInvoice && targetInvoice.status !== 'Paid') {
          await supabase
            .from('invoices')
            .update({
              status: 'Paid',
              paid_at: new Date().toISOString()
            })
            .eq('id', targetInvoice.id);

          console.log(`[PayMongo Webhook] Successfully reconciled Invoice ${targetInvoice.id}`);
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[PayMongo Webhook Error]', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createPaymongoCheckout,
  verifyPaymongoPayment,
  handlePaymongoWebhook
};
