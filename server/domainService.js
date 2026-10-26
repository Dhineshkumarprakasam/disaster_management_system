const express = require('express');
const cookieParser = require('cookie-parser');
const { connectMongo } = require('./config/mongodb');
const { connectRedis } = require('./config/redis');
const { initializeClickHouse } = require('./services/clickHouseService');
const authRoutes = require('./routes/microservices/auth');
const incidentRoutes = require('./routes/microservices/incidents');
const resourceRoutes = require('./routes/microservices/resources');
const notificationRoutes = require('./routes/microservices/notifications');
const analyticsRoutes = require('./routes/microservices/analytics');
const sseService = require('./services/sseService');

const routeDefinitions = {
  auth: {
    mount(app) {
      app.use('/api', authRoutes.publicRouter);
      app.use('/api/admin', authRoutes.adminRouter);
    },
    connect: [connectMongo, connectRedis]
  },
  incidents: {
    mount(app) {
      app.use('/api', incidentRoutes);
    },
    connect: [connectMongo, connectRedis, connectClickHouse]
  },
  resources: {
    mount(app) {
      app.use('/api', resourceRoutes.publicRouter);
      app.use('/api/admin', resourceRoutes.adminRouter);
    },
    connect: [connectMongo, connectRedis]
  },
  notifications: {
    mount(app) {
      app.use('/api', notificationRoutes.publicRouter);
      app.use('/api/admin', notificationRoutes.adminRouter);
      app.get('/events', sseService.handleSSE);
    },
    connect: [connectMongo, connectRedis]
  },
  analytics: {
    mount(app) {
      app.use('/api/admin', analyticsRoutes);
    },
    connect: [connectRedis, connectClickHouse]
  }
};

async function connectClickHouse() {
  await initializeClickHouse();
}

async function start() {
  const serviceName = process.argv[2];
  const definition = routeDefinitions[serviceName];
  if (!definition) {
    throw new Error(`Unknown domain service "${serviceName}". Choose one of: ${Object.keys(routeDefinitions).join(', ')}`);
  }

  await Promise.all(definition.connect.map(connect => connect()));

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.get('/health', (req, res) => res.json({ status: 'ok', service: serviceName }));
  definition.mount(app);

  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    console.log(`NDMS ${serviceName} service listening on port ${port}`);
  });
}

start().catch(error => {
  console.error('Failed to start NDMS domain service', error);
  process.exitCode = 1;
});
