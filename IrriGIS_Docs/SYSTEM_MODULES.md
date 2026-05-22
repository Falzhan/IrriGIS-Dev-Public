# IrriGIS — System Modules

> **Version:** v1.2.6 | **May 2026**

---

## Overview

IrriGIS has three applications sharing one backend and one database. Anything recorded in one app is immediately visible in the others.

| # | Module | IrriGIS_Electron (Desktop) | IrriGIS_App (Mobile) |
|---|---|---|---|
| 1 | Login & Your Account | ✅ | ✅ |
| 2 | GIS Map & Infrastructure | ✅ Monitoring page | ✅ Map tab |
| 3 | Report Management | ✅ Reports page | ✅ Camera tab |
| 4 | Ticket Workflow | ✅ Tickets page | ⚠️ View + comments only |
| 5 | User & IA Management | ✅ Users & Register | ❌ |
| 6 | Dashboard & Analytics | ✅ Dashboard | ✅ Home screen |
| 7 | Notifications | ✅ | ✅ |
| 8 | Settings & Configuration | ✅ Settings page | ❌ |

---

## Module 1 — Login & Your Account

**Where:** IrriGIS_Electron (login screen) and IrriGIS_App (login screen).

Handles signing in, role-based access, and session security. Supports email/password login plus Google and Facebook OAuth buttons. A "Remember Me" checkbox on the desktop keeps you persistently signed in via `localStorage`; unchecking it uses `sessionStorage` so the session ends when you close the app. Single-session enforcement means only one active login per account at any time — logging in elsewhere automatically signs you out. A background check runs every 10 seconds; if your token becomes invalid you are redirected straight to the login screen.

There are four user roles: **NIA Admin** (full desktop access), **IA Admin** (desktop access scoped to their assigned irrigator association), **NIA Field Officer** (mobile only), and **IA Member** (mobile only). IA Admins and NIA employees can self-register on the registration page; NIA employees (`@nia.gov.ph` emails) cannot self-register and must be created by an NIA Admin. All accounts require admin activation before first login; OAuth NIA emails are auto-activated.

---

## Module 2 — GIS Map & Infrastructure

**Where:** IrriGIS_Electron — **Monitoring** page (sidebar). IrriGIS_App — **Map** tab (bottom nav).

An interactive Leaflet map centered on General Santos City showing irrigation infrastructure and field reports over real street data.

**On the desktop**, five types of map markers appear: a **Red Flag** on report origin markers (color = ticket status: blue = Pending, red = In Progress, green = Closed) and a **Teardrop** on standalone reports without tickets (color = category: blue = Inspection, amber = Maintenance, cyan = Cleaning, red = Issue, gray = Other). Canal **MultiLineString** features are drawn across the map in customizable color-coded lines, and IA **MultiPolygon** service-area boundaries shade each association region. Auto-positioned text labels appear on canal lines and IA areas so they are identifiable without clicking. The right-side panel has layer toggles (Pending / In Progress / Closed tickets and Standalone Reports), a Canal History panel distinguishing ongoing from past reports, closed-report fading (configurable from 1–90 days, default 7), and a pending marker opacity slider (10–80%, default 40%). Filters include feature type, River Irrigation System (RIS), and Irrigator Association (IA). A search bar jumps the map to any matching location or report ID, with auto-zoom to RIS boundaries.

**On the mobile app**, the map is simplified: it shows only the user's own IA-scoped reports with "In Progress" status. Tapping any marker opens a summary and navigates to the full report.

Admins can draw and edit canal lines and IA areas directly on the map using Leaflet-Geoman, with a card-beside-map editing layout and RIS-based filtering. Map feature and category colors are customized in Settings > Personalization.

---

## Module 3 — Report Management

**Where:** IrriGIS_App — **Camera** tab (submit) and **Me** tab (own reports). IrriGIS_Electron — **Reports** page (sidebar).

### Mobile — Submitting a Report

