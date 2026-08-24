const express = require('express');
const router = express.Router();

const resourcesController = require('../controllers/resourcesController');
const messagesController = require('../controllers/messagesController');
const authController = require('../controllers/authController');
const workflowController = require('../controllers/workflowController');
const geoController = require('../controllers/geoController');
const { requireAuth } = require('../../utils/helpers');

// Auth routes
router.post('/auth/login', authController.login);
router.post('/auth/admin/login', (req, res, next) => { req.body.role = 'admin'; next(); }, authController.login);
router.post('/auth/government/login', (req, res, next) => { req.body.role = 'government'; next(); }, authController.login);
router.post('/auth/volunteer/login', (req, res, next) => { req.body.role = 'volunteer'; next(); }, authController.login);
router.post('/auth/volunteer/apply', authController.applyVolunteer);
router.post('/auth/logout', requireAuth, authController.logout);
router.get('/auth/me', requireAuth, authController.me);

// Public: volunteer application status check (no auth needed — status only)
router.get('/auth/volunteer/status', authController.checkVolunteerStatus);

// Public emergency alerts & resources
router.get('/resources/nearby', resourcesController.getNearbyResources);
router.get('/messages', messagesController.getActiveMessages);
router.get('/incidents/published', workflowController.listPublishedIncidents);

// Citizen Incident Reporting & SOS Help Requests (public — no login required)
router.post('/reports', workflowController.applyReport);
router.post('/requests', workflowController.createRequest);

// Nearby Volunteers Directory (public)
router.get('/volunteers/nearby', workflowController.listNearbyVolunteers);
router.get('/geo/data', geoController.getGeoData);
router.get('/geo/districts', geoController.getDistrictsForState);

module.exports = router;
