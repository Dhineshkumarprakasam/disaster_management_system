const express = require('express');
const resourcesController = require('../../controllers/resourcesController');
const geoController = require('../../controllers/geoController');
const { requireAdminAuth } = require('../../../utils/helpers');

const publicRouter = express.Router();
publicRouter.get('/resources/nearby', resourcesController.getNearbyResources);
publicRouter.get('/geo/data', geoController.getGeoData);
publicRouter.get('/geo/districts', geoController.getDistrictsForState);

const adminRouter = express.Router();
adminRouter.get('/resources', resourcesController.getAllResources);
adminRouter.post('/resources', requireAdminAuth, resourcesController.createResource);
adminRouter.put('/resources/:id', requireAdminAuth, resourcesController.updateResource);
adminRouter.delete('/resources/:id', requireAdminAuth, resourcesController.deleteResource);

module.exports = { publicRouter, adminRouter };



