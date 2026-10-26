const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const messagesController = require('../controllers/messagesController');
const resourcesController = require('../controllers/resourcesController');
const analyticsController = require('../controllers/analyticsController');
const { requireAuth, requireAdminAuth } = require('../../utils/helpers');

router.post('/login', authController.login);
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, authController.me);

// Messages & Resources
router.get('/messages', requireAdminAuth, messagesController.getAllMessages);
router.post('/messages', requireAdminAuth, messagesController.createMessage);
router.put('/messages/:id', requireAdminAuth, messagesController.updateMessage);
router.delete('/messages/:id', requireAdminAuth, messagesController.deleteMessage);

// Public resources endpoint (used by public portal too)
router.get('/resources', resourcesController.getAllResources);
router.post('/resources', requireAdminAuth, resourcesController.createResource);
router.put('/resources/:id', requireAdminAuth, resourcesController.updateResource);
router.delete('/resources/:id', requireAdminAuth, resourcesController.deleteResource);

// Super Admin Management
router.get('/admins', requireAdminAuth, authController.listAdmins);
router.post('/create-admin', requireAdminAuth, authController.createAdmin);
router.get('/disaster-dashboard', requireAdminAuth, analyticsController.getDashboard);

module.exports = router;
