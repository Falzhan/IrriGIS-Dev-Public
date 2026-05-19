# IrriGIS — User Manual

> **Version:** v1.2.5 | **Last Updated:** May 2026
> **Platform:** IrriGIS Mobile App (Android/iOS) & IrriGIS Electron Desktop (Windows/Mac/Linux)

---

# PART A: MOBILE APP USERS (Field Officers & IA Members)

This section is for users who submit reports and track tickets using the **IrriGIS Mobile App**.

---

## Chapter 1: Getting Started — Account Creation

### If You Are an IA Member or NIA Field Officer

Your account may be created for you by an administrator. Once created, you will receive your login credentials.

**To register yourself (IA Members):**

1. **Open the app** — You will see the Login screen with fields for Email and Password, plus Google and Facebook login buttons.

2. **Tap "Don't have an account? Register"** (or the equivalent link on the login screen).

3. **Fill in the registration form:**
   - **First Name** *(required)* — Enter your first name.
   - **Last Name** *(required)* — Enter your last name.
   - **Email Address** *(required)* — Enter your email. If you use a `@nia.gov.ph` email, you will be prompted to register as NIA Staff instead.
   - **Irrigators Association (IA)** *(required)* — Select your IA from the dropdown list. This determines which irrigation system area you are assigned to.
   - **Contact Number** *(optional)* — Enter your phone number.
   - **Address** *(optional)* — Your address is auto-detected from your phone's GPS. You can also type it manually or tap "Use GPS" to refresh.
   - **Profile Picture** *(optional)* — Tap the camera icon to take or upload a photo.
   - **Password** *(required)* — Create a password (minimum 6 characters).
   - **Confirm Password** *(required)* — Re-enter your password.

4. **Tap "Create Account"** — Your account is created. If your account is set to require admin approval, you will see a message that your account is pending activation. Otherwise, you are logged in automatically and taken to the Home screen.

### What Happens After Registration

- **If "Default New Users as Active" is ON** on the admin side → Your account is immediately active. You can log in right away.
- **If "Default New Users as Active" is OFF** → Your account is marked as **Inactive**. An NIA Admin must activate you before you can log in. You will see "Account not activated" if you try to log in.

---

## Chapter 2: The Mobile App Home Screen

When you open the app after logging in, you see the **Home Screen** (also called the Reports Feed).

### Screen Layout

**Top Bar:**
- **Hamburger menu icon** (left) — Opens the navigation drawer (sidebar).
- **"Reports" / "Me" toggle** (center) — Switch between viewing all reports or only your own reports.
- **Calendar icon** (right) — Opens the calendar date filter.

**Main Content Area:**
A scrollable list of **report cards**, each showing:
- **Thumbnail image** — A square preview of the reported issue.
- **Title** — e.g., "Debris", "Silt", "Water Level".
- **Subtitle** — e.g., "Manageable Debris", "Dry".
- **Location** — e.g., "Purok 3, Brgy. Katangawan".
- **Date/Time** — When the report was submitted.
- **Status Chip** — Color-coded: **Blue** = Pending, **Green** = In Progress, **Gray** = Closed.

### Bottom Navigation Bar
Three icons at the bottom of the screen:

| Icon | Label | Action |
|---|---|---|
| 📋 File/Tray | **Reports** | View all reports (Home screen) |
| 📷 Camera | **Camera** | Open camera to submit a new report |
| 🗺️ Map | **Map** | View reports on the map (In Progress only) |

---

## Chapter 3: Submitting a Report

This is the core action for mobile users.

### Step 1: Open Camera Mode

1. Tap the **Camera icon** on the bottom navigation bar.
2. The screen animates:
   - The green background fades to **black**.
   - The camera icon **scales up** and moves to the center, becoming a large **white shutter button**.
   - A **pencil/form icon** fades in at the center.
3. You are now in **Camera Mode**.

### Step 2: Take a Photo

1. The **viewfinder** fills the screen with a live camera preview.
2. A subtle **white grid overlay** (rule of thirds) helps with composition.
3. At the **bottom-left**, a translucent watermark shows:
   - Current **Date and Time**
   - **Location Name** (reverse-geocoded from GPS)
   - **GPS Coordinates** (latitude, longitude)
4. Tap the **white shutter button** to capture the photo.
5. (Optional) Use the **camera flip icon** (top-right of shutter area) to switch between front/back cameras.

### Step 3: Fill in the Report Form

After taking the photo, the camera view shrinks to the top third of the screen, and a **white form sheet** slides up from the bottom.

