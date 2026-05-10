# AI-Assisted Import Intelligence

  ## What & Why
  Enhance the Data Import Tool (Task #1) with AI-powered field mapping, data cleaning, anomaly detection, and per-row confidence scoring. With 300+ technicians and 200+ work orders, manual column mapping and data review is impractical. The AI layer reduces that from hours of manual work to minutes of reviewing AI suggestions.

  ## Done looks like
  - After uploading a CSV, the AI automatically analyzes all column names and suggests the best NOVIQ field match for each one, with a confidence percentage shown next to each suggestion
  - The user can accept all suggestions with one click or adjust individual mappings — no manual matching required for well-named columns
  - AI detects the date format in the file automatically and converts all date values to the correct format NOVIQ expects
  - AI detects status value mappings: if the old system uses "done", "closed", "open", it maps them to NOVIQ's "completed", "completed", "pending" — and shows the user the mapping table so they can verify
  - AI splits full names into firstName + lastName automatically
  - AI normalizes phone numbers to a consistent format
  - Before the dry-run preview, an anomaly report flags: duplicate emails, work orders referencing unknown technicians, suspiciously high payment amounts, and missing critical fields
  - Each row in the preview table has a confidence badge: green (safe to import), yellow (review suggested), red (will fail or likely incorrect)
  - The user can bulk-approve all green rows and only manually handle yellow/red ones — critical for 300-technician imports
  - A summary shows: "287 rows ready, 9 need review, 4 will be skipped"

  ## Out of scope
  - AI does not automatically fix data errors — it flags them, the user decides
  - AI does not connect to the old system directly — it only analyzes the uploaded file
  - Real-time AI monitoring of ongoing operations (separate future feature)

  ## Steps
  1. **AI field mapping service** — Add a backend endpoint that accepts a list of column names from the uploaded file and returns AI-suggested NOVIQ field mappings with confidence scores. Use the OpenAI API (or a built-in heuristic matcher as fallback if no API key is set). Cache results so the same column names don't get re-analyzed on every upload.
  2. **Smart data transformation** — Add a transformation pipeline that runs before the dry-run preview: auto-detect date formats, normalize phone numbers, split full names, and map old status values to NOVIQ equivalents. Show the user what transformations were applied.
  3. **Anomaly detection engine** — Before the dry-run, scan the entire dataset for: duplicate natural keys (email, work order number), cross-reference mismatches (work order references a technician email not in the technician import), values that are statistical outliers (payment amounts), and missing required fields. Return a grouped anomaly report.
  4. **Confidence scoring UI** — In the preview table, add a color-coded confidence badge per row based on: mapping completeness, anomaly flags, and data format validity. Add bulk-select controls so the user can approve all green rows at once and filter to only see yellow/red rows.
  5. **AI mapping UI panel** — On the field-mapping step, show the AI suggestions with confidence percentages. Add a one-click "Accept All Suggestions" button and allow individual overrides via dropdown. Show a diff between the AI suggestion and the user's final mapping.

  ## Relevant files
  - `server/routes.ts`
  - `client/src/pages/data-import.tsx` (created by Task #1)
  - `shared/schema.ts`
  