Field officers open the **Camera tab**, take a photo with a GPS overlay, and fill in a form with water/silt/debris level ratings (1–5 scale), a report category (Inspection / Maintenance / Cleaning / Issue / Other), and free-text remarks. Three presets speed up common entries — **Normal** (all levels = 3), **Cleaning** (Silt and Debris = 1), **Severe** (all 5s). GPS location is auto-filled. Tap **Submit** to send, or if you lose connection the draft is saved locally, shown as a gray "DRAFT" card, and auto-synced on reconnect. The offline draft persists across app restarts and can be edited from the Me tab before final submission.

Reports with category **Issue** automatically trigger ticket creation on the backend. All other categories (Inspection, Maintenance, Cleaning, Other) are stored with `ticket_id = NULL` and displayed as **"No Ticket"** — no workflow action is needed for routine checks.

### Desktop — Reviewing Reports

The Reports page shows all reports as horizontal cards with a thumbnail image, location name, submitter name, date, status badge, urgency badge, category badge, and a condition strip (Water / Silt / Debris). Click any card to open the full report with an image gallery, a mini Leaflet map showing exact coordinates and nearby canal lines, submitter/date/acknowledged/resolved timestamps, condition badges, remarks, ticket work-over, workflow history, and an **Edit Report** button. Administrators are also able to make **Edit Report** and **Reject / Mark as Invalid** changes. Reports without a calendar generation show complex visual cues: a **"View Ticket"** button also enables direct navigation to the ticket workflow.

---

## Module 4 — Ticket Workflow

**Where:** IrriGIS_Electron — **Tickets** page (sidebar). IrriGIS_App — ticket details (view-only, plus comments).

This is the administrative heart of IrriGIS, where field reports become actionable tasks.

### Lifecycle

| Status | Description |
|---|---|
| **Pending** | New — awaiting admin review |
| **In Progress** | Certified and acknowledged; work underway |
| **Rejected** | Marked invalid (spam, wrong location, duplicate) |
| **Closed** | Resolved and completed |

Transition rules are enforced on the backend: `pending → in_progress / rejected / closed`; `rejected → in_progress / closed`; `in_progress → closed / rejected`; `closed → in_progress` (reopen). Once moved past Pending, a ticket cannot return to Pending.

### Desktop — Using Tickets

The **Tickets page** lists all tickets as visual cards. Cards for grouped tickets (multiple reports pointing to the same ticket) display as overlapping stacked files with a group count badge (e.g., "3 grouped").

**Acknowledge a Pending ticket** — click the amber button. A **Certify & Acknowledge** confirmation modal appears with a mandatory 3-point checklist. On confirmation the ticket moves to In Progress and a sub-status entry with the first workflow step timestamp is created automatically. This action is irreversible.

**Close a ticket** — click the green **Close Ticket** button. A confirmation modal requires explicit confirmation — this sets the `resolved_at` timestamp. Closed tickets can be reopened and returned to In Progress if needed.

**Reject a ticket** — click the red **Reject** button, type a required reason (spam / incorrect location / duplicate / false information), and confirm — the report is flagged `is_valid = false` and the ticket status becomes Rejected.

**Inside In-Progress tickets**, admins see a **Sub-Status Progress** panel — a vertical timeline where each entry records the sub-status name, a colored dot, a timestamp, and progress notes. A **+ Add Workflow Step** button opens an inline form with a searchable sub-status pill grid. Only tickets with `status = in_progress` accept new workflow steps. Sub-statuses are fully administrable via Settings > Report Settings, allowing NIA Admins to define any step labels and colors relevant to their workflow (e.g., "Inspection Started", "Cleaning In Progress").

An **Edit Report** button on the ticket detail navigates directly to the Reports page.

---

## Module 5 — User & IA Management

**Where:** IrriGIS_Electron — **Users** page and **Register** page.

NIA Admins and IA Admins manage all user accounts from the Users page. Columns show each user's name, profile picture, email, Irrigator Association, role (color-coded badge), active/inactive status, and date added — with Edit and Activate/Deactivate rows accessible via row actions.

