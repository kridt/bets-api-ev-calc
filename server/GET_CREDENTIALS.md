# Get Firebase Admin Credentials

You provided the **web config** (for frontend), but the server needs the **Admin SDK credentials**.

## What You Need

A **service account private key** - this is a JSON file that looks like this:

```json
{
  "type": "service_account",
  "project_id": "ev-bets-api",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-xxxxx@ev-bets-api.iam.gserviceaccount.com",
  ...
}
```

## How to Get It (2 Minutes)

### Step 1: Go to Firebase Console

Open this link:
https://console.firebase.google.com/project/ev-bets-api/settings/serviceaccounts/adminsdk

(This goes directly to your project's service accounts page)

### Step 2: Generate Key

You'll see a page titled **"Service accounts"**

1. Look for the section: **"Firebase Admin SDK"**
2. Click the button: **"Generate new private key"**
3. A popup will appear - click **"Generate key"**
4. A JSON file will download automatically

### Step 3: Save the File

**Option A: Simple (Recommended)**

1. Rename the downloaded file to exactly: `serviceAccountKey.json`
2. Move it to: `server/config/serviceAccountKey.json`
3. Done! The server will automatically use it.

**Option B: Environment Variables**

1. Open the downloaded JSON file
2. Copy these 3 values to `server/.env`:

```bash
FIREBASE_PROJECT_ID=ev-bets-api
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@ev-bets-api.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYourLongKeyHere\n-----END PRIVATE KEY-----\n"
```

## Verify It Works

Start the server:

```bash
cd server
npm install
npm run dev
```

You should see:
```
[Firebase] Initialized with service account key
✅ All schedulers initialized successfully
```

If you see this instead:
```
[Firebase] Initialization error: ...
```

Then the credentials aren't configured correctly.

## Troubleshooting

**"Cannot find module './serviceAccountKey.json'"**
- The file isn't in the right location
- Should be: `server/config/serviceAccountKey.json`
- Check the filename is exact (case-sensitive)

**"Invalid service account"**
- You might have the web config instead
- Make sure the JSON file has a "private_key" field
- The web config has "apiKey" field (wrong one)

**"Permission denied"**
- The service account needs Firestore permissions
- Go to: Firebase Console → Firestore → Rules
- Make sure read/write is enabled

## Security Note

⚠️ **Keep this file secret!**

The service account key gives full admin access to your Firebase project.

- Never commit it to git
- Don't share it publicly
- Don't post it online

It's already in `.gitignore` so it won't be committed by accident.
