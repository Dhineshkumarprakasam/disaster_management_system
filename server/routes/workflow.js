const express = require('express');
const router = express.Router();
const controller = require('../controllers/workflowController');
const auth = require('../../utils/helpers');

// Government Official workflow
router.get('/government/reports', auth.requireOfficial, controller.listReports);
router.put('/government/reports/:id', auth.requireOfficial, controller.reviewReport);

// Department Dispatches (Police 112, Fire 101, Ambulance 108, NDRF)
router.post('/government/dispatch', auth.requireOfficial, controller.dispatchDepartment);
router.get('/government/dispatches', auth.requireOfficial, controller.listDispatches);

// Volunteer Applications & Calls
router.get('/government/volunteers', auth.requireOfficial, controller.listApplications);
router.put('/government/volunteers/:id', auth.requireOfficial, controller.reviewApplication);
router.post('/government/assign-volunteer', auth.requireOfficial, controller.assignVolunteer);

// Help Requests
router.get('/government/requests', auth.requireOfficial, controller.listRequests);

// Volunteer Task Execution
router.get('/volunteer/tasks', auth.requireRole('volunteer'), controller.listVolunteerTasks);
router.post('/volunteer/tasks/:id/status', auth.requireRole('volunteer'), controller.updateVolunteerTaskStatus);

module.exports = router;