# Disaster Management System - MySQL Schema

This schema represents only the data currently stored or used by the application. It converts the MongoDB documents into MySQL tables without inventing database entities for data that is currently stored as values.

## ER Diagram Notation

- **Rectangle**: entity/table.
- **Oval**: attribute.
- **Underlined oval**: primary key.
- **Dashed oval**: foreign key.
- **Double oval**: multivalued attribute.
- **Diamond**: relationship.
- `1:N`: one-to-many, `0..1`: optional one, `0..N`: optional many.

## Important Modeling Decision

`state` and `district` are attributes, not separate entities, because the application currently stores values such as `Assam` and `Kamrup` directly in its MongoDB documents. The file `utils/india-states-districts.json` is a validation/reference file, not a MongoDB collection.

Likewise, `department` is stored as text and `skills` are stored as arrays in MongoDB. In MySQL, the repeating skill and department values are placed in child tables, but there is no separate `SKILL` or `DEPARTMENT` entity because those are not stored as independent records by the application.

## SQL DDL

```sql
CREATE DATABASE IF NOT EXISTS disaster_management
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE disaster_management;

-- Common account data. Replaces the identity fields in admins and users.
CREATE TABLE accounts (
    id              VARCHAR(64) PRIMARY KEY,
    username        VARCHAR(100) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    phone           VARCHAR(40) NOT NULL,
    email           VARCHAR(255) NULL,
    status          ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'approved',
    state           VARCHAR(150) NULL,
    district        VARCHAR(150) NULL,
    reviewed_by     VARCHAR(64) NULL,
    reviewed_at     DATETIME(3) NULL,
    created_at      DATETIME(3) NOT NULL,
    CONSTRAINT fk_account_reviewer FOREIGN KEY (reviewed_by) REFERENCES accounts(id),
    INDEX ix_accounts_status (status),
    INDEX ix_accounts_geo (state, district)
) ENGINE=InnoDB;

-- Admin subtype. Source collection: admins.
CREATE TABLE admins (
    account_id      VARCHAR(64) PRIMARY KEY,
    CONSTRAINT fk_admin_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Government staff subtype. Source collection: users where role = government.
CREATE TABLE government_staff (
    account_id      VARCHAR(64) PRIMARY KEY,
    department      VARCHAR(255) NULL,
    CONSTRAINT fk_staff_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Volunteer subtype. Source collection: users where role = volunteer.
CREATE TABLE volunteers (
    account_id       VARCHAR(64) PRIMARY KEY,
    availability     VARCHAR(100) NULL,
    blood_group      VARCHAR(10) NULL,
    id_proof_type    VARCHAR(60) NULL,
    id_proof_number  VARCHAR(120) NULL,
    location_text    VARCHAR(255) NULL,
    location_point   POINT SRID 4326 NULL,
    CONSTRAINT fk_volunteer_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    SPATIAL INDEX ix_volunteer_location (location_point),
    INDEX ix_volunteer_availability (availability)
) ENGINE=InnoDB;

-- Normalizes the skills[] array from users and volunteer applications.
CREATE TABLE volunteer_skills (
    volunteer_id    VARCHAR(64) NOT NULL,
    skill           VARCHAR(150) NOT NULL,
    PRIMARY KEY (volunteer_id, skill),
    CONSTRAINT fk_volunteer_skill_volunteer FOREIGN KEY (volunteer_id) REFERENCES volunteers(account_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Source collection: officialOfficers.
CREATE TABLE official_officers (
    id              VARCHAR(64) PRIMARY KEY,
    name            VARCHAR(200) NOT NULL,
    department      VARCHAR(255) NOT NULL,
    designation     VARCHAR(200) NOT NULL,
    phone           VARCHAR(40) NOT NULL,
    state           VARCHAR(150) NULL,
    district        VARCHAR(150) NULL,
    badge_no        VARCHAR(100) NULL,
    added_by        VARCHAR(64) NULL,
    created_at      DATETIME(3) NOT NULL,
    CONSTRAINT fk_officer_added_by FOREIGN KEY (added_by) REFERENCES accounts(id),
    INDEX ix_officers_geo (state, district),
    INDEX ix_officers_created (created_at)
) ENGINE=InnoDB;

-- Source collection: resources.
CREATE TABLE resources (
    id              VARCHAR(64) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    type            VARCHAR(60) NOT NULL,
    address         TEXT NULL,
    state           VARCHAR(150) NULL,
    district        VARCHAR(150) NULL,
    capacity        INT NULL,
    available_beds  INT NULL,
    location_point  POINT SRID 4326 NOT NULL,
    created_at      DATETIME(3) NOT NULL,
    CONSTRAINT chk_resource_capacity CHECK (capacity IS NULL OR capacity >= 0),
    CONSTRAINT chk_resource_beds CHECK (available_beds IS NULL OR available_beds >= 0),
    INDEX ix_resources_type_geo (type, state, district),
    SPATIAL INDEX ix_resources_location (location_point)
) ENGINE=InnoDB;

-- Normalizes the phones[] array from resources.
CREATE TABLE resource_phones (
    resource_id     VARCHAR(64) NOT NULL,
    phone           VARCHAR(60) NOT NULL,
    display_order   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (resource_id, phone),
    CONSTRAINT fk_resource_phone_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Source collection: disasterReports.
CREATE TABLE disaster_reports (
    id              VARCHAR(64) PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    category        VARCHAR(80) NOT NULL,
    description     TEXT NOT NULL,
    severity        VARCHAR(30) NOT NULL,
    area            VARCHAR(255) NULL,
    state           VARCHAR(150) NOT NULL,
    district        VARCHAR(150) NOT NULL,
    address         TEXT NULL,
    location_point  POINT SRID 4326 NOT NULL,
    contact         VARCHAR(40) NULL,
    reporter_id     VARCHAR(64) NULL,
    status          ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
    published       BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by     VARCHAR(64) NULL,
    verified_at     DATETIME(3) NULL,
    created_at      DATETIME(3) NOT NULL,
    updated_at      DATETIME(3) NOT NULL,
    CONSTRAINT fk_report_reporter FOREIGN KEY (reporter_id) REFERENCES accounts(id),
    CONSTRAINT fk_report_verifier FOREIGN KEY (verified_by) REFERENCES accounts(id),
    INDEX ix_reports_status_created (status, created_at),
    INDEX ix_reports_published (published, status),
    INDEX ix_reports_geo (state, district),
    SPATIAL INDEX ix_reports_location (location_point)
) ENGINE=InnoDB;

-- Normalizes the dispatchedDepts[] array from disasterReports.
CREATE TABLE disaster_report_departments (
    report_id       VARCHAR(64) NOT NULL,
    department      VARCHAR(255) NOT NULL,
    PRIMARY KEY (report_id, department),
    CONSTRAINT fk_report_department_report FOREIGN KEY (report_id) REFERENCES disaster_reports(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Current assignment relationship for a disaster report.
CREATE TABLE incident_volunteer_assignments (
    report_id       VARCHAR(64) PRIMARY KEY,
    volunteer_id    VARCHAR(64) NOT NULL,
    auto_assigned   BOOLEAN NOT NULL DEFAULT FALSE,
    volunteer_status ENUM('assigned', 'en route', 'fulfilled') NULL,
    assigned_at     DATETIME(3) NOT NULL,
    CONSTRAINT fk_incident_assignment_report FOREIGN KEY (report_id) REFERENCES disaster_reports(id) ON DELETE CASCADE,
    CONSTRAINT fk_incident_assignment_volunteer FOREIGN KEY (volunteer_id) REFERENCES volunteers(account_id),
    INDEX ix_incident_assignment_volunteer (volunteer_id)
) ENGINE=InnoDB;

-- Source collection: messages.
CREATE TABLE messages (
    id                  VARCHAR(64) PRIMARY KEY,
    title               VARCHAR(255) NOT NULL,
    body                TEXT NOT NULL,
    severity            VARCHAR(30) NOT NULL,
    area                VARCHAR(255) NULL,
    state               VARCHAR(150) NULL,
    district            VARCHAR(150) NULL,
    active              BOOLEAN NOT NULL DEFAULT FALSE,
    source_report_id    VARCHAR(64) NULL,
    author_account_id   VARCHAR(64) NULL,
    created_at          DATETIME(3) NOT NULL,
    updated_at          DATETIME(3) NULL,
    CONSTRAINT fk_message_source_report FOREIGN KEY (source_report_id) REFERENCES disaster_reports(id),
    CONSTRAINT fk_message_author FOREIGN KEY (author_account_id) REFERENCES accounts(id),
    INDEX ix_messages_active_created (active, created_at),
    INDEX ix_messages_geo (state, district)
) ENGINE=InnoDB;

-- Source collection: resourceRequests.
CREATE TABLE resource_requests (
    id              VARCHAR(64) PRIMARY KEY,
    type            VARCHAR(60) NOT NULL,
    quantity        VARCHAR(255) NULL,
    location_text   VARCHAR(255) NULL,
    address         TEXT NULL,
    state           VARCHAR(150) NOT NULL,
    district        VARCHAR(150) NOT NULL,
    location_point  POINT SRID 4326 NOT NULL,
    details         TEXT NOT NULL,
    contact         VARCHAR(40) NOT NULL,
    requester_name  VARCHAR(200) NOT NULL,
    requester_id    VARCHAR(64) NULL,
    status          ENUM('pending', 'assigned', 'en route', 'fulfilled') NOT NULL DEFAULT 'pending',
    created_at      DATETIME(3) NOT NULL,
    updated_at      DATETIME(3) NOT NULL,
    CONSTRAINT fk_requester_account FOREIGN KEY (requester_id) REFERENCES accounts(id),
    INDEX ix_requests_status_created (status, created_at),
    INDEX ix_requests_geo (state, district),
    SPATIAL INDEX ix_requests_location (location_point)
) ENGINE=InnoDB;

-- Current assignment relationship for an SOS request.
CREATE TABLE request_volunteer_assignments (
    request_id      VARCHAR(64) PRIMARY KEY,
    volunteer_id    VARCHAR(64) NOT NULL,
    auto_assigned   BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_at     DATETIME(3) NOT NULL,
    CONSTRAINT fk_request_assignment_request FOREIGN KEY (request_id) REFERENCES resource_requests(id) ON DELETE CASCADE,
    CONSTRAINT fk_request_assignment_volunteer FOREIGN KEY (volunteer_id) REFERENCES volunteers(account_id),
    INDEX ix_request_assignment_volunteer (volunteer_id)
) ENGINE=InnoDB;

-- Source collection: volunteerApplications.
CREATE TABLE volunteer_applications (
    id              VARCHAR(64) PRIMARY KEY,
    volunteer_id    VARCHAR(64) NOT NULL,
    status          ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    reviewed_by     VARCHAR(64) NULL,
    reviewed_at     DATETIME(3) NULL,
    created_at      DATETIME(3) NOT NULL,
    CONSTRAINT fk_application_volunteer FOREIGN KEY (volunteer_id) REFERENCES volunteers(account_id),
    CONSTRAINT fk_application_reviewer FOREIGN KEY (reviewed_by) REFERENCES accounts(id),
    INDEX ix_applications_status_created (status, created_at)
) ENGINE=InnoDB;

-- Normalizes the skills[] array from volunteerApplications.
CREATE TABLE volunteer_application_skills (
    application_id  VARCHAR(64) NOT NULL,
    skill           VARCHAR(150) NOT NULL,
    PRIMARY KEY (application_id, skill),
    CONSTRAINT fk_application_skill_application FOREIGN KEY (application_id) REFERENCES volunteer_applications(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Source collection: departmentDispatches.
CREATE TABLE department_dispatches (
    id                  VARCHAR(64) PRIMARY KEY,
    incident_id         VARCHAR(64) NOT NULL,
    department          VARCHAR(255) NOT NULL,
    officer_in_charge  VARCHAR(255) NOT NULL,
    team_size           INT NOT NULL DEFAULT 10,
    equipment           TEXT NULL,
    status              VARCHAR(80) NOT NULL,
    auto_dispatched     BOOLEAN NOT NULL DEFAULT FALSE,
    dispatched_by       VARCHAR(64) NULL,
    dispatched_at       DATETIME(3) NOT NULL,
    CONSTRAINT fk_dispatch_incident FOREIGN KEY (incident_id) REFERENCES disaster_reports(id) ON DELETE CASCADE,
    CONSTRAINT fk_dispatch_account FOREIGN KEY (dispatched_by) REFERENCES accounts(id),
    CONSTRAINT chk_dispatch_team_size CHECK (team_size >= 0),
    INDEX ix_dispatch_incident (incident_id),
    INDEX ix_dispatch_date (dispatched_at)
) ENGINE=InnoDB;
```

