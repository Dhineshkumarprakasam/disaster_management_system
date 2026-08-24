# National Disaster Management System

## Project Report

The National Disaster Management System (NDMS) is a full-stack web application for coordinating disaster reports, emergency help requests, volunteers, government staff, emergency resources, department dispatches, and public alerts.

The project demonstrates role-based authentication, map-based location capture, proximity-based volunteer assignment, MongoDB persistence, Redis sessions and pub/sub, real-time Server-Sent Events, and Docker deployment.

## Objective

The system connects citizens who need emergency help with government officials, approved volunteers, hospitals, shelters, rescue centers, and response departments.

Typical workflow:

1. A citizen selects an exact location on a map and submits a disaster report or SOS request.
2. The server validates the coordinates and geographic details.
3. Government staff review and verify reports.
4. Verified reports may be published and dispatched to response departments.
5. The system searches approved and available volunteers.
6. A volunteer is assigned only when the volunteer and emergency locations are within 3 km.
7. The volunteer views the task and updates its status.
8. Public users view active alerts and nearby emergency resources.

## Technology Stack

### Frontend

- HTML5 for page structure.
- CSS3 for responsive layout and government-style presentation.
- JavaScript and jQuery for browser behavior and API calls.
- Bootstrap assets for the legacy admin page.
- Leaflet for interactive maps.
- OpenStreetMap tiles for map display.
- Nominatim for reverse geocoding and pincode search.

### Backend

- Node.js runtime.
- Express.js REST API and static web server.
- Cookie Parser for session cookies.
- UUID for session token generation.
- bcryptjs for password hashing.

### Storage and messaging

- MongoDB for persistent records.
- Redis for sessions and disaster-message pub/sub.
- An in-memory store for development when MongoDB is unavailable.

### Deployment

- Dockerfile for the Node.js service.
- Docker Compose for the application, MongoDB, and Redis services.

## Architecture

```text
Browser
  |
  | REST requests, map interaction, SSE alerts
  v
Express server: server/index.js
  |
  +-- Routes
  +-- Controllers
  +-- Models
  +-- Services
  +-- Utilities
  |
  +-- MongoDB: persistent records
  +-- Redis: sessions and pub/sub
```

`server/index.js` creates the Express application, connects to databases, serves the `public` folder, mounts routes, exposes the SSE endpoint, and starts the HTTP server.

## Folder Structure

```text
disaster_management_system/
|
+-- package.json
+-- package-lock.json
+-- README.md
+-- Dockerfile
+-- docker-compose.yaml
|
+-- public/
|   +-- index.html
|   +-- admin.html
|   +-- css/style.css
|   +-- js/main.js
|   +-- js/admin.js
|   +-- libs/jquery.min.js
|   +-- libs/bootstrap.min.css
|   +-- libs/bootstrap.min.js
|
+-- server/
|   +-- index.js
|   +-- seed.js
|   +-- config/
|   |   +-- mongodb.js
|   |   +-- redis.js
|   +-- controllers/
|   |   +-- authController.js
|   |   +-- geoController.js
|   |   +-- messagesController.js
|   |   +-- resourcesController.js
|   |   +-- workflowController.js
|   +-- models/
|   |   +-- adminModel.js
|   |   +-- dataStore.js
|   |   +-- messageModel.js
|   |   +-- resourceModel.js
|   |   +-- userModel.js
|   +-- routes/
|   |   +-- public.js
|   |   +-- admin.js
|   |   +-- workflow.js
|   +-- services/
|       +-- redisService.js
|       +-- sseService.js
|
+-- utils/
    +-- helpers.js
    +-- geoData.js
    +-- geoHelpers.js
    +-- india-states-districts.json
```

## Root Files

### `package.json`

Defines project metadata, runtime dependencies, and commands:

```bash
npm install
npm start
npm run seed
```

### `Dockerfile`

Uses Node.js 20 Alpine, installs dependencies with `npm ci`, copies the source, exposes port 3000, and starts the application.

### `docker-compose.yaml`

Defines three services:

- `app`: the Node.js NDMS server.
- `mongo`: MongoDB 7 with persistent storage.
- `redis`: Redis 7 Alpine with persistent storage.

The app receives `MONGODB_URI=mongodb://mongo:27017` and `REDIS_URL=redis://redis:6379` inside the Docker network.

## Frontend Files

### `public/index.html`

The primary public portal and single-page interface. It contains the public home page, incident report form, SOS form, volunteer application, login form, government dashboard, volunteer dashboard, and map containers.

