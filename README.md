# Daily Courier Report System

A simple React + Vite web app for entering daily courier branch data and exporting official-looking reports as PNG or PDF for WhatsApp sharing.

## Features

- DOMEX islandwide dashboard with scenic artwork, cream cards, a grouped top menu, report-date search, and a 7/14-day performance chart based on saved reports
- Responsive phone and tablet layouts; interface themes and regional branch switching are available from the profile menu
- Dashboard with today's date, quick actions, and saved date history
- Saved courier name list for faster daily entry
- Branch Courier Performance report with automatic Delivery % calculation
- Operation Report with Inward/Outward wording and grouped table headings
- Stable dispatch target setting with automatic Outward Achievement %
- Settings page for company header, stable target, saved courier names, and backup tools
- Edit/delete rows and save reports by date in LocalStorage
- All-in-one JSON backup export and restore
- Weekly auto backup download when the app is opened
- Firebase Analytics and Realtime Database cloud sync
- Automatic branch-scoped realtime sync plus manual cloud upload/download recovery actions
- Export each report as PNG or PDF
- Export both reports into one A4 landscape PDF
- Petty Cash Management with official CSV import, editable vouchers, automatic totals, and A4 landscape PNG/PDF exports
- Responsive desktop/mobile interface with large office-friendly controls

## Run

```bash
npm install
npm run dev:all
```

Open the local URL shown in the terminal, usually:

```text
http://127.0.0.1:5173
```

## WhatsApp Backend

WhatsApp sending uses a Node.js backend with Baileys. `npm run dev:all` starts both the frontend and backend together. You can also start them separately:

```bash
npm run server
```

Then open Settings in the app:

1. Go to `WhatsApp Settings`.
2. Click `Reconnect` if QR is not visible.
3. Scan the QR from WhatsApp Linked Devices.
4. Click `Fetch Groups`.
5. Select the report group and click `Save Group`.
6. Use `Send to WhatsApp` from the report/export area.

WhatsApp auth/session files are stored in `backend/data/` and are ignored by Git.

### Rider Meter Photo Monitor

Settings includes a selectable WhatsApp connection for daily rider meter-photo checks. It can share the already connected Primary Report WhatsApp account or use an independent monitor account without replacing or logging out the primary session.

1. Open `Settings > Meter Monitor`.
2. Choose `Use Primary Report WhatsApp`, or choose `Use Separate Monitor Account` and scan its independent QR code.
3. Fetch groups and select the group where riders post meter photos.
4. Load group members, select the required riders, and add readable names and WhatsApp phone numbers.
5. Confirm the fixed approval checkpoints (`08:00`, `11:00`, `17:00`, and `20:00`), enable the monitor, and save.

IN and OUT photos are recorded separately. Incoming selected-group photos are detected immediately and the monitor status is evaluated every 10 seconds. At each fixed checkpoint, the Meter WhatsApp sends an approval request to the connected Primary Report WhatsApp number. The selected group receives one reminder only after that request is reacted to with `👍`. Riders are mentioned in the group message, but private rider reminders are never sent.

Every Sunday is automatically treated as a branch holiday. Settings can also store branch-wide special holidays and rider-specific leave dates; those days/riders are excluded from photo checks and reminders. The monitor session is stored separately in `backend/data/whatsapp-meter-auth/`; the existing report account remains in its original auth directory.

### Meter Chats Dashboard

Admins can open `Meter Chats` to view the Meter Monitor account's private chats and groups, read synchronized messages, and send text replies. The dashboard follows the active Meter Monitor mode, so it works with either the primary report account or the separate meter account.

Chat history is stored only on the backend in `backend/data/meter-chat-store.json`. The store is capped per account and does not contain WhatsApp authentication files or downloaded media. Access is protected by a separate key stored in `backend/data/meter-chat-access-key`, or supplied with the `METER_CHAT_ACCESS_KEY` environment variable. Enter this key when the dashboard asks for it; the browser keeps it only for the current tab session.

## DOMEX Delivered Report Automation

The Delivered Report page reconciles an Out for Delivery PDF, a rider Delivered CSV, and the branch Reschedule CSV before creating the existing collection-value report.

Every rider Reschedule CSV upload also updates the daily Reschedule Report tab. Rows are grouped by date, deduplicated by Tracking No, and can be exported as A4 PNG pages or a multi-page A4 PDF.

When a Backup WhatsApp Number and Reschedule Report default groups are configured, the backend prepares the current day's branded Reschedule Report at 20:00 Asia/Colombo time and sends it to the approval number. The assigned groups receive the report only after the approval number reacts to that report with ✅. Other reactions are ignored, and duplicate sends are prevented. The Settings page also includes a manual `Send Today's Approval Now` test action.

Requirements:

- Google Chrome or Microsoft Edge installed on the VPS
- Latest project code and dependencies (`git pull` and `npm install`)
- The Node backend and Cloudflare tunnel kept running

Setup:

1. Open the app Settings page.
2. Find `DOMEX Delivered Report Automation`.
3. Enter the DOMEX username, password, and branch name, then save.
4. Open Delivered Report and upload the Out for Delivery PDF.
5. Upload or fetch the Rider Wise Delivered CSV, then upload the Reschedule CSV.

Credentials are stored only in `backend/data/domex-automation-config.json` on the VPS. The entire `backend/data/` directory is ignored by Git. Environment variables can be used instead:

```text
DOMEX_USERNAME=your-username
DOMEX_PASSWORD=your-password
DOMEX_BRANCH_NAME=Middeniya
DOMEX_BROWSER_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

