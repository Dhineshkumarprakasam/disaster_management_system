const express = require('express');
const analyticsController = require('../../controllers/analyticsController');
const { requireAdminAuth } = require('../../../utils/helpers');

const router = express.Router();
router.get('/disaster-dashboard', requireAdminAuth, analyticsController.getDashboard);

module.exports = router;