## Conceptual Chen ER Diagram

This is the section to use for the university ER diagram. Draw each heading as a rectangle and each bullet as an oval. Underline PK attributes and use dashed ovals for FKs. Draw the attributes marked **multivalued** as double ovals. Do not draw the SQL helper tables as separate conceptual entities; they are implementation tables used to store multivalued attributes in MySQL.

### ACCOUNT

- **PK:** `id`
- `username`, `password_hash`, `name`, `phone`, `email`
- `status`, `state`, `district`
- **FK:** `reviewed_by`
- `reviewed_at`, `created_at`

### ADMIN

- **PK/FK:** `account_id`

### GOVERNMENT_STAFF

- **PK/FK:** `account_id`
- `department`

### VOLUNTEER

- **PK/FK:** `account_id`
- `availability`, `blood_group`, `id_proof_type`, `id_proof_number`
- `location_text`, `location_point`
- **Multivalued:** `skills`

### OFFICIAL_OFFICER

- **PK:** `id`
- `name`, `department`, `designation`, `phone`, `state`, `district`, `badge_no`
- **FK:** `added_by`
- `created_at`

### RESOURCE

- **PK:** `id`
- `name`, `type`, `address`, `state`, `district`, `capacity`, `available_beds`
- `location_point`, `created_at`
- **Multivalued:** `phones`

