const express = require('express');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');

const app = express();
const services = {
  auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3101',
  incidents: process.env.INCIDENT_SERVICE_URL || 'http://localhost:3102',
  resources: process.env.RESOURCE_SERVICE_URL || 'http://localhost:3103',
  notifications: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3104',
  analytics: process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3105'
};

app.get('/admin.html', (req, res) => res.redirect(302, '/'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'api-gateway' }));
app.get('/api/instance', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ instanceId: process.env.INSTANCE_ID || os.hostname() });
});

function serviceForRequest(req) {
  const { pathname } = new URL(req.originalUrl, 'http://gateway.local');

  if (pathname === '/events' || pathname === '/api/messages' || pathname.startsWith('/api/admin/messages')) {
    return services.notifications;
  }

  if (
    pathname.startsWith('/api/auth/') ||
    ['/api/login', '/api/logout', '/api/me', '/api/admin/login', '/api/admin/logout', '/api/admin/me',
      '/api/admin/admins', '/api/admin/create-admin'].includes(pathname)
  ) {
    return services.auth;
  }

  if (pathname === '/api/admin/disaster-dashboard') {
    return services.analytics;
  }

  if (
    pathname.startsWith('/api/resources') ||
    pathname.startsWith('/api/geo/') ||
    pathname.startsWith('/api/admin/resources')
  ) {
    return services.resources;
  }

  return services.incidents;
}

function proxyRequest(req, res) {
  const target = new URL(serviceForRequest(req));
  const isEventStream = new URL(req.originalUrl, 'http://gateway.local').pathname === '/events';
  const transport = target.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: target.host };
  const proxy = transport.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port || undefined,
    method: req.method,
    path: req.originalUrl,
    headers
  }, upstream => {
    res.writeHead(upstream.statusCode || 502, upstream.headers);
    if (isEventStream) res.flushHeaders();
    upstream.pipe(res);
  });

  proxy.on('error', error => {
    console.error(`Gateway proxy failed for ${req.method} ${req.url}`, error);
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    res.status(502).json({ error: 'Upstream service is unavailable' });
  });

  req.pipe(proxy);
}

app.use(['/api', '/events'], proxyRequest);
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`NDMS API gateway listening on port ${PORT}`);
});
