# Firebase Security Rules Setup

## Problem
You're getting: `FirebaseError: Missing or insufficient permissions`

## Solution
You need to configure Firestore security rules to allow read/write access.

## Steps:

1. Go to Firebase Console: https://console.firebase.google.com/project/ev-bets-api/firestore/rules

2. Replace the existing rules with:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read/write access to predictions collection
    match /predictions/{predictionId} {
      allow read, write: if true;
    }

    // Allow read/write to system collection (for connection tests)
    match /system/{document=**} {
      allow read, write: if true;
    }
  }
}
```

3. Click "Publish" to activate the rules

## Security Note
These rules allow public access (useful for development/testing).

For production, you should add authentication and restrict by userId:
```javascript
match /predictions/{predictionId} {
  allow read, write: if request.auth != null;
  // Or restrict to user's own predictions:
  // allow read, write: if request.resource.data.userId == request.auth.uid;
}
```

## After Setup
Once you've published the rules:
1. Refresh your browser at http://localhost:5174/
2. Click "Track All" again
3. You should see success logs in console
4. Check Firebase Console > Firestore Database to see the documents
