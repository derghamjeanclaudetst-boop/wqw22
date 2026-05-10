---
title: Data Import Tool — Legacy Migration
---
# Data Import Tool — Legacy Migration

  ## What & Why
  Build a safe, guided data import system inside NOVIQ so the user can migrate all existing data (technicians, work orders, payments, invoices) from their old system (PostgreSQL or exported files) into NOVIQ without data loss or corruption.

  The old system may have a completely different field structure, so the import must handle field mapping, validation, dry-run preview, and transactional rollback on failure. This is mission-critical: the old data must never be damaged or lost during the process.

  ## Done looks like
  - A new "Data Import" page is accessible from the sidebar (admin only)
  - User can upload a CSV file for each data type: Technicians, Work Orders, Payments, Invoices
  - After upload, a field-mapping step shows the old column names on the left and lets the user match each one to the correct NOVIQ field on the right
  - A "Preview Import" button runs a full dry-run: reads all rows, validates required fields, detects duplicates, and shows a preview table of what will be inserted — with a row-by-row warning/error column
  - Nothing is written to the database during the preview step
  - A "Confirm Import" button runs the actual import inside a database transaction — if anything fails mid-import, the entire batch rolls back automatically
  - After import, a results report shows: total rows, successfully imported, skipped (duplicates), failed (with reason per row)
  - A separate "SQL Direct Import" section (admin-only, clearly marked as advanced) lets the user paste a PostgreSQL `INSERT` or `COPY` statement or upload a `.sql` dump file for direct execution — useful when they already have a proper SQL export from their old PostgreSQL system
  - All imports are append-only — existing records are never overwritten or deleted
  - Work order numbers from the old system are preserved as `clientWorkOrderNumber` so traceability is maintained even if NOVIQ assigns a new internal number

  ## Out of scope
  - Migrating W9 document files (those need to be re-uploaded manually per technician after import)
  - Real-time sync or live connection to the old system
  - Migrating user accounts and passwords (security risk — users should be re-invited)
  - Migrating chat/message history

  ## Steps
  1. **Backend import API** — Add `POST /api/import/preview` and `POST /api/import/confirm` endpoints for each data type (technicians, work-orders, payments, invoices). Preview validates and returns a dry-run result with per-row status. Confirm runs the same logic inside a single database transaction with full rollback on any failure. Also add `POST /api/import/sql` for executing a raw SQL dump (admin only, wrapped in a transaction).
  2. **Field mapping logic** — For each data type, define the NOVIQ canonical field list and required vs optional fields. The preview endpoint accepts an array of raw objects (from CSV upload) plus a field-mapping object, applies the mapping, validates required fields, detects duplicates by natural key (email for technicians, work order number for work orders), and returns per-row status.
  3. **CSV upload and parsing** — On the frontend, build a multi-step import wizard: (a) choose data type, (b) upload CSV, (c) map fields visually, (d) preview results, (e) confirm. Use Papa Parse in the browser to parse the CSV client-side before sending to the API.
  4. **Import results report** — After confirm, display a clear summary: rows imported, skipped, failed — with an expandable table showing each failed row and the reason. Allow downloading the report as CSV.
  5. **SQL direct import section** — Add a collapsible advanced section on the import page where the user can paste SQL or upload a `.sql` file. The backend executes it inside a transaction and returns row counts per statement. Clearly warn the user that this is for advanced PostgreSQL users only.
  6. **Sidebar navigation** — Add the "Data Import" link to the sidebar, visible only to users with the `admin` role.

  ## Relevant files
  - `shared/schema.ts`
  - `server/routes.ts`
  - `server/storage.ts`
  - `server/db.ts`
  - `client/src/App.tsx`
  - `client/src/components/layout/sidebar.tsx`
  - `client/src/pages/technicians.tsx`
  - `client/src/pages/work-orders.tsx`