### DISASTER_REPORT

- **PK:** `id`
- `title`, `category`, `description`, `severity`, `area`, `state`, `district`
- `address`, `location_point`, `contact`
- **FK:** `reporter_id`, `verified_by`
- `status`, `published`, `verified_at`, `created_at`, `updated_at`
- **Multivalued:** `dispatchedDepts`

### MESSAGE

- **PK:** `id`
- `title`, `body`, `severity`, `area`, `state`, `district`, `active`
- **FK:** `source_report_id`, `author_account_id`
- `created_at`, `updated_at`

### RESOURCE_REQUEST

- **PK:** `id`
- `type`, `quantity`, `location_text`, `address`, `state`, `district`
- `location_point`, `details`, `contact`, `requester_name`
- **FK:** `requester_id`
- `status`, `created_at`, `updated_at`

### VOLUNTEER_APPLICATION

- **PK:** `id`
- **FK:** `volunteer_id`, `reviewed_by`
- `status`, `reviewed_at`, `created_at`

### DEPARTMENT_DISPATCH

- **PK:** `id`
- **FK:** `incident_id`, `dispatched_by`
- `department`, `officer_in_charge`, `team_size`, `equipment`, `status`
- `auto_dispatched`, `dispatched_at`

## Relationships and Cardinality