**Form fields:**

| Field | Description |
|---|---|
| **Presets dropdown** | Quick-select a preset: **Normal** (all levels = 3), **Cleaning** (Silt/Debris = 1), or **Severe** (all levels = 5). Located at the top-right of the form header. |
| **Help (?) icon** | Tap to open the **Quick Guide** — a modal showing the 1–5 rating scale for Water, Silt, and Debris levels. |
| **Water Level** | Tap a number (1–5): 1=Dry, 2=Low, 3=Normal, 4=High, 5=Very High. Selected circle turns **deep purple**. |
| **Silt Level** | Same 1–5 scale. |
| **Debris Level** | Same 1–5 scale. |
| **Category** | Dropdown: **Inspection**, **Maintenance**, **Cleaning**, **Issue**, **Other**. |
| **Remarks** | Large text area for typing notes about the issue. |
| **GPS Location** | Auto-filled from your phone's GPS. Shows the location name and coordinates. |

**Note:** You can attach **up to 5 images** per report. After the first photo, additional photos can be added from the gallery.

### Step 4: Submit

1. Tap the **floating teal button** at the bottom center of the form (labeled "Submit" or showing a send icon).
2. The report is sent to the server.
3. The form closes, camera mode exits, and you return to the **Home Screen** where your new report appears in the list.

### What Happens After Submission

- If your report matches an existing issue (same category, same location, same day, within proximity), it is **automatically grouped** under the same ticket.
- If it is a new issue, a **new ticket** is created.
- Only reports with **Category = Issue** create tickets. Inspection, Maintenance, and Cleaning reports are stored without a ticket.
- The **NIA Admin** is notified of your new report and can review, acknowledge, or assign it.

---

## Chapter 4: Tracking Your Reports

### My Reports

1. Tap the **hamburger menu** (top-left) to open the sidebar.
2. Tap **"My Reports"** (paper plane icon).
3. You see a list of all reports you have submitted, with their current status.

### Report Detail View

1. Tap any report card to open it.
2. The **top half** shows the full-width image with:
   - Date/time and GPS coordinates overlaid at the bottom.
   - A back arrow at the top-left.
3. The **bottom half** shows:
   - Report title and status chip.
   - Subtitle (e.g., "Slightly Obstructed").
   - Submitter info (your name and avatar).
   - A **timeline/tracker** showing the ticket's progress:
     - Vertical line with **dots** representing steps.
     - Active step is **blue**; completed steps are **gray**.
     - Labels like "Report Submitted", "Pending", "In Progress", "Closed".

### Ticket Detail (Read-Only)

- If your report is part of a ticket, you can view the ticket's progress.
- The ticket shows all grouped reports in a **carousel** (swipe left/right).
- You can add **comments** to tickets that are marked "In Progress".
- **Note:** You cannot change the ticket status — only admins can do that.

---

## Chapter 5: The Map View

1. Tap the **Map icon** on the bottom navigation bar.
2. The map shows **only reports marked "In Progress"** as interactive markers.
3. **Red Flag markers** = Origin reports (ticket creators), color-coded by status:
   - **Blue** = Pending
   - **Amber** = In Progress
   - **Red** = Closed
4. **Teardrop markers** = Standalone reports (no ticket), color-coded by category:
   - **Blue** = Inspection
   - **Amber** = Maintenance
   - **Cyan** = Cleaning
   - **Gray** = Other
5. Tap any marker to see a summary and navigate to the full report.

---

## Chapter 6: Notifications

1. The **Notification Bell** icon appears in the top navigation bar with a **red badge** showing the number of unread notifications.
2. Tap the bell to open a **dropdown modal** showing recent notifications.
3. Notifications include:
   - Ticket status changes (moved to In Progress, Closed, Rejected)
   - New comments on your tickets
   - Sub-status progress updates
4. Tap any notification to navigate to the relevant ticket.
5. Tap **"Mark All as Read"** to clear the badge.

---

# PART B: ADMIN USERS — IrriGIS Electron Desktop App

> **Note:** The IrriGIS Admin web app is **deprecated**. All administrative functions are now performed through the **IrriGIS Electron Desktop App**. This section covers both **IA Admins** and **NIA Admins**.

---

## Chapter 7: Logging In as an Admin

1. Open the **IrriGIS Electron** desktop application.
2. On the Login screen, enter your **Email** and **Password**.
   - Alternatively, use the **Google** or **Facebook** OAuth buttons.
   - NIA Admins can also use the **"Remember Me"** option to stay logged in.
