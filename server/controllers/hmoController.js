const supabase = require('../config/db');

// In-memory fallback if Supabase table is not yet migrated
let fallbackClaims = [
  { id: 'clm-001', claim_id: 'CLM-2026-0001', patient_name: 'Juan Dela Cruz', provider_name: 'Maxicare Healthcare', policy_number: 'POL-98234110', claim_amount: 3500, approved_amount: 3500, status: 'Approved', filed_at: '2026-08-20' },
  { id: 'clm-002', claim_id: 'CLM-2026-0002', patient_name: 'Maria Santos', provider_name: 'Intellicare Provider', policy_number: 'POL-44102938', claim_amount: 5200, approved_amount: 0, status: 'Pending', filed_at: '2026-08-24' },
  { id: 'clm-003', claim_id: 'CLM-2026-0003', patient_name: 'Robert Tan', provider_name: 'Medicard Philippines', policy_number: 'POL-77192034', claim_amount: 2800, approved_amount: 2800, status: 'Disbursed', filed_at: '2026-08-26' }
];

// @desc    Get all HMO claims
// @route   GET /api/hmo-claims
// @access  Private (Accounting, Admin)
const getHmoClaims = async (req, res) => {
  try {
    const { data: claims, error } = await supabase
      .from('hmo_claims')
      .select(`
        *,
        patient:patient_id ( id, name, email )
      `)
      .order('filed_at', { ascending: false });

    if (error) throw error;
    res.json(claims || []);
  } catch (error) {
    console.warn('[HMO Claims Supabase Fallback]', error.message);
    res.json(fallbackClaims);
  }
};

// @desc    Create an HMO claim
// @route   POST /api/hmo-claims
// @access  Private (Accounting, Admin)
const createHmoClaim = async (req, res) => {
  const { patient_id, invoice_id, provider_name, policy_number, claim_amount, status } = req.body;
  const newRow = {
    patient_id: patient_id && patient_id.includes('-') ? patient_id : null,
    invoice_id: invoice_id && invoice_id.includes('-') ? invoice_id : null,
    provider_name: provider_name || 'HMO Provider',
    policy_number: policy_number || `POL-${Math.floor(10000000 + Math.random() * 90000000)}`,
    claim_amount: parseFloat(claim_amount) || 0,
    status: status || 'Pending'
  };

  try {
    const { data: inserted, error } = await supabase
      .from('hmo_claims')
      .insert([newRow])
      .select()
      .maybeSingle();

    if (error) throw error;
    res.status(201).json(inserted);
  } catch (error) {
    console.warn('[Create HMO Claim Supabase Fallback]', error.message);
    const mockCreated = { id: `clm-${Date.now()}`, ...newRow, filed_at: new Date().toISOString() };
    fallbackClaims.unshift(mockCreated);
    res.status(201).json(mockCreated);
  }
};

// @desc    Update HMO claim status (Verify / Approve / Disburse)
// @route   PUT /api/hmo-claims/:id
// @access  Private (Accounting, Admin)
const updateHmoClaim = async (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body, updated_at: new Date().toISOString() };

  try {
    const { data: updated, error } = await supabase
      .from('hmo_claims')
      .update(updates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;
    res.json(updated);
  } catch (error) {
    console.warn('[Update HMO Claim Supabase Fallback]', error.message);
    const idx = fallbackClaims.findIndex(c => c.id === id);
    if (idx !== -1) {
      fallbackClaims[idx] = { ...fallbackClaims[idx], ...updates };
      return res.json(fallbackClaims[idx]);
    }
    res.json({ id, ...updates });
  }
};

module.exports = {
  getHmoClaims,
  createHmoClaim,
  updateHmoClaim
};