### `public/admin.html`

A legacy standalone administration page. It provides alternate login, message management, resource management, and workflow screens.

### `public/css/style.css`

Defines the shared design system: colors, typography, cards, forms, buttons, tables, badges, modals, map controls, spacing, and responsive mobile behavior.

### `public/js/main.js`

Controls the main portal. It manages sessions, role-based views, public data loading, maps, markers, pincode search, reverse geocoding, report submission, SOS submission, volunteer applications, government actions, volunteer tasks, and SSE alerts.

### `public/js/admin.js`

Controls the legacy admin page. It manages login, messages, resources, government staff, workflows, and the admin resource map picker.

## Server Entry and Seed

### `server/index.js`

The application entry point. It:

1. Creates the Express app.
2. Enables JSON parsing and cookie parsing.
3. Serves static files from `public`.
4. Mounts public, admin, and workflow routes.
5. Exposes `/events` for Server-Sent Events.
6. Connects to MongoDB and Redis.
7. Starts on `PORT`, defaulting to 3000.

### `server/seed.js`

Seeds MongoDB with development accounts, official officers, emergency resources, messages, and incidents. It deletes selected collections before inserting seed data, so it must be used only for development.

## Configuration

### `server/config/mongodb.js`

Attempts MongoDB connections using:

1. `MONGODB_URI`, when configured.
2. `mongodb://mongo:27017`.
3. `mongodb://127.0.0.1:27017`.

When MongoDB cannot be reached, the application loads `server/models/dataStore.js` as a development fallback. It also creates the resources geospatial index.

### `server/config/redis.js`

Attempts Redis connections using `REDIS_URL`, the Docker hostname, and localhost. If Redis is unavailable, a process-local session cache is used for development.

## Controllers

### `authController.js`

Handles admin, government, and volunteer login; logout; current-user lookup; volunteer applications; application status; volunteer review; government account creation; admin creation; and staff listing.

Passwords are hashed using bcryptjs. Session tokens are stored in Redis or the development fallback cache.

### `geoController.js`

Serves the local India geography dataset through:

- `GET /api/geo/data`
- `GET /api/geo/districts?state=Tamil%20Nadu`

The current source contains 36 states and Union Territories and 785 districts.

### `messagesController.js`

Retrieves active messages, lists all messages for officials, and provides create, update, and delete operations. Active messages are published to Redis.

### `resourcesController.js`

Validates and manages hospitals, shelters, rescue centers, and other resources. It supports nearby searches using latitude, longitude, and radius in meters.

### `workflowController.js`

Contains the main emergency workflow:

- Incident reporting and review.
- Incident verification and publication.
- Department dispatch.
- SOS request handling.
- Volunteer application review.
- Automatic and manual volunteer assignment.
- Volunteer task listing and status updates.
- Government geographic scope enforcement.

## Models

### `adminModel.js`

Reads and writes administrator accounts using MongoDB or the memory store.

### `userModel.js`

Reads and writes government and volunteer accounts using MongoDB or the memory store.

### `messageModel.js`

Persists disaster alert messages and supports active/all message queries and CRUD operations.

### `resourceModel.js`

Persists emergency resources and performs MongoDB `$near` geographic searches.

### `dataStore.js`

The development fallback database. It contains demo users, incidents, resources, officers, requests, applications, messages, and dispatches.

## Routes

### Public routes: `server/routes/public.js`

Mounted under `/api`:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/login` | Role-aware login |
| POST | `/api/auth/admin/login` | Admin login |
| POST | `/api/auth/government/login` | Government login |
| POST | `/api/auth/volunteer/login` | Volunteer login |
| POST | `/api/auth/volunteer/apply` | Apply as volunteer |
| GET | `/api/auth/volunteer/status` | Check application status |
| POST | `/api/auth/logout` | End session |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/resources/nearby` | Find nearby resources |
| GET | `/api/messages` | Get active messages |
| GET | `/api/incidents/published` | Get published incidents |
| POST | `/api/reports` | Submit incident report |
| POST | `/api/requests` | Submit SOS request |
| GET | `/api/volunteers/nearby` | List approved volunteers |
| GET | `/api/geo/data` | Get all geography data |
| GET | `/api/geo/districts` | Get districts by state |

### Admin routes: `server/routes/admin.js`

Mounted under `/api/admin`. Provides protected message and resource CRUD, admin creation, government staff creation and listing, and official officer management.

Important endpoints include `/api/admin/messages`, `/api/admin/resources`, `/api/admin/admins`, `/api/admin/create-admin`, `/api/admin/create-government`, `/api/admin/staff`, and `/api/admin/officers`.

