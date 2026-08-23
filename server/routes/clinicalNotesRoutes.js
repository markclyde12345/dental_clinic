const express = require('express');
const router = express.Router();
const { getClinicalNotes, saveClinicalNotes } = require('../controllers/clinicalNotesController');
const { protect, authorize } = require('../middleware/auth');

router.get('/:id/notes', protect, authorize('Dentist', 'Dental Assistant', 'Patient'), getClinicalNotes);
router.put('/:id/notes', protect, authorize('Dentist', 'Dental Assistant'), saveClinicalNotes);

module.exports = router;
