const express = require('express');
const workflowController = require('../../controllers/workflowController');
const { requireRole } = require('../../../utils/helpers');

const router = express.Router();
router.get('/incidents/published', workflowController.listPublishedIncidents);
router.post('/reports', workflowController.applyReport);
router.post('/requests', workflowController.createRequest);
router.get('/volunteers/nearby', workflowController.listNearbyVolunteers);
router.get('/volunteer/tasks', requireRole('volunteer'), workflowController.listVolunteerTasks);
router.post('/volunteer/tasks/:id/status', requireRole('volunteer'), workflowController.updateVolunteerTaskStatus);

module.exports = router;
