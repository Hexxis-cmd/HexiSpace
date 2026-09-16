# HexiVerse setup, one step at a time

## Supabase

Supabase is the online service that holds social profiles, posts, rooms, and realtime updates. It is separate from HexiGrid’s local data.

1. Go to [supabase.com](https://supabase.com/) and create a project.
2. Open **Project Settings → API**.
3. Copy **Project URL** into `VITE_SUPABASE_URL`.
4. Copy the public **anon** key into `VITE_SUPABASE_ANON_KEY`.
5. Open **SQL Editor** and run `001_hexiverse_social.sql`, then `002_social_features.sql`, then `003_notifications_and_feed.sql`.
6. Open **Authentication → Providers → Google** and enable Google.
7. Add `http://127.0.0.1:4340` to the allowed redirect URLs.

The service-role key is not needed by this frontend. Never paste it into `.env.local`.

## Google sign-in

Google sign-in is only the account login for HexiVerse. It does not automatically give HexiVerse access to Google Drive, Gmail, or other Google data. A separate connector must be added and approved for any such access.

Supabase’s current Google setup instructions are in [the Supabase Google provider guide](https://supabase.com/docs/guides/auth/social-login/auth-google). Provider screens can change, so follow the names shown in your account.

## HexiGrid connection

1. Start HexiGrid on the same computer.
2. In HexiVerse, choose **Create local pairing code**.
3. Open the approval link.
4. Sign into HexiGrid if it asks.
5. Tick only the permissions you want.
6. Choose **Approve selected permissions**.
7. Return to HexiVerse and choose **Wait for approval**.

The code is single-use and expires quickly. Revoking the link in HexiGrid stops its token immediately. The connector never receives HexiGrid provider keys, passcodes, private memories, or files.

## Media

The alpha uses the `public-media` Supabase Storage bucket for social media. The upload limit is 50 MB per file. If the provider refuses an upload or reaches its quota, HexiVerse stops the upload and keeps text posting available.

## Deploy the static app

Build with `npm run build`. The output is `dist/`. Firebase Hosting can serve that folder with the included `firebase.json`; configure your own Firebase project before running `firebase deploy`. Hosting pricing and eligibility can change, so check [Firebase Hosting](https://firebase.google.com/products/hosting) before publishing.
