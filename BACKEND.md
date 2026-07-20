# BuildTrack Backend

This backend is designed for Firebase because the current app already uses Firebase Auth and Firestore.

## What It Provides

- Creates a default Firestore profile when a Firebase Auth user is created.
- Lets a `superior` create managed users from the backend.
- Lets a `superior` update a user's role, site, and status.
- Builds weekly report data from one site document.
- Deploys Firestore rules from `firestore.rules`.

## Files

- `firebase.json` - Firebase project config.
- `.firebaserc` - points to project `build-tracker-9bc79`.
- `firestore.rules` - Firestore security rules.
- `functions/index.js` - Cloud Functions backend.
- `functions/package.json` - backend dependencies and scripts.

## Deploy

Install dependencies once:

```sh
cd functions
npm install
```

Deploy functions and rules:

```sh
npm run deploy
```

Or from the repo root:

```sh
firebase deploy --only functions,firestore:rules
```

## How the frontend uses this

The HTML app talks to Firebase Auth REST and Firestore REST directly:

- Signups create a `pending` profile; the rules block pending accounts from reading any data until a superior approves them from the Users page (which updates the profile document directly — `createManagedUser`/`updateUserProfile` above are optional server-side alternatives).
- Full-size site photos are stored one-per-document in the `photos` collection; daily logs keep only small inline thumbnails so the per-site document stays under Firestore's 1MB limit.
- `buildWeeklyReportData` is available but not yet called by the frontend.

After changing `firestore.rules`, redeploy them with `firebase deploy --only firestore:rules` — the app is not protected until the deployed rules match this repo.
