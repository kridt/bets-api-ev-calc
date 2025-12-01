# Firebase Setup Guide

This server uses the **same Firebase project** as your NBA frontend, but creates separate EPL collections.

## Quick Setup (Recommended)

### 1. Get Your Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your existing project (the one used for NBA tracking)
3. Click the **gear icon** ⚙️ next to "Project Overview" → **Project settings**
4. Go to the **"Service accounts"** tab
5. Click **"Generate new private key"**
6. Click **"Generate key"** to download the JSON file

### 2. Configure the Server

**Option A: Using JSON file (Easiest)**

1. Rename the downloaded file to `serviceAccountKey.json`
2. Place it in: `server/config/serviceAccountKey.json`
3. That's it! The server will automatically use it.

**Option B: Using Environment Variables**

1. Open the downloaded JSON file
2. Copy these values to your `server/.env` file:
   ```bash
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourKeyHere\n-----END PRIVATE KEY-----\n"
   ```

## Collections Structure

The server creates these NEW collections (won't affect NBA data):

```
your-firebase-project/
├── predictions              ← Existing NBA data (unchanged)
├── epl_matches             ← NEW: EPL matches
├── epl_predictions         ← NEW: EPL probability predictions
├── epl_odds_snapshots      ← NEW: Odds tracking (every 2 min)
├── epl_value_bets          ← NEW: Detected value bets
├── epl_results             ← NEW: Match results & verification
└── epl_tracking_stats      ← NEW: Daily ROI/performance stats
```

## Verify It Works

1. Start the server:
   ```bash
   cd server
   npm install
   npm run dev
   ```

2. You should see:
   ```
   [Firebase] Initialized with service account key
   ✅ All schedulers initialized successfully
   ```

3. Check the API:
   ```
   http://localhost:4000/api/health
   ```

## Firestore Security Rules (Optional)

If you want to restrict access, add these rules in Firebase Console:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Existing NBA rules
    match /predictions/{document=**} {
      allow read, write: if true;
    }

    // New EPL rules (server-only access)
    match /epl_{collection}/{document=**} {
      allow read: if true;  // Allow frontend to read
      allow write: if false; // Only server can write
    }
  }
}
```

## Troubleshooting

**"Permission Denied" Error**
- Make sure you downloaded the service account key (not the web config)
- Check the file is named exactly `serviceAccountKey.json`
- Verify it's in the correct path: `server/config/serviceAccountKey.json`

**"Project ID not found"**
- Make sure you're using the service account JSON (has "private_key" field)
- Don't use the web config (has "apiKey" field)

**Collections not appearing**
- The collections are only created when data is first written
- Run the server and wait for the first stats scan (happens immediately)
- Check Firebase Console > Firestore Database after a few minutes

## View Your Data

Go to Firebase Console > Firestore Database to see all collections:

- **epl_matches**: Upcoming EPL matches
- **epl_predictions**: Probability predictions (updated every 3 hours)
- **epl_odds_snapshots**: Historical odds (updated every 2 minutes)
- **epl_value_bets**: Current value betting opportunities
- **epl_results**: Verified results and outcomes
- **epl_tracking_stats**: Daily performance metrics

Your NBA data in the `predictions` collection remains completely separate and unchanged.