### Vercel Deployment Note

The Vite frontend can be deployed on Vercel, but the Baileys WhatsApp backend needs an always-running Node.js server because it keeps a WhatsApp socket/session alive. Vercel static/serverless deployment will return `404` for `/api/whatsapp/status` unless a backend is hosted separately.

Recommended setup:

1. Deploy the frontend to Vercel as usual.
2. Deploy this backend on an always-on Node host such as Railway, Render, Fly.io, or a VPS.
3. On that backend host, run:

```bash
npm install
npm run server
```

4. Set backend environment variables:

```text
PORT=3001
ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app
```

5. In Vercel Project Settings → Environment Variables, add:

```text
VITE_WHATSAPP_API_BASE_URL=https://your-whatsapp-backend-domain.com
```

6. Redeploy the Vercel frontend.

### WhatsApp accounts per login

Each non-admin system login has its own WhatsApp QR session, connected number, report groups, backup snapshot, and send-queue scope. The existing admin WhatsApp remains in `backend/data/whatsapp-auth`; additional login sessions are stored separately under `backend/data/whatsapp-accounts/<login-key>/` and are never exposed to the frontend.

After deploying this version, each branch user opens `Settings > Report WhatsApp`, scans that login's QR, fetches its groups, and saves its own destinations. Back up the complete `backend/data/` directory when moving the VPS so every linked WhatsApp session is preserved.

## Rider Delivery Performance

Open **Reports → Rider Delivery Performance** (`/rider-delivery-performance/`) and upload a Rider Wise Delivery Count CSV. The importer reads date columns as day/month/year, uses actual daily-count totals, and leaves dates missing from the CSV marked as unavailable. Rider IDs are excluded from the derived report data.

Choose the branch and full CSV/month/custom period, then export the DOMEX board as PNG or A4 landscape PDF. Larger datasets use multiple pages with up to six riders and 31 dates per page. Save Report stores the derived report in the current branch workspace without replacing courier or Delivered reports; the latest saved report reopens after reload.

**Send to Default Group** queues report images to this login's existing default report groups. Configure those destinations in Settings → Report WhatsApp. Importing or saving a CSV does not send it to WhatsApp. Existing Courier Performance access includes the new report, and administrators can also assign its separate permission.

## WhatsApp Outbox and page links

Each branch login has an Outbox at `/whatsapp-queue/`. Pending and failed messages can be viewed, edited, retried or deleted. Clear All removes that account's queue/history while messages already sending finish. Sent messages cannot be recalled from the queue.

Sections have their own URLs, such as `/dashboard/`, `/courier/`, `/settings/` and `/delivered-report/`. Refreshing or using browser Back/Forward keeps the chosen section and still applies account permissions.

Delivered Report's **Export A4 PDF & Print** downloads the PDF and opens the print dialog within the same tab. Selected rider/group WhatsApp copies are submitted in the background. Their delivery status appears in the Outbox.

Reschedule automation requires a connected Report WhatsApp account, a Backup WhatsApp Number, at least one saved Reschedule Report group, and rows saved for that Sri Lanka date. Settings shows any missing requirements. The 20:00 scheduler retries later that day if a connection or report becomes available after the scheduled minute; groups still receive the report after the configured approval reaction.

## Storage

The first version uses `localStorage`. The storage code is isolated in `src/services/reportStorage.js` so Firebase or Supabase can be added later without rewriting the UI.

## Firebase

### Google login and branch access

The app keeps existing branch/password accounts and adds optional Firebase Google sign-in. Existing branch report paths and saved report data are not migrated or deleted.

1. Open Firebase Console > Authentication > Sign-in method.
2. Enable the Google provider and choose the project support email.
3. Enable the Anonymous provider. Existing branch/password users use a persisted anonymous Firebase session so Realtime Database sync can satisfy authenticated database rules; the app's own branch credentials and permissions still control the visible system sections.
4. Under Authentication > Settings > Authorized domains, add every frontend hostname used by the system, including `domexrep.vercel.app` and any custom frontend domain.
5. First-time Google users appear in the super admin `User Management` tab. The super admin must assign a branch and select the allowed sections before that account can enter the system.

User account metadata and pending Google approvals are stored under `reportSystemAdmin/users`. Branch reports and settings continue to use their existing isolated `reportSystems/domexDailyCourier_<branch>` paths.

Firebase is configured in `src/services/firebase.js`.

To use Firebase Realtime Database sync:

1. Open Firebase Console.
2. Enable Realtime Database for the `domexrep-e30c4` project.
3. Configure Realtime Database security rules appropriate for your office deployment.
4. Branch reports, settings, saved courier names, users, and weekly backups sync automatically after login.
5. Settings also provides manual `Upload Local to Cloud` and `Download Cloud to Local` recovery actions.