3. Click **"Login"**.
4. If login is successful, you are taken to the **Dashboard**.

### Access Requirements

| Role | Login Requirement |
|---|---|
| NIA Admin | Email must end in `@nia.gov.ph`; account must be active |
| IA Admin | Must have an IA assigned (`ia_id`); account must be active |

If your account is inactive, you will see: **"Account not activated. Please wait for admin approval."**

---

## Chapter 8: The Admin Dashboard

After logging in, you see the **Dashboard** — your central command center.

### What You See

- **KPI Cards** at the top showing:
  - Number of open/in-progress tickets
  - Total reports submitted
  - Average resolution time
  - Active crews/field officers
- **Monthly Reports Chart** — A line chart showing report volume per month.
- **Top IA Barangay Chart** — A bar chart showing which IAs have the most reports.
- **Quick Lists** — Today's reports and today's tickets.

### Navigation Sidebar (Left Panel)

The sidebar provides access to all admin sections:

| Menu Item | Icon | Leads To |
|---|---|---|
| Dashboard | 📊 | Main dashboard with KPIs and charts |
| Reports | 📋 | Individual reports list with ticket status |
| Tickets | 🎫 | Grouped tickets with workflow controls |
| Monitoring | 🗺️ | Interactive map with GIS layers |
| Users | 👥 | User management (create, edit, activate/deactivate) |
| History | 📜 | Closed/resolved reports history |
| Settings | ⚙️ | System settings (personalization, presets, sub-statuses, GIS, API) |

---

## Chapter 9: User Management (NIA Admin)

**Who can do this:** NIA Admin (full access) and IA Admin (limited to their own IA).

### Viewing Users

1. Go to **Users** from the sidebar.
2. You see a **table of all users** with columns:
   - User (name, avatar, email)
   - Association (IA name)
   - Role (color-coded badge)
   - Status (Active/Inactive)
   - Date Added
   - Actions (Edit, Activate/Deactivate)

3. Use the **search bar** to find users by name or email.
4. Use **Filters** to narrow by Association, Role, or Status.
5. Use **Sort** to order by Date Added, Name, Email, or Role.

### Creating a New User

1. Click the **"Add User"** button (top-right, NIA Admin only).
2. Fill in the **Add User modal:**

   | Field | Required? | Notes |
   |---|---|---|
   | Profile Image | Optional | Click the avatar to upload a photo |
   | First Name | ✅ | |
   | Last Name | ✅ | |
   | Email | ✅ | Must be `@nia.gov.ph` for NIA Admin/Field Officer roles |
   | Password | ✅ | Minimum 6 characters |
   | Role | ✅ | Choose from available roles (see below) |
   | Irrigators Association | Recommended | Assigns the user to a specific IA |

3. Click **"Create User"**.
4. The new user appears in the table.

### Available Roles

| Role | Description | Who Can Assign |
|---|---|---|
| **NIA Admin** | Full system access, all management functions | NIA Admin only |
| **NIA Field Officer** | Mobile-only, submits reports | NIA Admin only |
| **IA Admin** | Manages users/reports within their own IA | NIA Admin or IA Admin |
| **IA Member** | Mobile-only, submits reports within their IA | NIA Admin or IA Admin |

### Editing a User

1. Click the **Edit** button on any user row (or click the user row and then "Edit").
2. Modify: Role, Status (Active/Inactive), IA, RIS, Contact Number, Address.
3. Click **"Save Changes"**.

### Activating / Deactivating a User

1. Click the **Activate** or **Deactivate** button on any user row.
2. A **confirmation dialog** appears:
   - "Are you sure you want to deactivate [Name]? They will lose access to the system."
   - "Are you sure you want to activate [Name]? They will regain access to the system."
3. Click **Activate** or **Deactivate** to confirm.

> **Note:** You cannot deactivate your own account.

---

## Chapter 10: Default New User Settings

**Location:** Settings → **User Settings** tab

This controls whether new user accounts are automatically active or require manual activation.

### How to Access

1. Go to **Settings** from the sidebar.
2. Select the **"User Settings"** tab (the tab with a 👥 Users icon).

### The Setting

You see a **toggle switch** labeled:

> **"Default New Users as Active"**

And an **information box** below it showing the current behavior:

| Toggle State | Information Box Text |
|---|---|
| **ON** (enabled) | "New users will be created as **ACTIVE** by default. They can immediately log in and access the system." |
| **OFF** (disabled) | "New users will be created as **INACTIVE** by default. They will require administrator approval before accessing the system." |

