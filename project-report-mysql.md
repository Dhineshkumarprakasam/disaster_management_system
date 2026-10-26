# National Disaster Management System
## Project Report - MySQL Edition

## 1. Executive Summary

The National Disaster Management System (NDMS) is a full-stack emergency coordination platform. Citizens can report incidents and request urgent assistance. Government staff verify reports, publish alerts, dispatch departments, review volunteers, and assign response workers. Approved volunteers receive tasks and update task status. Public users can view verified incidents, active alerts, and nearby emergency resources.

This edition replaces MongoDB with MySQL 8.0+ for persistent storage. Redis remains responsible for sessions, cache fallback, pub/sub notifications, and Server-Sent Event delivery. The application behavior remains the same; only the persistence adapter and database operations change.

## 2. Objectives

- Centralize disaster reports and SOS requests.
- Support district and state-scoped government operations.
- Match approved volunteers within a 3 km radius.
- Publish verified incidents as public alerts.
- Dispatch appropriate emergency departments automatically or manually.
- Provide searchable hospitals, shelters, rescue centers, and relief camps.
- Preserve audit timestamps, reviewer identity, assignment details, and dispatch history.

## 3. Technology Stack

### Client

- HTML5, CSS3, JavaScript, jQuery, and Bootstrap assets.
- Leaflet maps with OpenStreetMap tiles.
- Nominatim reverse geocoding and pincode lookup.
- Server-Sent Events for live alert delivery.

### Server

- Node.js 20 and Express.js.
- Cookie Parser for request cookies.
- UUID for session token generation.
- bcryptjs for password hashing.
- REST endpoints under `/api`.

### Data and operations

- MySQL 8.0+ for durable relational data.
- Redis 7 for sessions and disaster-message pub/sub.
- Docker and Docker Compose for local deployment.
- India state and district data remains a JSON utility dataset, not application transaction data.

## 4. System Architecture

```text
Citizen / Government Staff / Volunteer Browser
                 |
                 | REST + SSE
                 v
         Node.js / Express server
                 |
       Routes -> Controllers -> Services
                 |       |          |
                 |       |          +--> Redis sessions and pub/sub
                 |       |
                 |       +--> MySQL models / repositories
                 |
                 +--> Static public web application
```

The MySQL version should use a repository or model layer for SQL operations. Controllers should not contain raw database-specific logic. This keeps the existing workflow controllers recognizable while replacing MongoDB collection calls with parameterized SQL queries and transactions.

## 5. Functional Modules

### Public portal

- View active messages and verified incident reports.
- Search nearby emergency resources.
- Submit a disaster report with exact map coordinates.
- Submit an SOS/resource request with exact map coordinates.
- Apply as a volunteer and check application status.
- Log in and receive role-specific views.

### Government dashboard

- Review, verify, or reject incident reports.
- Publish verified incidents.
- Dispatch police, fire, NDRF, medical, coast guard, and other departments.
- View and update dispatch records.
- Review and approve or reject volunteer applications.
- Search approved volunteers by geographic area and skill.
- Assign volunteers to verified incidents and SOS requests.
- Manage official officers.

### Volunteer dashboard

- View assigned incidents and SOS requests.
- Update task status through `assigned`, `en route`, and `fulfilled`.
- Receive the assigned incident/request details and contact information.

### Authentication

There are two account tables in the source design: `admins` for super administrators and `users` for government staff and volunteers. Passwords are stored only as bcrypt hashes. Redis stores session tokens with a time-to-live; MySQL stores account and workflow records, not active session tokens.

## 6. Relational Data Model

The schema contains nine logical MongoDB collection replacements and four child tables for arrays:

- `admins`: super administrator accounts.
- `users`: government staff and volunteer accounts.
- `user_skills`: normalized volunteer skills.
- `official_officers`: emergency department contacts.
- `resources`: hospitals, shelters, rescue centers, and camps.
- `resource_phones`: normalized resource phone lists.
- `messages`: public alerts and manually created messages.
- `disaster_reports`: citizen incident reports and review state.
- `disaster_report_departments`: departments associated with an incident.
- `resource_requests`: SOS and emergency resource requests.
- `volunteer_applications`: volunteer application snapshots and review state.
- `volunteer_application_skills`: normalized application skills.
- `department_dispatches`: dispatch history for incident response.

The complete executable DDL and field-level mapping are in [schema.md](schema.md).

## 7. Important Relationships

```text
users 1 ---- many user_skills
users 1 ---- many volunteer_applications
volunteer_applications 1 ---- many volunteer_application_skills
resources 1 ---- many resource_phones
disaster_reports 1 ---- many disaster_report_departments
disaster_reports 1 ---- many department_dispatches
```

Assignments use `assigned_volunteer_id` on both `disaster_reports` and `resource_requests`. The related volunteer's name, phone, and skills are also copied into snapshot columns so old records remain useful if the volunteer profile changes.

Some actor fields can refer to either an admin or a user because the original MongoDB code accepts both session types. These fields are retained as `VARCHAR(64)` migration IDs: `added_by`, `author_id`, `verified_by`, `reviewed_by`, `dispatched_by`, `reporter_id`, and `requester_id`. The migration should validate these IDs against both account tables.

## 8. Core Workflows