Searching is by name or email. Narrowing is by Association, Role, or Active status. Sorting supports Date Added, Name, Email, or Role.

**Adding a user** opens a modal for their name, email, password, role dropdown (NIA Admin / Field Officer / IA Admin / IA Member), and IA assignment. NIA Admin creation is restricted to existing NIA Admins only, and auto-activation is set to *active by default* when a new user is created.

**Self-registration** via the Register page is available only to IA Members. NIA emails are blocked from self-registration; IA selection is mandatory; GPS-based address auto-detection and profile image upload are supported. NIA personnel are node-created by the NIA Admin directly from the Users page.

---

## Module 6 — Dashboard & Analytics

**Where:** IrriGIS_Electron — **Dashboard** page. IrriGIS_App — **Home** screen.

The desktop dashboard gives admins an At-a-glance operational view with four KPI cards (Open Tickets, Total Reports, Average Resolution Time, Active Crews/Field Officers), a monthly reports line chart, a top-IAs bar chart, and quick-look lists of today's reports and today's tickets. The mobile home mirroring provides personal stats (Pending / In Progress / Closed counts), a welcome greeting, quick action shortcuts, and the user's recent submission history through the Me tab.

---

## Module 7 — Notifications

**Where:** IrriGIS_Electron and IrriGIS_App.

A real-time notification system with no manual refresh needed. A **bell icon** in the top nav shows an unread count badge. Clicking it opens a dropdown of recent events. Polling uses adaptive intervals (15 → 30 → 60 → 120 s) to balance responsiveness with efficiency and automatically retries notification fetch when another polling interval comes around; tab visibility API integration pauses polling when the browser tab is hidden.

Notifications are triggered automatically for: new field reports, ticket status changes, ticket moved to In Progress, ticket closed, ticket rejected, new comments added to tickets, and workflow steps added. Each notification carries enough context for a user to tap and jump directly to the relevant report or ticket, with smart grouping messages for entries in group tickets (e.g., "Your report and 2 others").

---

## Module 8 — Settings & Configuration

**Where:** IrriGIS_Electron — **Settings** page (sidebar). Five tabs at the top.

**Personalization tab.** Adjust the colors of map features (Main Canal, Lateral, Farm Ditch, Pipeline, Canal, Other) and report category badges (Inspection, Maintenance, Cleaning, Issue, Other) using a color picker or hex input; save or reset to defaults. Display settings adjust the number of days closed reports remain visible on the map before fading (1–90 days, set to 7) and the fade opacity of Pending ticket markers (10–80%, set to 40%).

**Report Settings tab.** Three collapsible sections: **Ticket Sub-Statuses** (grid of cards for creating, editing, and deleting workflow steps with name, slug, color, and display order); **Report Presets** (grid of quick-fill templates with name, category, water/silt/debris levels, icon, and active toggle), **Ticket Grouping** (a proximity threshold slider from 10–500 m and an auto-group toggle, settings persisted via `TicketSettings` on the backend).

**GIS Map tab.** A sub-tabs toggle就会出现CANAL LINEs分割 and IA Areas management. Each sub-tab shows an individual type list alongside a live Leaflet editing map. Right-side lists have interactive cards with map scroll and selection sync management allowing editing and drawing, with integrated coloring matching the Personalization palette.

**API Testing tab.** A built-in endpoint console with expandable categories for all backend routes (Auth, Users, Reports, Tickets, GIS, Notifications, Presets, Sub-Statuses, IAs). Each endpoint shows method, path, and a Test button to enter request bodies or path parameters and view the formatted JSON response with status codes. A dummy user is auto-created and cleaned up by timer.

**Offline Data tab.** Shows connection status (green/gray dot with toast notification on state change), cache statistics, a Prefetch button to load all data while online for later offline use, and a Clear Cache button to wipe IndexedDB stored API responses. When internet is lost, the app continues to serve cached data from the `IrriGIS_API_Cache` store.
