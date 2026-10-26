const express = require('express');
const router = express.Router();
const controller = require('../controllers/workflowController');
const auth = require('../../utils/helpers');

// Volunteer Task Execution
router.get('/volunteer/tasks', auth.requireRole('volunteer'), controller.listVolunteerTasks);
router.post('/volunteer/tasks/:id/status', auth.requireRole('volunteer'), controller.updateVolunteerTaskStatus);

module.exports = router;