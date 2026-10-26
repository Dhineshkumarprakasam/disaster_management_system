const express = require('express');
const authController = require('../../controllers/authController');
const { requireAuth, requireAdminAuth } = require('../../../utils/helpers');

const publicRouter = express.Router();
publicRouter.post('/auth/login', authController.login);
publicRouter.post('/auth/admin/login', (req, res, next) => {
  req.body.role = 'admin';
  next();
}, authController.login);
publicRouter.post('/auth/volunteer/login', (req, res, next) => {
  req.body.role = 'volunteer';
  next();
}, authController.login);
publicRouter.post('/auth/volunteer/apply', authController.applyVolunteer);
publicRouter.get('/auth/volunteer/status', authController.checkVolunteerStatus);
publicRouter.post('/auth/logout', requireAuth, authController.logout);
publicRouter.get('/auth/me', requireAuth, authController.me);
publicRouter.post('/login', authController.login);
publicRouter.post('/logout', requireAuth, authController.logout);
publicRouter.get('/me', requireAuth, authController.me);

const adminRouter = express.Router();
adminRouter.post('/login', authController.login);
adminRouter.post('/logout', requireAuth, authController.logout);
adminRouter.get('/me', requireAuth, authController.me);
adminRouter.get('/admins', requireAdminAuth, authController.listAdmins);
adminRouter.post('/create-admin', requireAdminAuth, authController.createAdmin);

module.exports = { publicRouter, adminRouter };
