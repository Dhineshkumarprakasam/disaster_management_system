const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { connectMongo } = require('./config/mongodb');
const { connectRedis } = require('./config/redis');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const sseService = require('./services/sseService');

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

app.get('/events', (req, res) => {
  sseService.handleSSE(req, res);
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));

const PORT = 3000;
(async () => {
  await connectMongo();
  await connectRedis();
  app.listen(PORT, () => {
    console.log(`Disaster Management app running on http://localhost:${PORT}`);
  });
})();