### Buttons

- **Reset** — Restores the default setting (ON).
- **Save** — Saves your current toggle choice. Shows a green "Saved!" confirmation.

### When to Use This

- **Turn ON** if you want new users to be able to log in immediately after registration (e.g., trusted IAs, pre-approved users).
- **Turn OFF** if you want to review and approve each new user before they get access (recommended for security).

---

## Chapter 11: Managing Reports

**Location:** Reports page (from sidebar)

### Reports List View

Each report is shown as a **horizontal card** with:
- **Image thumbnail** (left)
- **Title** (e.g., "Debris", "Water Level")
- **Subtitle** (e.g., "Manageable Debris", "Dry")
- **Location** (e.g., "Purok 3, Brgy. Katangawan")
- **Date/Time**
- **Status badge** — Shows the linked ticket's status (Pending, In Progress, Closed, Rejected)
- **Urgency badge** — Critical (red), Moderate (amber), Low (green)

**Filters available:**
- **Status** — All, Pending, In Progress, Closed, Rejected
- **Urgency** — All, Critical, Moderate, Low
- **Search** — By location, ID, or remarks
- **Sort** — By date, urgency, or status

### Report Detail View

Click any report card to see:
- **Full image** (top half, edge-to-edge)
- **Report details** (bottom half):
  - Title, status, subtitle
  - Date/time and location
  - Submitter info
  - Water/Silt/Debris levels
  - Remarks
  - Map showing the report location

> **Note:** Reports in the admin panel are **read-only**. Admins view them for context but manage them through the Tickets system.

---

## Chapter 12: Managing Tickets & Workflow

**Location:** Tickets page (from sidebar)

This is where admins **control the progress** of reported issues.

### Ticket List View

Each ticket is a card showing:
- **Thumbnail** from the origin report
- **Location** name
- **Category** badge (Inspection, Maintenance, Cleaning, Issue, Other)
- **Status** badge:
  - 🔵 **Pending** — New, not yet reviewed
  - 🟡 **In Progress** — Acknowledged, work underway
  - 🔴 **Rejected** — Marked invalid
  - 🟢 **Closed** — Resolved
- **Urgency** badge (Critical, Moderate, Low)
- **Report count** (e.g., "3 grouped")
- **Submitter** name and **date**

### Filters & Sorting

- **Search** — By location, ticket ID, or remarks
- **Status filter** — All, Pending, In Progress, Rejected, Closed
- **Urgency filter** — All, Critical, Moderate, Low
- **Sort by** — Date, Urgency, or Status
- **Sort order** — Ascending or Descending

### Ticket Lifecycle (Workflow)

Every ticket follows this lifecycle:

```
PENDING → IN PROGRESS → CLOSED
                  ↓
              REJECTED
```

### Acknowledging a Ticket (Pending → In Progress)

1. Open a **Pending** ticket.
2. Click the **"Acknowledge"** button (amber, bottom of the ticket detail).
3. A **Certification Modal** appears with a checklist:
   - ✅ The information in this report is correct and accurate
   - ✅ The report meets proper standards and is valid for processing
   - ✅ You take responsibility for this acknowledgment
   - ⚠️ "Once acknowledged, this ticket will move to In Progress and **cannot be reverted** to Pending."
4. Click **"Certify & Acknowledge"** to confirm.
5. The ticket status changes to **In Progress**.

### Closing a Ticket (In Progress → Closed)

1. Open an **In Progress** ticket.
2. Click the **"Mark as Resolved"** button (green).
3. The ticket status changes to **Closed**.

### Reopening a Ticket (Closed → In Progress)

1. Open a **Closed** ticket.
2. Click the **"Reopen"** button (amber outline).
3. The ticket returns to **In Progress** status.

### Rejecting a Ticket

1. Open any ticket.
2. Click the **"Reject"** button (red).
3. A **Rejection Modal** appears with a textarea for the reason (e.g., spam, incorrect location, duplicate, false information).
4. Click **"Reject Report"** to confirm.
5. The ticket is marked **Rejected** and the origin report is flagged as invalid.

---

## Chapter 13: Sub-Status Progress (Workflow Steps)

This feature lets you track **detailed progress** within an In Progress ticket.

### Viewing the Sub-Status Timeline

1. Open an **In Progress** ticket.
2. Scroll down to the **"Sub-Status Progress"** section.
3. You see a **vertical timeline** with entries showing:
   - **Step name** (sub-status name)
   - **Timestamp** (date and time)
   - **Comment** (progress notes)
