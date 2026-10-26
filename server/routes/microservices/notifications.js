const express = require('express');
const messagesController = require('../../controllers/messagesController');
const { requireAdminAuth } = require('../../../utils/helpers');

const publicRouter = express.Router();
publicRouter.get('/messages', messagesController.getActiveMessages);

const adminRouter = express.Router();
adminRouter.get('/messages', requireAdminAuth, messagesController.getAllMessages);
adminRouter.post('/messages', requireAdminAuth, messagesController.createMessage);
adminRouter.put('/messages/:id', requireAdminAuth, messagesController.updateMessage);
adminRouter.delete('/messages/:id', requireAdminAuth, messagesController.deleteMessage);

module.exports = { publicRouter, adminRouter };
