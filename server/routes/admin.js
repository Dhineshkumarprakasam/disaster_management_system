const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const messagesController = require('../controllers/messagesController');
const resourcesController = require('../controllers/resourcesController');
const { requireAdminAuth } = require('../../utils/helpers');

router.post('/login', authController.login);
router.post('/logout', requireAdminAuth, authController.logout);
router.get('/me', requireAdminAuth, authController.me);

router.post('/messages', requireAdminAuth, messagesController.createMessage);
router.put('/messages/:id', requireAdminAuth, messagesController.updateMessage);
router.delete('/messages/:id', requireAdminAuth, messagesController.deleteMessage);

router.post('/resources', requireAdminAuth, resourcesController.createResource);
router.put('/resources/:id', requireAdminAuth, resourcesController.updateResource);
router.delete('/resources/:id', requireAdminAuth, resourcesController.deleteResource);

router.get('/admins', requireAdminAuth, authController.listAdmins);
router.get('/resources', resourcesController.getAllResources);
module.exports = router;
