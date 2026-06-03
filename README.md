# Daily Courier Report System

A simple React + Vite web app for entering daily courier branch data and exporting official-looking reports as PNG or PDF for WhatsApp sharing.

## Features

- Dashboard with today's date, quick actions, and saved date history
- Saved courier name list for faster daily entry
- Branch Courier Performance report with automatic Delivery % calculation
- Operation Report with Inward/Outward wording and grouped table headings
- Stable dispatch target setting with automatic Outward Achievement %
- Settings page for company header, stable target, saved courier names, and backup tools
- Edit/delete rows and save reports by date in LocalStorage
- All-in-one JSON backup export and restore
- Weekly auto backup download when the app is opened
- Firebase Analytics and Firestore cloud sync
- Manual cloud upload/download plus optional realtime sync from Settings
- Export each report as PNG or PDF
- Export both reports into one A4 landscape PDF
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

## Storage

The first version uses `localStorage`. The storage code is isolated in `src/services/reportStorage.js` so Firebase or Supabase can be added later without rewriting the UI.

## Firebase

Firebase is configured in `src/services/firebase.js`.

To use Firestore sync:

1. Open Firebase Console.
2. Enable Cloud Firestore for the `domex-new-report` project.
3. Set suitable Firestore security rules for your office use.
4. Open app Settings and use `Upload Local to Cloud`, `Download Cloud to Local`, or enable `Firestore realtime sync`.
