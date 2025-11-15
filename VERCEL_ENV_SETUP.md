# Vercel Environment Variables Setup

## ⚠️ IMPORTANT: Required Action

Your Firebase API keys have been removed from the source code for security. You **must** add them to Vercel's environment variables for the app to work in production.

## Steps to Add Environment Variables to Vercel

### Option 1: Via Vercel Dashboard (Recommended)

1. Go to your Vercel project: https://vercel.com/dashboard
2. Select your project: `bets-api-ev-calc`
3. Click on **Settings** tab
4. Click on **Environment Variables** in the left sidebar
5. Add the following variables:

```
VITE_FIREBASE_API_KEY = AIzaSyA4p1B1ybLyJjw9w6ipUSOKsq8KLTutVfE
VITE_FIREBASE_AUTH_DOMAIN = ev-bets-api.firebaseapp.com
VITE_FIREBASE_PROJECT_ID = ev-bets-api
VITE_FIREBASE_STORAGE_BUCKET = ev-bets-api.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID = 310316504610
VITE_FIREBASE_APP_ID = 1:310316504610:web:ac7850fb06296c8687dc7b
VITE_BALLDONTLIE_API_KEY = 4ff9fe15-7d31-408f-9a08-401d207e193e
```

6. For each variable:
   - Click **Add New**
   - Enter the variable name (e.g., `VITE_FIREBASE_API_KEY`)
   - Enter the value
   - Select environment(s): **Production**, **Preview**, and **Development**
   - Click **Save**

7. After adding all variables, **redeploy** your application:
   - Go to **Deployments** tab
   - Click the **...** menu on the latest deployment
   - Click **Redeploy**

### Option 2: Via Vercel CLI

```bash
vercel env add VITE_FIREBASE_API_KEY
# Enter the value when prompted
# Select Production, Preview, Development

# Repeat for all other variables
```

## Verify Setup

After redeploying, check your production site:
- Basketball page should load without errors
- Predictions should display
- Tracking functionality should work

## Security Recommendations

### 🔒 Consider Rotating Your Firebase API Key

Since your Firebase API key was previously exposed in the git history:

1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project: `ev-bets-api`
3. Go to **Project Settings** > **General**
4. Under **Your apps**, find your web app
5. Consider regenerating the API key if sensitive
6. Update both `.env` locally and Vercel environment variables with the new key

**Note:** Firebase API keys for web apps are generally safe to expose (they're meant to be public), but it's good practice to restrict them using Firebase Security Rules and App Check.

## Troubleshooting

**Issue:** Vercel build fails with "Firebase config missing"
**Solution:** Make sure all `VITE_FIREBASE_*` variables are added to Vercel

**Issue:** App works locally but not in production
**Solution:** Verify environment variables are set for "Production" environment in Vercel

**Issue:** Changes not reflected after adding variables
**Solution:** Trigger a new deployment (redeploy from Deployments tab)