1. `ACCOUNT` **specializes as** `ADMIN`: `ACCOUNT 1 : 0..1 ADMIN`.
2. `ACCOUNT` **specializes as** `GOVERNMENT_STAFF`: `ACCOUNT 1 : 0..1 GOVERNMENT_STAFF`.
3. `ACCOUNT` **specializes as** `VOLUNTEER`: `ACCOUNT 1 : 0..1 VOLUNTEER`.
4. `ACCOUNT` **adds** `OFFICIAL_OFFICER`: `ACCOUNT 1 : 0..N OFFICIAL_OFFICER`.
5. `ACCOUNT` **reports** `DISASTER_REPORT`: `ACCOUNT 1 : 0..N DISASTER_REPORT`; reporter is optional for anonymous reports.
6. `ACCOUNT` **verifies** `DISASTER_REPORT`: `ACCOUNT 1 : 0..N DISASTER_REPORT`; verifier is optional before review.
7. `VOLUNTEER` **is assigned** `DISASTER_REPORT`: `VOLUNTEER 1 : 0..N DISASTER_REPORT`; each report has zero or one assigned volunteer.
8. `DISASTER_REPORT` **generates** `MESSAGE`: `DISASTER_REPORT 1 : 0..N MESSAGE`; source report is optional for a message.
9. `ACCOUNT` **authors** `MESSAGE`: `ACCOUNT 1 : 0..N MESSAGE`; author is optional for automated messages.
10. `ACCOUNT` **submits** `RESOURCE_REQUEST`: `ACCOUNT 1 : 0..N RESOURCE_REQUEST`; requester is optional for anonymous requests.
11. `VOLUNTEER` **is assigned** `RESOURCE_REQUEST`: `VOLUNTEER 1 : 0..N RESOURCE_REQUEST`; each request has zero or one assigned volunteer.
12. `VOLUNTEER` **submits** `VOLUNTEER_APPLICATION`: `VOLUNTEER 1 : 0..N VOLUNTEER_APPLICATION`.
13. `ACCOUNT` **reviews** `VOLUNTEER_APPLICATION`: `ACCOUNT 1 : 0..N`; reviewer is optional before review.
14. `DISASTER_REPORT` **receives** `DEPARTMENT_DISPATCH`: `DISASTER_REPORT 1 : 0..N DEPARTMENT_DISPATCH`.
15. `ACCOUNT` **creates** `DEPARTMENT_DISPATCH`: `ACCOUNT 1 : 0..N`; dispatcher is optional for automatic dispatch.

