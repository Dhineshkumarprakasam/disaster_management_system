# Disaster Management System

A **full-stack web application** to coordinate rescue resources, broadcast disaster alerts, and provide real-time updates to users. Built with **Node.js, Express.js, MongoDB, Redis, Bootstrap, and jQuery**.  

---

## Features

- **User Home Page**
  - Detects user location via HTML5 Geolocation API.
  - Displays nearby rescue resources (hospitals, shelters, rescue teams) from MongoDB.
  - Shows current active disaster messages in real-time.
  
- **Admin Dashboard**
  - Secure login with Redis-based session management.
  - Create, edit, delete disaster messages and rescue resources.
  - Publishes active disaster messages to all connected users via Redis Pub/Sub.
  
- **Real-Time Updates**
  - Server-Sent Events (SSE) stream updates to all clients when a new disaster message is published.

- **Database Usage**
  - **MongoDB**: Persistent storage for admins, resources, and disaster messages.
  - **Redis**: Session storage and Pub/Sub channel for real-time disaster alerts.

---

## Installation

1. Clone the repository:

2. Install dependencies:

```bash
npm install
```

3. Make sure **MongoDB** and **Redis** are running locally:

* MongoDB default: `mongodb://127.0.0.1:27017`
* Redis default: `redis://127.0.0.1:6380`

---

## Running the Application

1. Seed the database with a sample admin, resources, and messages:

```bash
node server/seed.js
```

2. Start the server:

```bash
node server/index.js
```

3. Open your browser:

* User home page: `http://localhost:3000/`
* Admin login: `http://localhost:3000/admin/login`
