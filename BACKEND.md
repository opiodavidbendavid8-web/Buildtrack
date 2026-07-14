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

## Frontend Integration Still Needed

The current HTML app still directly calls Firebase Auth REST and Firestore REST. The next step is to update it to call these backend functions for:

- creating users
- approving/updating roles
- generating weekly report data

Direct Firestore reads/writes can remain for normal site data as long as rules are strict.
