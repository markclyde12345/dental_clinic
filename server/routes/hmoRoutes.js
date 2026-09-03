const express = require('express');
const router = express.Router();
const { getHmoClaims, createHmoClaim, updateHmoClaim } = require('../controllers/hmoController');
const { protect, authorize } = require('../middleware/auth');

router.route('/')
  .get(protect, authorize('Accounting', 'Admin'), getHmoClaims)
  .post(protect, authorize('Accounting', 'Admin'), createHmoClaim);

router.route('/:id')
  .put(protect, authorize('Accounting', 'Admin'), updateHmoClaim);

module.exports = router;
