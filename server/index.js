const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { connectMongo } = require('./config/mongodb');
const { connectRedis } = require('./config/redis');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const workflowRoutes = require('./routes/workflow');
const sseService = require('./services/sseService');

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', workflowRoutes);

app.get('/events', (req, res) => {
  sseService.handleSSE(req, res);
});

// Single Page Application route handler
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/events')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
(async () => {
  await connectMongo();
  await connectRedis();
  app.listen(PORT, () => {
    console.log(`===========================================================`);
    console.log(`🇮🇳 National Disaster Management System (NDMS) - India`);
    console.log(`🌐 Application running on: http://localhost:${PORT}`);
    console.log(`===========================================================`);
  });
})();