### Workflow routes: `server/routes/workflow.js`

Provides protected operational endpoints:

- `/api/government/reports`
- `/api/government/dispatch`
- `/api/government/dispatches`
- `/api/government/volunteers`
- `/api/government/assign-volunteer`
- `/api/government/requests`
- `/api/volunteer/tasks`
- `/api/volunteer/tasks/:id/status`

## Services

### `redisService.js`

Publishes disaster messages to the Redis channel `disaster_messages`.

### `sseService.js`

Maintains connected browser clients and streams Redis messages through `/events`. It sends heartbeat comments every 30 seconds and removes disconnected clients.

## Utilities

### `utils/helpers.js`

Provides authentication middleware:

- `requireAuth`: validates the session cookie.
- `requireRole`: restricts access to selected roles.
- `requireAdminAuth`: admin-only access.
- `requireOfficial`: admin or government access.

### `utils/geoData.js`

Loads and normalizes the local state/district data. It provides state lists, state-filtered districts, aliases, and district lookup.

### `utils/geoHelpers.js`

Provides state/district matching, coordinate validation, GeoJSON point creation, Haversine distance, geographic filters, and the 3 km volunteer eligibility rule.

### `utils/india-states-districts.json`

The local state and district dataset. Keeping it in the repository prevents dropdowns from depending on a live internet request.

## Location System

The application uses coordinates as the authoritative location value instead of relying on typed locality names.

Users can:

- Click a point on a Leaflet map.
- Drag the map marker.
- Use browser current location.
- Enter a six-digit Indian pincode.
- Select a nearby result from the pincode search.

The selected location is stored as GeoJSON:

```json
{
  "type": "Point",
  "coordinates": [longitude, latitude]
}
```

MongoDB uses longitude first and latitude second. Latitude and longitude are range-checked before storage. Reverse geocoding fills the address, district, and state fields, while the selected coordinates remain authoritative.

## Volunteer Assignment Rule

Automatic and manual assignment both require:

1. An approved volunteer.
2. An available volunteer.
3. Compatible state and district information.
4. Valid coordinates for both the emergency and volunteer.
5. Haversine distance less than or equal to 3 km.

If coordinates are missing or the volunteer is farther than 3 km, the emergency remains unassigned. District-only matching is not enough.

The 3 km distance is straight-line distance. It is not driving distance or estimated travel time.

## Roles

### Guest or citizen

Can view public alerts and resources, submit incident reports, submit SOS requests, browse approved volunteers, and apply to volunteer.

### Volunteer

Can sign in after approval, view assigned work, mark tasks as en route, and mark tasks as fulfilled or completed.

### Government official

Can review reports and volunteer applications, publish verified reports, manage alerts and resources, dispatch departments, process SOS requests, and assign volunteers within the permitted geographic scope.

### Administrator

Can create government staff and admins, manage officers, manage messages and resources, and access government operations.

## Authentication

The authentication flow is:

1. The browser submits credentials and role.
2. The server verifies the password with bcryptjs.
3. A session token is generated.
4. The session is stored as `session:<token>` in Redis or the development cache.
5. The browser receives the token in the `dm_session` cookie.
6. Protected middleware validates the cookie on later requests.

HTTP 401 means authentication is missing or expired. HTTP 403 means the authenticated role is not permitted to perform the operation.

## Data Collections

MongoDB uses these collections:

- `admins`: administrator accounts.
- `users`: government staff and volunteers.
- `officialOfficers`: police, fire, NDRF, ambulance, and other officers.
- `resources`: hospitals, shelters, and rescue resources.
- `messages`: public alerts.
- `disasterReports`: citizen incident reports.
- `resourceRequests`: SOS requests.
- `volunteerApplications`: volunteer applications and reviews.
- `departmentDispatches`: department dispatch records.

The memory store mirrors these collections for standalone development.

## Real-Time Alert Flow

```text
Official creates or activates alert
        |
        v
messagesController
        |
        v
redisService.publishMessage()
        |
        v
Redis channel: disaster_messages
        |
        v
sseService subscriber
        |
        v
Connected browsers through /events
```

The browser receives the SSE message and updates the public alert ticker without a full page reload.

## Installation

### Requirements

- Node.js 20 or newer.
- npm.
- MongoDB 7 or compatible MongoDB.
- Redis 7 or compatible Redis.
- Internet access for Leaflet, OpenStreetMap tiles, and Nominatim search.

