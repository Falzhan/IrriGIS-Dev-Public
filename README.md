# IrriGIS — Irrigation Geographic Information System

<div align="center">

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Mobile%20%7C%20Desktop-blueviolet.svg)
[![Backend](https://img.shields.io/badge/Backend-Express.js-green.svg)](IrriGIS_Backend)
[![Mobile](https://img.shields.io/badge/Mobile-React%20Native%20%2B%20Expo-orange.svg)](IrriGIS_App)
[![Admin](https://img.shields.io/badge/Admin-Electron%20%7C%20React-blue.svg)](IrriGIS_Electron)

**A full-stack irrigation management system with GIS capabilities for monitoring and reporting canal infrastructure issues. Built for the National Irrigation Administration (NIA) — Sarangani-General Santos-South Cotabato Irrigation Management Office (SCSIMO).**

</div>

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Who Is This For?](#who-is-this-for)
- [Project Structure](#project-structure)
- [Features](#features)
  - [Backend (IrriGIS_Backend)](#backend-irrigis_backend)
  - [Mobile App (IrriGIS_App)](#mobile-app-irrigis_app)
  - [Admin Desktop App (IrriGIS_Electron)](#admin-desktop-app-irrigis_electron)
- [Tech Stack](#tech-stack)
- [Environments](#environments)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Mobile App Setup](#mobile-app-setup)
  - [Admin Desktop Setup](#admin-desktop-setup)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [User Roles & Permissions](#user-roles--permissions)
- [Deployment](#deployment)

---

## Overview

IrriGIS is a comprehensive Geographic Information System-based irrigation canal monitoring and reporting platform designed for the NIA and Irrigator Associations (IAs) in General Santos City and surrounding areas. The system streamlines the lifecycle of field report submissions — from photo capture and geo-tagging on mobile, through ticket-based administrative workflow, to live GIS visualization of canal conditions.

Three applications share a single REST API backed by a **PostgreSQL + PostGIS** database:

| App | Purpose | Users |
|-----|---------|-------|
| **IrriGIS_App** | Submit field reports, track personal tickets | NIA Field Officers, IA Members |
| **IrriGIS_Electron** | Admin dashboard, GIS management, ticket workflow | NIA Admins, IA Admins |
| **IrriGIS_Backend** | REST API, authentication, spatial data | — |

---

## System Architecture

```
┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│    IrriGIS_App        │     │  IrriGIS_Electron     │     │   IrriGIS_Backend     │
│  (React Native/Expo) │────▶│      (Electron)      │────▶│    (Express.js)      │
│                      │     │                      │     │                      │
│ - Geo-Camera         │     │ - GIS Map             │     │ - REST API           │
│ - Report Form        │     │ - Ticket Mgmt         │     │ - JWT Auth           │
│ - Tickets Tracking   │     │ - GIS Feature CRUD    │     │ - PostGIS Queries     │
│ - Notifications      │     │ - User Management     │     │ - File Uploads        │
│ - Offline Sync       │     │ - Offline Cache       │     │ - Real-Time Events    │
└──────────────────────┘     └──────────────────────┘     └──────────────────────┘
                                                              │
                                                              ▼
                                                  ┌────────────────────────┐
                                                  │  PostgreSQL + PostGIS  │
                                                  │   (Render / Supabase)  │
                                                  └────────────────────────┘
```

**Production backend:** `https://irrigis-backend.onrender.com/api`  
**Database:** Supabase PostgreSQL with the PostGIS extension

---

## Who Is This For?

IrriGIS serves two primary stakeholder groups operating within the SCSIMO (Sarangani-General Santos-South Cotabato Irrigation Management Office) service area:

- **NIA Personnel** — National Irrigation Administration field officers submit field reports; NIA administrators manage the full ticket lifecycle, GIS layers, and user accounts via the desktop admin app.
- **Irrigator Association (IA) Members** — Members of registered IAs submit inspection and maintenance reports via the mobile app. IA administrators register and manage their members through the desktop admin app using IA-scoped access controls.

---

## Project Structure

```
IrriGIS-Dev Public/
├── IrriGIS_Backend/          # Express.js REST API
├── IrriGIS_App/              # React Native mobile app (Expo)
├── IrriGIS_Electron/         # Electron admin desktop app
├── IrriGIS_Admin/            # Legacy web admin (archived)
├── IrriGIS_Docs/             # Project documentation
│   └── USER_MANUAL.md
└── README.md                 # This file
```

---

## Features

### Backend (IrriGIS_Backend)

RESTful API running on **Render**, backed by **Supabase PostgreSQL (PostGIS)**. Key capabilities:

| Capability | Details |
|------------|---------|
| JWT Authentication | bcrypt password hashing, single-session enforcement (auto-logout on new login) |
| OAuth Support | Google & Facebook via Passport.js with env-based callback URLs |
| Role-Based Access Control | nia_admin, nia_field_officer, ia_admin, ia_member |
| Spatial Queries | PostGIS-powered GeoJSON outputs for reports, canal lines, IA polygons |
| Multi-Image Upload | Up to 5 images per report (Multer → `public/uploads/`); profile images → `public/users/` |
| Auto-Ticket Creation | Issue-category reports automatically generate a ticket; non-issue reports (inspection, maintenance, cleaning) have no ticket |
| Report Grouping (1:N) | One ticket anchors N reports via `report_tickets.report_id` (origin) + `reports.ticket_id` (grouping). Auto-grouping by same day, same category, same `gis_feature_id`, and configurable proximity threshold |
| Ticket Workflow | Sub-statuses (customizable), comments, assignment, `acknowledged_at` / `resolved_at` timestamps |
| Urgency Calculation | Average of `water_level` + `silt_level` + `debris_level` (1–5 scale); Critical ≥ 4.0, Moderate ≥ 3.0, Low < 3.0 |
| Report Presets | Predefined templates (Normal / Cleaning / Severe) selectable during report creation |
| Real-Time Notifications | Triggers: new report, ticket status change, sub-status change, new comment |
| Audit Logging | Every CRUD operation logged with user, action, and timestamp |
| IA Admin Registration | Self-registration via `/register`; NIA emails auto-activated; IA selection mandatory |
| Scalable Architecture | Supports NIA-wide deployments with RIS-level and IA-level data scoping |

**Core Models:**

| Model | Description |
|-------|-------------|
| `users` | Accounts with roles (nia_admin, nia_field_officer, ia_admin, ia_member) and session_token for single-session enforcement |
| `reports` | Field reports: water/silt/debris levels, category, GPS location (GeoJSON), `location_name`, `ticket_id`, `is_valid`, `invalid_reason` |
| `report_images` | Photo attachments (1–5 per report) |
| `report_tickets` | Workflow tickets with status, assignment, comments, `report_id` (origin), `workflow_steps` |
| `ticket_settings` | Configurable ticket grouping: `proximity_threshold_meters`, `auto_group_enabled` |
| `ticket_sub_statuses` | Customizable workflow sub-states with name, slug, color, display order |
| `report_presets` | Inspection/maintenance templates with category, level defaults, icon |
| `gis_features` | Canal infrastructure lines with `MultiLineString` geometry and feature type classification |
| `irrigator_associations` | IA entities with `MultiPolygon` service area geometry and RIS association |
| `river_irrigation_systems` | River Irrigation System master data |
| `notifications` | Per-user notifications (new report, ticket update, comment, sub-status change) |
| `audit_logs` | Full audit trail of all CRUD operations |

---

### Mobile App (IrriGIS_App)

React Native app built with **Expo**. Currently at **v1.2.6**.

| Feature | Description |
|---------|-------------|
| **Auth** | Email/password login + Google/Facebook OAuth + IA address assignment during registration (NIA emails rejected from self-registration) |
| **Geo-Camera** | Photo capture with GPS tagging; reverse geocoding via Nominatim API |
| **Report Form** | 1–5 scale ratings for Water Level, Silt Level, Debris Level; Category selection (Inspection, Maintenance, Cleaning, Issue, Other); Remarks field; location name auto-filled |
| **Presets** | Normal (all 3s), Cleaning (silt/debris = 1), Severe (all 5s) |
| **Offline Reports & Draft System (v1.2.6)** | Photo taken → draft auto-saved to local `pending_reports.json`. Submit while offline → draft persists, displayed as grayed-out "DRAFT" cards in Me tab, auto-synced when network restores. Submit while online → draft deleted, report sent to backend. Crash/exiting mid-form → draft survives restart and appears in Me tab. Trash icon per draft card to permanently delete. Tap draft from Me tab → Camera page rehydrates all form state |
| **Personal Dashboard** | Welcome message, personal stats (Your Pending / In Progress / Closed), quick actions, recent reports list, pull-to-refresh |
| **Integrated GIS Map** | Leaflet-based map showing ONLY "In Progress" reports with clickable markers and legend; geo-fenced by IA assignment |
| **Ticket Tracking** | Desktop ticket table supporting Acknowledge, In Progress, Close, Reopen, Edit Report, Reject actions; comment functionality for In-Progress tickets |
| **Notifications** | Bell icon with unread badge; dropdown modal; automatic polling; navigation to ticket on tap |
| **Connections** | View submitted reports as sequential timeline of ticket actions (Completed rates, In-progress highlights, Pending queue) |

**Screens:**

| Screen | Route | Purpose |
|--------|-------|---------|
| Login / Register | `(auth)/index.tsx` | Auth with OAuth and IA address assignment |
| Home | `(tabs)/index.tsx` | Personal dashboard + stats |
| Camera / Report Form | `(tabs)/camera.tsx` | Geo-camera + report form with offline draft support |
| Map | `(tabs)/map.tsx` | GIS map (In Progress reports only) |
| Profile | `(profile)/profile.tsx` | User info, role, IA assignment |
| My Reports | `(profile)/my-reports.tsx` | Personal submitted reports timeline |
| Notifications | `(profile)/notifications.tsx` | Push/polling notifications |

---

### Admin Desktop App (IrriGIS_Electron)

React + Electron desktop application with **offline connectivity detection** and **IndexedDB caching**.

| Feature | Description |
|---------|-------------|
| **GIS Map** | Leaflet map centered on General Santos (6.17°N, 125.17°E) with Leaflet-Geoman drawing tools |
| **Marker Types** | Red Flag — origin reports (ticket creators), color-coded by status; Teardrop — standalone reports, color-coded by category |
| **GIS Layer Controls** | Ticket status layers (Pending / In Progress / Closed); Standalone Reports layer |
| **Canal History Panel** | Ongoing vs past reports separation; closed report opacity fading (configurable);
| **Layer Controls** | Customizable marker opacity, closed report days-to-fade, category filters |
| **GIS Feature Drawing** | Create/edit canal lines (MultiLineString) and IA areas (MultiPolygon) via Geoman; in-card editing with auto-scroll sync between map and list |
| **Feature Management** | Canal Lines list + IA Areas list with sub-tabs; RIS filter; Geometry CRUD; "Add new" flow with draw mode |
| **Feature Labels** | Auto-positioned GeoJSON labels for all canal lines and IAs on the map |
| **User Management** | User list with search; Create/Edit user modal; Activate/Deactivate; role badges; Full access controls |
| **Dashboard** | KPI cards (Total Reports, Open Tickets, Average Resolution Time, Active Crews); monthly trend chart; top IA barangay chart |
| **Ticket System** | Grouped tickets (1 ticket ↔ N reports via `ticket_id`); carousel per ticket; workflow buttons (Acknowledge / Close / Reopen); Edit Report; Reject |
| **Report & History** | Individual report list; closed report history with IA/date filters; days-to-resolve calculation |
| **Settings (4 tabs)** | Color Personalization, Report Settings (sub-statuses + presets + ticket grouping), GIS Map (feature list + IA list), API Testing |
| **Offline Support** | Connection status indicator + toast; IndexedDB caching for all GET responses; prefetch + bulk cache clearing from Settings > Offline Data tab |
| **API Testing Console** | Built-in console for all endpoints; auto-creates and cleans up dummy test users; tracks report/ticket IDs |
| **Notifications** | Adaptive polling (15s → 30s → 60s → 120s); grouped smart messages for ticket groups |

---

## Tech Stack

### Backend

| Technology | Purpose |
|------------|---------|
| Express.js 5 | Web framework |
| PostgreSQL + PostGIS | Spatial database (hosted on Supabase / running on Render) |
| Sequelize | ORM |
| JWT + bcrypt | Authentication & password hashing |
| Passport.js | OAuth strategies (Google, Facebook) |
| Multer | Multipart file uploads |
| CORS | Cross-origin request handling |
| Docker | Deployment on Render |

### Mobile App

| Technology | Purpose |
|------------|---------|
| Expo | Development & build toolchain |
| React Native | UI framework |
| Expo Router | File-based navigation |
| React Native Paper | Material Design components |
| expo-image-picker | Camera / gallery |
| expo-location | GPS positioning |
| expo-secure-store | Secure credential storage |
| expo-file-system | Offline file-based storage |
| expo-notifications | Push notifications (polling fallback in place) |

### Admin Desktop App

| Technology | Purpose |
|------------|---------|
| Electron | Desktop framework |
| React 18 + Vite | UI + build tooling |
| Tailwind CSS | Utility-first styling |
| Leaflet + Leaflet-Geoman | Interactive maps + drawing |
| Recharts | Dashboard charts |
| Lucide React | Icon library |
| IndexedDB (idb) | Offline data cache |
| React Router | Client-side routing |

---

## Environments

| Component | Development | Production |
|-----------|-------------|------------|
| **Backend** | `http://localhost:3000` | `https://irrigis-backend.onrender.com` |
| **Database** | Local PostgreSQL + PostGIS | Supabase PostgreSQL + PostGIS |
| **Mobile API** | Configure via `EXPO_PUBLIC_API_URL` | `https://irrigis-backend.onrender.com/api` |
| **Admin API** | `http://localhost:5173` (proxied) | Render-deployed |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- PostgreSQL 14+ with PostGIS extension
- Expo CLI (for mobile: `npm install -g expo-cli`)
- Android Studio / Xcode (for mobile emulators, optional)
- Supabase account (for production database)

---

### Backend Setup

```bash
# Clone and install
cd IrriGIS_Backend
npm install

# Create environment file from template
cp .env.example .env   # or create .env manually (see below)

# Run locally (auto-syncs DB schema)
npm start
```

**Required `.env` variables:**

```
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname   # Supabase connection string
DB_DIALECT=postgres

# JWT
JWT_SECRET=your_jwt_secret_here

# OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...

# URLs
FRONTEND_URL=https://irrigis-backend.onrender.com
BACKEND_URL=https://irrigis-backend.onrender.com

# Environment
NODE_ENV=production
```

The app auto-syncs the DB schema on startup (`sequelize.sync()` in `app.js`).  
To reset the database, seed data with the SQL files in `IrriGIS_Backend/sql/`:

```bash
# Report presets seed data
psql $DATABASE_URL -f IrriGIS_Backend/sql/report_presets_setup.sql

# Ticket sub-status seed data
psql $DATABASE_URL -f IrriGIS_Backend/sql/ticket_sub_status_setup.sql
```

To deploy to Render, create a **Web Service** pointing to the `IrriGIS_Backend` directory. The Render environment will supply the Supabase connection string via Secrets.

---

### Mobile App Setup

```bash
cd IrriGIS_App
npm install
npx expo start
```

**Configuration (`app.json` or `.env`):**

```bash
EXPO_PUBLIC_API_URL=http://192.168.x.x:3000/api   # for local development
# or
EXPO_PUBLIC_API_URL=https://irrigis-backend.onrender.com/api   # production
```

Restart Expo after changing env: `npx expo start --clear`

---

### Admin Desktop Setup

```bash
cd IrriGIS_Electron
npm install
npm run dev
```

The Electron app ships with an `OfflineContext` that caches all GET responses to IndexedDB. In the **Settings → Offline Data** tab you can view cache statistics, prefetch data for offline use, or clear the cache entirely. The app shows a live connection-status indicator (green = online) and displays a toast notification when the connection to the backend is lost or restored.

---

## API Reference

Base URLs: `http://localhost:3000/api` (local) · `https://irrigis-backend.onrender.com/api` (production)

### Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/login` | No | Email/password login |
| `POST` | `/auth/register` | No | User registration (IA admin only) |
| `GET` | `/auth/google` | No | Google OAuth redirect |
| `GET` | `/auth/google/callback` | No | Google OAuth callback |
| `GET` | `/auth/facebook` | No | Facebook OAuth redirect |
| `GET` | `/auth/facebook/callback` | No | Facebook OAuth callback |
| `GET` | `/auth/test` | JWT | Protected test endpoint |

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users` | nia_admin | List all users (paginated, searchable) |
| `GET` | `/users/me` | JWT | Current user profile |
| `GET` | `/users/:id` | JWT | Get user by ID |
| `GET` | `/users/ias` | JWT | Get IA list (with `ris_id` and `service_area` as GeoJSON) |
| `POST` | `/users` | nia_admin | Create user |
| `PUT` | `/users/:id` | JWT | Update user |
| `PUT` | `/users/:id/password` | nia_admin | Reset password |
| `DELETE` | `/users/:id` | nia_admin | Deactivate user |

### Reports

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/reports` | JWT | List reports (paginated, filterable by status/ris_id/ia_id/category) |
| `GET` | `/reports/:id` | JWT | Get single report |
| `POST` | `/reports` | JWT | Create report + images (auto-groups to existing ticket if criteria match) |
| `PUT` | `/reports/:id` | JWT | Update report + images (supports `ticket_id` merges) |
| `DELETE` | `/reports/:id` | nia_admin | Delete report |

*Creating a report with `category = "issue"` automatically creates a `report_tickets` entry. Non-issue categories store the report without a ticket.*

### Reports — Water / Silt / Debris Level Mappings

| Level | Water Level | Silt Level | Debris Level |
|-------|-------------|------------|--------------|
| 1 | dry | clean | clear |
| 2 | low | light | light |
| 3 | normal → (normal) | normal → (normal) | normal |
| 4 | high | dirty | heavy |
| 5 | overflow | heavily_silted | blocked |

### Tickets

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/tickets` | JWT | List tickets (paginated, filterable by status/assigned_to) |
| `GET` | `/tickets/:id` | JWT | Get single ticket with linked reports |
| `POST` | `/tickets` | nia_admin | Manually create ticket |
| `PUT` | `/tickets/:id` | JWT | Update status / assignment |
| `POST` | `/tickets/:id/comments` | JWT | Add comment |
| `DELETE` | `/tickets/:id` | nia_admin | Delete ticket |

**Urgency calculation** (used in Tickets UI):  
`avg = (water_level + silt_level + debris_level) / 3`
- **Critical** (red): `avg >= 4`
- **Moderate** (amber): `avg >= 3`
- **Low** (green): `avg < 3`

### Tickets — Sub-Statuses

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/ticket-sub-statuses` | JWT | List all sub-statuses |
| `GET` | `/ticket-sub-statuses/:id` | JWT | Get sub-status |
| `GET` | `/ticket-sub-statuses/for-ticket?ticket_id=` | JWT | Sub-statuses for a specific ticket |
| `POST` | `/ticket-sub-statuses` | nia_admin | Create sub-status |
| `PUT` | `/ticket-sub-statuses/:id` | nia_admin | Update sub-status |
| `DELETE` | `/ticket-sub-statuses/:id` | nia_admin | Delete sub-status |

### Report Presets

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/report-presets` | JWT | List all presets |
| `GET` | `/report-presets/:id` | JWT | Get single preset |
| `GET` | `/report-presets/by-category?category=` | JWT | Presets filtered by category |
| `GET` | `/report-presets/categories` | JWT | All available preset categories |
| `POST` | `/report-presets` | nia_admin | Create preset |
| `PUT` | `/report-presets/:id` | nia_admin | Update preset |
| `DELETE` | `/report-presets/:id` | nia_admin | Delete preset |

### GIS

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/gis/reports` | JWT | Reports as GeoJSON (with spatial filtering) |
| `GET` | `/gis/features` | JWT | GIS features (canal lines) as GeoJSON |
| `GET` | `/gis/features/:id` | JWT | Single GIS feature |
| `POST` | `/gis/features` | nia_admin | Create GIS feature (canal line) |
| `PUT` | `/gis/features/:id` | nia_admin | Update GIS feature |
| `DELETE` | `/gis/features/:id` | nia_admin | Delete GIS feature |
| `GET` | `/gis/ris` | JWT | River Irrigation Systems list |
| `GET` | `/gis/ris/:id` | JWT | Single RIS details |
| `GET` | `/gis/ias` | JWT | Irrigator Associations list (with `ris_id`, `service_area` as GeoJSON) |
| `GET` | `/gis/ias/geojson` | JWT | IAs as GeoJSON |
| `POST` | `/gis/ias` | nia_admin | Create IA |
| `PUT` | `/gis/ias/:id` | nia_admin | Update IA |
| `DELETE` | `/gis/ias/:id` | nia_admin | Delete IA |
| `GET` | `/gis/stats` | nia_admin / nia_field_officer | Dashboard stats |

**GIS query parameters** (applicable to `/reports` and `/gis/reports`):

| Parameter | Values | Description |
|-----------|--------|-------------|
| `status` | `pending`, `in_progress`, `closed` | Filter by ticket status |
| `ris_id` | UUID | Filter by River Irrigation System |
| `ia_id` | UUID | Filter by Irrigator Association |
| `category` | `inspection`, `maintenance`, `cleaning`, `issue`, `other` | Filter by report category |
| `urgency` | `high`, `normal` | Filter by urgency score (`high` = ≥ 12) |
| `feature_type` | `canal`, `river`, `main_canal`, `pipeline`, `lateral`, `farm_ditch` | Filter GIS features |
| `bounds` | `minLng,minLat,maxLng,maxLat` | Filter by map viewport |
| `date_from` / `date_to` | ISO date | Date range filter |
| `page` / `limit` | integer | Pagination (default page: 1, limit: 20) |

### Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/notifications` | JWT | Get notifications (paginated) |
| `GET` | `/notifications/unread-count` | JWT | Unread count badge value |
| `PUT` | `/notifications/:id/read` | JWT | Mark as read |
| `PUT` | `/notifications/read-all` | JWT | Mark all as read |
| `DELETE` | `/notifications/:id` | JWT | Delete notification |

### Static Files

| Endpoint | Description |
|----------|-------------|
| `GET /uploads/*` | Serve uploaded report images |
| `GET /users/*` | Serve user profile images |

---

## Database Schema

### Core Tables

```sql
-- Users
users
  id UUID PK
  email VARCHAR UNIQUE
  password_hash VARCHAR
  first_name VARCHAR
  last_name VARCHAR
  role ENUM (nia_admin, nia_field_officer, ia_admin, ia_member)
  ia_id UUID FK → irrigator_associations.id
  contact_number VARCHAR
  address VARCHAR
  profile_image VARCHAR
  session_token VARCHAR
  is_active BOOLEAN DEFAULT false
  created_at / updated_at TIMESTAMP

-- Reports
reports
  id UUID PK
  user_id UUID FK → users.id
  ticket_id UUID FK → report_tickets.id
  category ENUM (inspection, maintenance, cleaning, issue, other)
  water_level ENUM (1-5)
  silt_level ENUM (1-5)
  debris_level ENUM (1-5)
  remarks TEXT
  location_name VARCHAR
  location GEOGRAPHY(Point) -- lat/lng
  is_valid BOOLEAN DEFAULT true
  invalid_reason VARCHAR
  created_at / updated_at TIMESTAMP

-- Report Images
report_images
  id UUID PK
  report_id UUID FK → reports.id
  image_url VARCHAR
  created_at TIMESTAMP

-- Report Tickets
report_tickets
  id UUID PK
  report_id UUID FK → reports.id  -- origin report
  status ENUM (pending, in_progress, closed)
  assigned_to UUID FK → users.id
  workflow_steps JSONB
  acknowledged_at TIMESTAMP
  resolved_at TIMESTAMP
  created_at / updated_at TIMESTAMP

-- GIS Features
gis_features
  id UUID PK
  name VARCHAR
  feature_type VARCHAR
  geometry GEOMETRY(MultiLineString)
  ris_id UUID FK → river_irrigation_systems.id
  ia_id UUID FK → irrigator_associations.id
  created_at / updated_at TIMESTAMP

-- Irrigator Associations
irrigator_associations
  id UUID PK
  name VARCHAR
  service_area GEOMETRY(MultiPolygon)
  ris_id UUID FK → river_irrigation_systems.id
  created_at / updated_at TIMESTAMP

-- River Irrigation Systems
river_irrigation_systems
  id UUID PK
  name VARCHAR
  created_at / updated_at TIMESTAMP

-- Notifications
notifications
  id UUID PK
  user_id UUID FK → users.id
  type ENUM (new_report, ticket_in_progress, ticket_closed, ticket_updated, ticket_comment, ticket_rejected, sub_status_update)
  title VARCHAR
  message TEXT
  is_read BOOLEAN DEFAULT false
  related_ticket_id UUID FK → report_tickets.id
  related_report_id UUID FK → reports.id
  created_at TIMESTAMP

-- Audit Logs
audit_logs
  id UUID PK
  user_id UUID FK → users.id
  action VARCHAR
  model VARCHAR
  record_id UUID
  old_values JSONB
  new_values JSONB
  created_at TIMESTAMP
```

> Full DDL available in `IrriGIS_Backend/sql/irrigis-summary-plain.sql`

---

## User Roles & Permissions

| Role | Admin Panel (Desktop) | Mobile App | Notes |
|------|----------------------|------------|-------|
| **nia_admin** | ✅ Full access | ❌ | Creates all other users; full CRUD |
| **nia_field_officer** | ❌ | ✅ | Field reporting only |
| **ia_admin** | ✅ IA-scoped access* | ❌ | *Requires `is_active=true` + assigned `ia_id` |
| **ia_member** | ❌ | ✅ | Submit reports for assigned IA |

**Access rules:**
- Admin panel is exclusively accessible to `nia_admin` and `ia_admin` (active accounts only)
- `nia_field_officer` and `ia_member` use the mobile app only
- IA Admin self-registration is available via `/register`; NIA personnel must be created by an `nia_admin`
- OAuth accounts with NIA emails are auto-activated; others require admin approval
- `ia_admin` users can only view/manage users within their assigned IA

---

## Deployment

The backend is deployed to **Render** as a web service with `NODE_ENV=production`. The database is hosted on **Supabase** (PostgreSQL with PostGIS extension).

```
┌─────────────────────────────────────────────────────┐
│  Frontend calls → https://irrigis-backend.onrender.com│
│  Render spins up → Node.js + Express              │
│  Render injects  → Supabase connection string      │
│  Sequelize ORM  → queries PostGIS                   │
└─────────────────────────────────────────────────────┘
```

Renderer environment variables (supplied as Render Secrets):
- `DATABASE_URL` — Supabase PostgreSQL connection string
- `JWT_SECRET` — JWT signing key
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` — Facebook OAuth
- `FRONTEND_URL` / `BACKEND_URL` — `https://irrigis-backend.onrender.com`

The React Native mobile build is distributed via **Expo EAS** or local development builds. The Electron desktop build is bundled per-platform for NIA desktop workstations.

---

## License

This project is developed for **academic purposes** as part of a Capstone Project.

---

## Support

For questions or issues, please refer to `IrriGIS_Docs/USER_MANUAL.md`, `IrriGIS_Backend/api_doc.txt`, or contact the development team.
