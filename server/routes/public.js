const express = require('express');
const router = express.Router();

const resourcesController = require('../controllers/resourcesController');
const messagesController = require('../controllers/messagesController');

router.get('/resources/nearby', resourcesController.getNearbyResources);
router.get('/messages', messagesController.getActiveMessages);

module.exports = router;