4. A vertical amber line connects all steps. Active/latest step is highlighted.

### Adding a Workflow Step

1. While viewing an In Progress ticket, scroll to the bottom of the Sub-Status section.
2. Click **"+ Add Workflow Step"** button (teal circle with + icon).
3. An **inline form** appears:

   | Field | Description |
   |---|---|
   | **Sub-Status** | Searchable dropdown/pill grid. Select from available sub-statuses (e.g., "Inspection Started", "Cleaning In Progress", "Resolved"). Each pill has a colored dot. |
   | **Progress Notes** | Textarea for describing actions taken, progress made, or issues encountered. |

4. Select a sub-status and enter notes.
5. Click **"Save Step"** (teal button).
6. The new step appears in the timeline immediately.

> **Note:** Workflow steps can only be added to tickets with **In Progress** status.

---

## Chapter 14: Configuring Sub-Statuses

**Location:** Settings → Report Settings → **Ticket Sub-Statuses**

Sub-statuses define the possible workflow steps that can be added to tickets.

### Viewing Sub-Statuses

- Sub-statuses are shown as **cards in a grid**.
- Each card displays:
  - **Colored dot** (the sub-status color)
  - **Name** and **slug** (technical identifier)
  - **Display order** number
  - **Description**
  - **Edit** and **Delete** buttons

### Adding a New Sub-Status

1. Click the **"Add"** button.
2. Fill in the form:

   | Field | Required? | Description |
   |---|---|---|
   | **Name** | ✅ | Display name (e.g., "Inspection Started") |
   | **Slug** | ✅ | Auto-generated from name (e.g., `inspection_started`) |
   | **Color** | Optional | Pick a color for the status indicator |
   | **Display Order** | Optional | Controls the order in dropdowns (lower = first) |
   | **Description** | Optional | Brief description of this step |

3. Click **"Create"**.

### Editing a Sub-Status

1. Click the **Edit** button on any sub-status card.
2. Modify the fields inline.
3. Click **"Update"** to save.

### Deleting a Sub-Status

1. Click the **Delete** button (red) on any sub-status card.
2. Confirm the deletion.

> ⚠️ **Warning:** Deleting a sub-status that is in use on active tickets may cause issues. Review before deleting.

---

## Chapter 15: Report Presets

**Location:** Settings → Report Settings → **Report Presets**

Presets are **pre-configured templates** that mobile users can select when submitting reports, saving time on repetitive entries.

### Viewing Presets

- Presets are shown as **cards in a grid**, filterable by category.
- Each card shows:
  - **Category badge** (Inspection, Maintenance, Cleaning, Issue, Other)
  - **Name** and **slug**
  - **Water / Silt / Debris levels** (1–5 scale)
  - **Active/Inactive** status badge
  - **Description**
  - **Edit** and **Delete** buttons

### Adding a New Preset

1. Click the **"Add"** button.
2. Select a **Category** from the dropdown.
3. Fill in:

   | Field | Description |
   |---|---|
   | **Name** | Display name (e.g., "Routine Canal Cleaning") |
   | **Slug** | Auto-generated identifier |
   | **Icon** | Icon name (e.g., "alert-circle", "shield-check") |
   | **Display Order** | Sorting order |
   | **Active** | Toggle to enable/disable |
   | **Water Level** | 1 (Very Low) to 5 (Very High) |
   | **Silt Level** | 1 to 5 |
   | **Debris Level** | 1 to 5 |
   | **Description** | Optional notes |

4. Click **"Create"**.

### Editing / Deleting

- Use the **Edit** or **Delete** buttons on any preset card.

### Built-in Default Presets

Mobile users see these presets when opening the report form:

| Preset | Water | Silt | Debris | Purpose |
|---|---|---|---|---|
| **Normal** | 3 | 3 | 3 | Standard observation |
| **Cleaning** | — | 1 | 1 | Routine maintenance/cleaning |
| **Severe** | 5 | 5 | 5 | Critical blockage/damage |

---

## Chapter 16: GIS Map Management

**Location:** Settings → **GIS Map** tab

This section manages the **canal lines** and **irrigator association areas** displayed on maps.

### Two Sub-Tabs

| Sub-Tab | Purpose |
|---|---|
| **Canal Lines** | Manage irrigation canal paths (MultiLineString geometry) |
| **IA Areas** | Manage Irrigator Association service areas (MultiPolygon geometry) |

### Features

