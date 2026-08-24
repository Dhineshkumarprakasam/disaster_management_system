const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const messagesController = require('../controllers/messagesController');
const resourcesController = require('../controllers/resourcesController');
const workflowController = require('../controllers/workflowController');
const { requireAuth, requireAdminAuth, requireOfficial } = require('../../utils/helpers');

router.post('/login', authController.login);
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, authController.me);

// Messages & Resources
router.get('/messages', requireOfficial, messagesController.getAllMessages);
router.post('/messages', requireOfficial, messagesController.createMessage);
router.put('/messages/:id', requireOfficial, messagesController.updateMessage);
router.delete('/messages/:id', requireOfficial, messagesController.deleteMessage);

// Public resources endpoint (used by public portal too)
router.get('/resources', resourcesController.getAllResources);
router.post('/resources', requireOfficial, resourcesController.createResource);
router.put('/resources/:id', requireOfficial, resourcesController.updateResource);
router.delete('/resources/:id', requireOfficial, resourcesController.deleteResource);

// Super Admin Management
router.get('/admins', requireAdminAuth, authController.listAdmins);
router.post('/create-admin', requireAdminAuth, authController.createAdmin);
router.post('/create-government', requireAdminAuth, authController.createGovernment);
// Keep old route as alias
router.post('/government', requireAdminAuth, authController.createGovernment);

// Government Staff List (Admin only)
router.get('/staff', requireAdminAuth, authController.listGovernmentStaff);

// Official Officers Management (Add & Remove Officers)
router.get('/officers', requireOfficial, workflowController.listOfficialOfficers);
router.post('/officers', requireAdminAuth, workflowController.addOfficialOfficer);
router.delete('/officers/:id', requireAdminAuth, workflowController.removeOfficialOfficer);

module.exports = router;