### Multivalued Attributes in the Chen Diagram

Draw these as double ovals connected directly to their owning entity. They are not rectangles or diamonds in the conceptual diagram:

- `VOLUNTEER` has multivalued attribute `skills`.
- `RESOURCE` has multivalued attribute `phones`.
- `DISASTER_REPORT` has multivalued attribute `dispatchedDepts`.
- `VOLUNTEER_APPLICATION` has multivalued attribute `skills`.

## Existing MongoDB Collection Mapping

| MongoDB collection | MySQL destination |
| --- | --- |
| `admins` | `accounts` + `admins` |
| `users` | `accounts` + `government_staff` or `volunteers` + `volunteer_skills` |
| `officialOfficers` | `official_officers` |
| `resources` | `resources` + `resource_phones` |
| `messages` | `messages` |
| `disasterReports` | `disaster_reports` + `disaster_report_departments` + `incident_volunteer_assignments` |
| `resourceRequests` | `resource_requests` + `request_volunteer_assignments` |
| `volunteerApplications` | `volunteer_applications` + `volunteer_application_skills` |
| `departmentDispatches` | `department_dispatches` |
```

## Migration Notes

- Copy MongoDB `_id` values into the `VARCHAR(64)` IDs.
- Copy `state` and `district` strings directly into the corresponding attributes.
- Do not create state or district rows because they are not MongoDB entities in this application.
- Convert GeoJSON coordinates `[longitude, latitude]` into `ST_SRID(POINT(longitude, latitude), 4326)`.
- Split `skills`, `phones`, and `dispatchedDepts` arrays into their child tables.
- Create the account row and its subtype row in one transaction.
- Use `ST_Distance_Sphere()` for the existing 5 km resource search and 3 km volunteer matching rule.