### Incident verification

1. A citizen submits an incident with title, description, category, severity, district, state, address, and a map point.
2. The report is stored with `status = 'pending'` and `published = false`.
3. Authorized government staff or an admin changes it to `verified` or `rejected`.
4. A verified report becomes published, creates a public message, triggers department dispatch rules, and attempts volunteer matching.
5. A rejected report remains in the database for review history.

### SOS assignment

1. A citizen submits request type, quantity, location/address, district, state, details, and contact information.
2. The request starts as `pending`.
3. The matching engine filters for approved, available volunteers in the same geographic scope.
4. It calculates proximity and excludes volunteers outside the 3 km assignment radius.
5. A successful match changes the request to `assigned` and records the volunteer snapshot.

### Department dispatch

Flood and water reports dispatch NDRF and Fire & Rescue. Fire reports dispatch Fire & Rescue and Police. Medical or hazardous reports dispatch ambulance/medical response. Cyclone or storm reports dispatch NDRF and Coast Guard. Other verified incidents dispatch NDRF by default. All dispatches are independent rows, so one incident can have multiple teams and a complete dispatch history.

### Resource search

Resources keep a spatial point with SRID 4326. Use `ST_Distance_Sphere()` for radius filtering and order by distance. The existing default search radius is 5,000 meters.

## 9. MySQL Implementation Requirements

- Use MySQL 8.0+ with spatial reference system 4326.
- Use parameterized queries for every request value.
- Convert GeoJSON `[longitude, latitude]` to `POINT(longitude, latitude)`.
- Wrap multi-table workflow operations in transactions. For example, verification, dispatch creation, report department updates, and alert creation should either all succeed or all roll back.
- Use `SELECT ... FOR UPDATE` when assigning a volunteer to prevent two simultaneous requests from selecting the same workload state.
- Replace MongoDB projections with explicit SQL column lists so password and identity-proof fields are never returned accidentally.
- Keep timestamps in UTC and serialize them as ISO 8601 values in API responses.
- Use spatial indexes for resources, reports, requests, and volunteer locations.

## 10. Migration Plan

1. Provision MySQL and run [schema.md](schema.md).
2. Export each MongoDB collection, preserving the original `_id` as the new `id`.
3. Convert BSON dates to UTC `DATETIME(3)` values.
4. Convert GeoJSON points to SRID 4326 MySQL points.
5. Split `skills`, `phones`, and `dispatchedDepts` arrays into their child tables.
6. Load parent rows before child rows and dispatch rows.
7. Check duplicate usernames and missing references.
8. Compare document counts with table counts.
9. Test public reads, authentication, report review, dispatch, volunteer assignment, resource search, and task status changes.
10. Switch the application configuration from `MONGODB_URI` to MySQL connection settings and remove MongoDB from the production Compose deployment after a rollback backup is confirmed.

## 11. Deployment Changes

The existing deployment contains `app`, `mongo`, and `redis`. The MySQL deployment should contain `app`, `mysql`, and `redis`:

- Add `mysql:8.0` with a persistent volume.
- Provide `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, and `MYSQL_ROOT_PASSWORD` through environment configuration or secrets.
- Provide the app with `MYSQL_HOST=mysql`, `MYSQL_PORT=3306`, `MYSQL_DATABASE=disaster_management`, `MYSQL_USER`, and `MYSQL_PASSWORD`.
- Add a health check and make the app wait for MySQL readiness before running migrations or starting database-dependent routes.
- Keep Redis persistence and the existing SSE behavior.
- Do not place passwords in source control.

## 12. Security and Data Protection

- Continue hashing passwords with bcryptjs; never migrate plaintext passwords.
- Mask or exclude `id_proof_number` from volunteer directory responses.
- Use secure, HTTP-only, same-site session cookies in production.
- Apply authorization checks at the controller/service boundary, not only in the browser.
- Enforce district and state scope for government users in SQL `WHERE` clauses.
- Validate latitude and longitude ranges before creating spatial points.
- Use foreign keys for parent-child records and transactions for workflow changes.
- Log review, assignment, and dispatch actors without logging passwords or identity documents.
- Back up MySQL and test restoration before the production cutover.

## 13. Testing and Acceptance Criteria

The MySQL replacement is ready when:

- All nine source MongoDB collections have been migrated with no unexplained count differences.
- Every existing seed record is readable through the corresponding API.
- Users can log in, log out, and retrieve the current session user.
- Public messages return only active records where appropriate.
- Reports can be verified/rejected and verified reports create alerts and dispatches.
- SOS and incident assignments enforce approval, geographic scope, and the 3 km radius.
- Volunteer task status updates affect only the assigned volunteer's task.
- Nearby-resource searches return correct results ordered by distance.
- Duplicate usernames are rejected by the unique constraint.
- Restarting the app does not lose persistent records or require the in-memory fallback.

## 14. Conclusion

MySQL is a suitable replacement for the NDMS persistence layer because the application has clear entities, workflow states, ownership boundaries, and audit timestamps. Normalized child tables preserve MongoDB arrays without sacrificing queryability, while MySQL spatial columns retain the map and radius functionality. Redis continues to handle ephemeral sessions and real-time delivery, leaving MySQL responsible for reliable disaster-management records and history.
