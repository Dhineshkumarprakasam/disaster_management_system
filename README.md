# National Disaster Management System

NDMS accepts public disaster reports and SOS requests, classifies report messages as valid or invalid through a Python service, publishes valid reports through Redis, and notifies eligible nearby volunteers. Government staff are not part of the workflow.

The administrator dashboard also records incident and SOS snapshots in ClickHouse, along with submission, review, dispatch, assignment, and volunteer task-status events. It refreshes its metrics and recent records every five seconds. Contact details and account identifiers remain in MongoDB and are excluded from the analytics copy.

## Container and service boundaries

The Node.js API is split into independently deployable domain services behind a stateless API gateway. The existing Python load balancer in `load-balancer/loadbalancer.py` is the public entry point and is the only service that publishes a host port.

| Container/service | Responsibility |
| --- | --- |
| `load-balancer` | Existing Python HTTP load balancer on port 8080; forwards traffic to the gateway service. |
| `api-gateway` | Serves the web UI and routes existing `/api` and `/events` URLs to domain services. It owns no business data. |
| `auth-service` | Login/logout, shared Redis sessions, volunteer applications and admin accounts; it does not perform identity-document verification. |
| `incident-service` | Incident and SOS workflows, verification orchestration, dispatch and volunteer assignment/task updates. |
| `resource-service` | Resource directory and geographic lookup APIs. |
| `notification-service` | Alert/message management and Redis-backed server-sent events. |
| `analytics-service` | Administrator dashboard queries against ClickHouse. |
| `ml-verifier` | Predicts only whether the submitted message is valid or invalid. |
| `mongo`, `redis`, `clickhouse` | Shared stateful infrastructure, not business microservices. MongoDB remains the source of truth; Redis carries sessions/events; ClickHouse stores analytics events. |

Domain APIs currently share the existing MongoDB database and Redis/ClickHouse infrastructure to preserve the application's data and session behavior. Keep collection writes with their owning service; move to per-service databases only alongside an explicit data migration. `incident-service` and `analytics-service` write/query ClickHouse; `auth-service` owns login and volunteer account workflows; `notification-service` owns alert messages and SSE delivery.

To run three stateless gateway replicas locally:

```bash
docker compose up --build --scale api-gateway=3
```

The client connects to `http://localhost:8080`. Internal services and databases are reachable only on the Compose network.

The top navigation shows the gateway container serving the browser. The Python load balancer uses an `ndms_gateway` cookie to keep that browser on the same gateway replica, rotates new browsers across the resolved gateway replica addresses, and moves the browser to another replica if its current one is unavailable.

## Automated workflow

1. A citizen submits an incident with a description, category, contact number, district, state, and exact map coordinates.
2. Node.js sends the citizen's report description as `text` to the Python model's `POST /predict` endpoint.
3. If the model returns `{"valid": true}`, the report is published; `{"valid": false}` leaves it unpublished.
4. The model returns no risk score, reason, identity decision, or duplicate information; the application does not invent those values.
5. Valid reports are saved, department dispatches and the nearest eligible volunteer are selected automatically, and the alert is published to Redis channel `disaster_messages`.
6. A targeted Redis event contains the IDs of all approved volunteers within 3 km. Their portal receives it through `GET /events` and refreshes their task view.
7. Volunteer accounts are created by the account service. The ML model is not used for identity or document checks.

## Administrator disaster dashboard

ClickHouse stores append-only incident and SOS snapshots, including submission, review, dispatch, assignment, and volunteer task-status events. MongoDB remains the source of truth; the analytics copy excludes direct contact and account identifiers. After signing in as an administrator through the existing portal on `/`, the same page shows incident and SOS totals, status counts, severity and district breakdowns, a seven-day trend, and the latest 50 activity events. Legacy requests to `/admin.html` redirect to the main portal.

Docker Compose starts ClickHouse with a persistent `clickhouse_data` volume. Set a strong `CLICKHOUSE_PASSWORD` in the ignored local `.env` file before starting Compose; the default ClickHouse user is `ndms_app`. The incident and analytics services connect with `CLICKHOUSE_URL` and `CLICKHOUSE_DATABASE`. ClickHouse schema initialization retries transient connection failures during startup, and Node.js services have a startup grace period before Compose evaluates their health checks.