- **Search** by name, type, or RIS (River Irrigation System)
- **Filter** by feature type (Main Canal, Lateral, Farm Ditch, Pipeline, Canal, River, Other) and RIS
- **Interactive Leaflet map** centered on General Santos
- **Click on map features** to select them and scroll to the corresponding card
- **In-card editing** — Click "Edit" to expand the form inline (no modal blocking the map)
- **Leaflet-Geoman drawing** — Create and edit geometries directly on the map

### Adding a New Canal Line or IA Area

1. Click the **"Add Canal Line"** or **"Add IA Area"** button at the bottom of the list.
2. Fill in the form:
   - **Name** *(required)*
   - **Code** *(required for IA Areas)*
   - **Type** *(for canal lines only)* — Select from: Main Canal, Lateral, Farm Ditch, Pipeline, Canal, River, Other
   - **RIS** — Select the River Irrigation System
   - **IA** *(for canal lines only)* — Select the Irrigator Association
3. Click **"Next: Draw on Map"**.
4. **Draw the geometry** on the map:
   - Click to add points
   - Double-click to finish
   - Use the **Redraw** or **Clear** buttons as needed
5. Click **"Create"** to save.

### Editing

1. Click the **Edit** button on any GIS item card.
2. Modify fields or redraw the geometry.
3. Click **"Save"** or **"Cancel"**.

### Deleting

1. Click the **Delete** button (red) on any GIS item card.
2. Confirm the deletion.

---

## Chapter 17: Personalization & Display Settings

**Location:** Settings → **Personalization** tab

### Color Personalization

Customize the colors of map features and report categories:

| Map Feature | Default Color |
|---|---|
| Main Canal | Blue (#2563EB) |
| Lateral | Purple (#7C3AED) |
| Farm Ditch | Teal (#06B6D4) |
| Pipeline | Amber (#F59E0B) |
| Canal | Teal (#74A5A8) |
| Other | Gray (#6B7280) |

| Report Category | Default Color |
|---|---|
| Inspection | Blue (#3B82F6) |
| Maintenance | Amber (#F59E0B) |
| Cleaning | Teal (#06B6D4) |
| Issue | Red (#EF4444) |
| Other | Gray (#6B7280) |

- Use the **color picker** or type hex values directly.
- Click **"Save"** to apply.
- Click **"Reset"** to restore defaults.

### Display Settings

| Setting | Default | Range | Description |
|---|---|---|---|
| **Days to Display Closed Tickets** | 7 days | 1–90 | Closed tickets older than this will fade and disappear from the map |
| **Pending Ticket Marker Opacity** | 40% | 10–80% | Controls transparency of pending ticket markers on the map |

---

## Chapter 18: API Testing Console

**Location:** Settings → **API Testing** tab

A built-in tool for testing all backend API endpoints directly from the admin panel.

- **Expandable categories** — Auth, Users, Reports, Tickets, GIS, Notifications, Report Presets, GIS Features, Irrigator Associations
- Each endpoint shows: **Method** (GET/POST/PUT/DELETE), **Path**, and a **Test** button
- Enter custom **request body** (JSON) and **path parameters** (:id)
- View **response** with status code and formatted JSON output
- Auto-creates a **dummy user** for testing and cleans up with a timer

---

# PART C: QUICK REFERENCE

## Role Summary

| Role | Platform | Can Submit Reports | Can Manage Tickets | Can Manage Users | Can Configure Settings |
|---|---|---|---|---|---|
| **NIA Admin** | Electron Desktop | ❌ | ✅ (all) | ✅ (all) | ✅ (all) |
| **IA Admin** | Electron Desktop | ❌ | ✅ (own IA) | ✅ (own IA) | ✅ (own IA) |
| **NIA Field Officer** | Mobile App | ✅ | ❌ | ❌ | ❌ |
| **IA Member** | Mobile App | ✅ | ❌ | ❌ | ❌ |

## Status Badge Colors

| Status | Color | Meaning |
|---|---|---|
| 🔵 Pending | Blue | Submitted, awaiting admin review |
| 🟡 In Progress | Amber | Acknowledged, work is underway |
| 🟢 Closed | Green | Resolved and completed |
| 🔴 Rejected | Red | Marked invalid by admin |

## Urgency Levels

| Level | Color | Criteria (avg of Water/Silt/Debris) |
|---|---|---|
| 🔴 Critical | Red | Average ≥ 4 out of 5 |
| 🟡 Moderate | Amber | Average ≥ 3 out of 5 |
| 🟢 Low | Green | Average < 3 out of 5 |

---

*End of IrriGIS User Manual v1.2.5*