### Local setup

```bash
npm install
npm run seed
npm start
```

Optional environment variables:

```text
MONGODB_URI=mongodb://127.0.0.1:27017
REDIS_URL=redis://127.0.0.1:6379
PORT=3000
```

Open:

- Public portal: `http://localhost:3000/`
- Admin login: `http://localhost:3000/admin/login`
- Government login: `http://localhost:3000/government/login`
- Volunteer login: `http://localhost:3000/volunteer/login`

If MongoDB is unavailable, the server can start with the in-memory development store. If Redis is unavailable, it can use the development session fallback.

## Development Accounts

The seed script creates:

| Role | Username | Password |
| --- | --- | --- |
| Administrator | `admin` | `admin123` |
| Government official | `official` | `official123` |
| Volunteer | `volunteer` | `volunteer123` |

These credentials are for development only and must be changed before deployment.

## Docker Setup

Start the full stack:

```bash
docker compose up -d --build
```

Seed the database:

```bash
docker compose exec app npm run seed
```

Open `http://localhost:3000/`.

Stop the stack:

```bash
docker compose down
```

Docker volumes:

- `mongo_data` stores MongoDB data.
- `redis_data` stores Redis data.

## API Examples

### Geography

```http
GET /api/geo/data
GET /api/geo/districts?state=Tamil%20Nadu
```

### Nearby resources

```http
GET /api/resources/nearby?lat=12.9716&lng=77.5946&radius=5000
```

`radius` is in meters.

### Incident report

```json
POST /api/reports
{
  "title": "Flood near residential area",
  "category": "Flood",
  "severity": "critical",
  "description": "Water entered several homes.",
  "area": "Selected map address",
  "district": "Vellore",
  "state": "Tamil Nadu",
  "lat": 12.872259,
  "lng": 79.092498
}
```

### SOS request

```json
POST /api/requests
{
  "type": "rescue",
  "details": "Immediate evacuation required.",
  "contact": "+91 90000 00000",
  "location": "Selected map address",
  "district": "Vellore",
  "state": "Tamil Nadu",
  "lat": 12.872259,
  "lng": 79.092498
}
```

## Error and Fallback Behavior

- Required fields are validated by controllers.
- Invalid and partial coordinates are rejected.
- Reports and SOS requests without map coordinates are rejected.
- Volunteers beyond 3 km are not assigned.
- MongoDB failure activates the memory store.
- Redis failure activates the development session fallback.
- Missing or expired sessions return HTTP 401.
- Unauthorized roles return HTTP 403.
- Missing records return HTTP 404 where applicable.

## Testing and Verification

The project currently uses executable checks rather than a formal test framework:

```bash
node --check server/index.js
node --check server/controllers/workflowController.js
node --check server/controllers/authController.js
node --check utils/geoHelpers.js
```

Location tests should include:

- A volunteer at the exact same point.
- A volunteer within 3 km.
- A volunteer just beyond 3 km.
- A volunteer with no coordinates.
- Invalid latitude or longitude.
- Valid zero coordinates.

## Production Checklist

Before internet deployment:

1. Use HTTPS for secure sessions and browser geolocation.
2. Replace all development credentials and secrets.
3. Configure secure HTTP-only, SameSite cookies.
4. Use managed or private MongoDB and Redis.
5. Never expose MongoDB or Redis publicly.
6. Add rate limiting, monitoring, backups, and audit logs.
7. Use a production geocoding provider or self-hosted geocoder suitable for public traffic.
8. Do not use the public Nominatim service for high-volume production traffic.
9. Review the local state/district data periodically.
10. Add automated tests for authentication, authorization, geolocation, boundaries, and concurrency.
11. Prevent duplicate assignments when multiple officials act simultaneously.
12. Add privacy and retention policies for phone numbers, identity documents, and exact locations.
13. Use a reverse proxy or managed load balancer.
14. Set `PORT`, `MONGODB_URI`, and `REDIS_URL` through deployment configuration.

## Limitations

- GPS precision depends on the device, permissions, signal, and environment.
- Map tiles and geocoding depend on external services.
- A district label does not provide an exact physical location; coordinates do.
- The assignment radius is straight-line distance, not road distance.
- The in-memory store loses data when the process stops.
- The project does not yet include a full automated test suite.

## Summary

NDMS is a location-aware disaster coordination platform. Citizens provide an exact map point, GeoJSON stores the location, geographic utilities validate it, Haversine distance enforces the 3 km volunteer rule, and role-based workflows control verification, dispatch, and assignment.
