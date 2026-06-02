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
npm run dev
```

Open the local URL shown in the terminal, usually:

```text
http://127.0.0.1:5173
```

## Storage

The first version uses `localStorage`. The storage code is isolated in `src/services/reportStorage.js` so Firebase or Supabase can be added later without rewriting the UI.

## Firebase

Firebase is configured in `src/services/firebase.js`.

To use Firestore sync:

1. Open Firebase Console.
2. Enable Cloud Firestore for the `domex-new-report` project.
3. Set suitable Firestore security rules for your office use.
4. Open app Settings and use `Upload Local to Cloud`, `Download Cloud to Local`, or enable `Firestore realtime sync`.