## Run

```bash
docker compose up --build
```

The web portal and API are available through the Python load balancer at `http://localhost:8080`. The verifier health endpoint is available only inside the Compose network at `http://ml-verifier:8000/health`.

If a service still fails to start, inspect the actual container error rather than the dependent-service summary:

```bash
docker compose ps -a
docker compose logs --tail 100 incident-service analytics-service
```

## Public API inputs and outputs

All JSON examples omit fields that are optional. Coordinates are required for location-based matching.

### `POST /api/reports`

Input:

```json
{
  "title": "Flash flood near Beltola",
  "category": "Flood",
  "description": "Water is entering ground-floor homes.",
  "severity": "critical",
  "area": "Beltola",
  "district": "Kamrup Metropolitan",
  "state": "Assam",
  "contact": "9876543210",
  "lat": 26.1445,
  "lng": 91.7362
}
```

Output when the model classifies the message as valid:

```json
{
  "ok": true,
  "id": "...",
  "status": "verified",
  "published": true,
  "valid": true
}
```

Invalid messages return HTTP `201` with `status: "rejected"`, `published: false`, and `valid: false`.

### `POST /api/auth/volunteer/apply`

Input:

```json
{
  "username": "asha-volunteer",
  "password": "a-long-password",
  "name": "Asha Das",
  "phone": "9876543210",
  "email": "asha@example.org",
  "district": "Kamrup Metropolitan",
  "state": "Assam",
  "lat": 26.1445,
  "lng": 91.7362,
  "skills": "First Aid, Search and Rescue"
}
```

Output after account creation:

```json
{
  "ok": true,
  "id": "...",
  "message": "Volunteer account created and ready to sign in."
}
```

Volunteer registration does not collect or verify identity-document numbers.

### `POST /api/requests`

Input fields: `type`, `quantity`, `location`, `district`, `state`, `details`, `contact`, `requesterName`, `lat`, and `lng`. `type`, `details`, `contact`, district, state, and exact coordinates are required. The output includes `id` and `autoAssignedVolunteer`; SOS records are matched against approved volunteers using the same 3 km rule.

### `GET /api/incidents/published`

Returns `{ "incidents": [...] }`, containing only records with `status: "verified"` and `published: true`.

### `GET /events`

This is an SSE stream. Redis alert events contain `title`, `body`, `severity`, `sourceReportId`, and timestamps. Nearby volunteer events additionally contain `type: "volunteer_notification"`, `targetVolunteerIds`, `latitude`, and `longitude`.

## Python verifier API

The service lives in `ml-verifier/app.py`, loads `model.pkl` and `encoder.pkl` in its container, and exposes:

- `POST /predict`: accepts `{"text": "..."}` and returns only `{"valid": true}` or `{"valid": false}`.
- `GET /health`: returns `{ "status": "ok" }` only when the model and encoder loaded successfully; otherwise it returns HTTP 503.

Node calls `/predict` through `server/services/mlService.js`, sending the citizen's incident description as `text`. The application uses only the returned boolean; it does not request identity checks, confidence scores, reasons, or duplicate classifications. An unavailable verifier is logged and treated as invalid, so the report is not published.

## Developing better models

For incident classification, collect consented, de-identified historical reports labelled as valid, duplicate, and suspicious. Start with TF-IDF plus logistic regression or a small transformer classifier, measure precision and recall separately for each severity, and keep a human safety review for high-impact false negatives during evaluation. Use a calibrated risk score and choose thresholds from validation data.

## Stack

- Node.js 20 and Express for the gateway and domain APIs.
- Python's standard-library HTTP server for the public load balancer.
- Python 3.12, FastAPI, and Uvicorn for the verifier service.
- MongoDB for reports, users, dispatches, and audit metadata.
- ClickHouse for append-only incident analytics and dashboard queries.
- Redis for sessions, alert publication, and SSE fan-out.
- Leaflet and OpenStreetMap for exact location capture.
