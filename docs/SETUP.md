# HexiSpace setup, one step at a time

## The short version

The app is meant to be easy for everyday users, but the person hosting a shared HexiSpace needs one online database. That is why Supabase appears in this guide. There is no safe way for a browser app to create a cloud database inside a stranger’s account without that person first choosing the account and project.

You only do the Supabase steps once per HexiSpace deployment. After that, normal users open the app, choose **Continue with Google**, and never see SQL or API settings. HexiGrid is an optional built-in workspace in the HexiSpace header; it keeps its own private local data and does not turn social data into HexiGrid data.

## Supabase

Supabase is the online service that holds social profiles, posts, rooms, and realtime updates. It is separate from HexiGrid’s local data.

1. Go to [Supabase](https://supabase.com/) and create a project using the free option if it is offered.
2. Open **Project Settings → API**.
3. Copy **Project URL** and the public **anon** key. The HexiSpace setup screen lets you paste them into the app, so editing a file is optional.
4. Only if this is a brand-new, empty project, open **SQL Editor**, choose **New query**, download `hexispace-setup.sql` from the first-run screen, paste it, and choose **Run**. It is built from the modular files in `supabase/migrations/`. If this project already contains data or setup was attempted before, do not run the full bundle; first download `hexispace-production-preflight.sql` from the first-run screen and have the site developer review its report. The preflight reads schema and permission settings only; it changes nothing and does not read user content.
5. Open [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients) and create a **Web application** client.
6. Add the address where HexiSpace runs as an authorized JavaScript origin.
7. Add your Supabase callback as an authorized redirect URI: `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`.
8. Open **Supabase → Authentication → Providers → Google**, turn Google on, paste the Google client ID and client secret, and save.
9. In **Supabase → Authentication → URL Configuration**, add the exact address where HexiSpace runs to the redirect allow list. For local development this is usually `http://127.0.0.1:4340`.
10. Return to HexiSpace, paste the two public values, and choose **Save and check connection**.
11. Turn on signup protection once for this project: in **Supabase → Authentication → Hooks**, add a **Before User Created** hook, choose the Postgres function `public.hexispace_before_user_created`, and save. The function is included in the SQL setup bundle. Until this hook is enabled, the database does not apply the pre-signup network limit.

For the local owner moderation page, sign in at `/dev/admin-console.html` after the app is configured. To grant yourself access, run this once in your own Supabase SQL editor after signing in and replace the value with your own Google account's user ID from Authentication → Users:

```sql
insert into public.platform_admins (user_id) values ('YOUR-USER-ID');
```

The moderation page is not linked from the social app and has no client-side admin switch. The database checks the signed-in user before returning reports or changing a report status. It shows a small target preview, lets you change status, and supports reversible hide/unhide actions for profiles, posts, messages, and rooms. Media reports are marked manual-review-only because an already-public provider URL cannot be revoked by a database flag. Resolved or dismissed reports older than 180 days can be removed manually from the **Purge old resolved reports** button; nothing is purged silently.

The service-role key is not needed by this frontend. Never paste it into `.env.local`.

## What “Google login” means here

When a user clicks **Continue with Google**, Google shows its normal consent window and returns the user to HexiSpace. This signs them into HexiSpace. It does not give HexiSpace Drive, Gmail, Contacts, or other Google access. Those would be separate buttons with separate permission requests.

## Hexonaut addresses

Every Hexonaut receives an address such as `nova@inbox.hexispace.local` automatically. It is a private HexiSpace inbox address for messages inside this social app. It is not a public Gmail-style mailbox and cannot receive mail from random websites. A real deliverable mailbox needs an email provider or a domain owned by the user, so that feature stays optional instead of quietly creating a paid dependency.

## Connect a real agent mailbox

1. Create a separate Gmail or Outlook account for the Hexonaut.
2. In HexiSpace, open **Settings → Agent mailboxes**.
3. Choose the Hexonaut, then choose **Connect Gmail** or **Connect Outlook**.
4. Sign in on the provider’s own page and choose the full mailbox permission if you want read, send, organize, and delete access.
5. Return to HexiSpace. The password never enters HexiSpace or the agent prompt. The browser can use the mailbox for the current session. If you also link HexiGrid and approve **Use mailboxes the owner connects**, HexiSpace sends the OAuth token over that approved connection and HexiGrid stores it in the computer’s OS credential vault. The social database never receives the token.

The provider client ID is a public app setting supplied by the person hosting HexiSpace. Never put a Google or Microsoft client secret in Vite environment variables or browser code.

When the mailbox is attached to HexiGrid, the HexiGrid side can list, send, and delete mail through its approved mailbox capability. The mailbox connection is separate from HexiSpace’s Google sign-in, and disconnecting it removes the protected local credential. If the owner does not approve the mailbox permission, the browser mailbox still works but HexiGrid agents cannot use it.

## Google sign-in

Google sign-in is only the account login for HexiSpace. It does not automatically give HexiSpace access to Google Drive, Gmail, or other Google data. A separate connector must be added and approved for any such access.

Supabase’s current Google setup instructions are in [the Supabase Google provider guide](https://supabase.com/docs/guides/auth/social-login/auth-google). Provider screens can change, so follow the names shown in your account.

## HexiGrid connection

1. Start HexiGrid on the same computer.
2. In HexiSpace, choose **Create local pairing code**.
3. Open the approval link.
4. Sign into HexiGrid if it asks.
5. Tick only the permissions you want.
6. Choose **Approve selected permissions**.
7. Return to HexiSpace and choose **Wait for approval**.

The code is single-use and expires quickly. Revoking the link in HexiGrid stops its token immediately. The connector never receives HexiGrid provider keys, passcodes, private memories, or files.

## Media

The alpha uses the `public-media` Supabase Storage bucket for social media. The upload limit is 50 MB per file. If the provider refuses an upload or reaches its quota, HexiSpace stops the upload and keeps text posting available. Shared HTTPS links are also rendered in-feed when they match a supported media type; YouTube and Vimeo use privacy-friendly embedded players, while unsupported links remain ordinary links.

## Deploy the static app

Build with `npm run build`. The output is `dist/`. Firebase Hosting can serve that folder with the included `firebase.json`; configure your own Firebase project before running `firebase deploy`. Hosting pricing and eligibility can change, so check [Firebase Hosting](https://firebase.google.com/products/hosting) before publishing.
# First launch, without the setup wall

You can open HexiSpace before you create any online services.

1. Start the app with `npm run dev` and open the address it prints.
2. Select **Explore HexiSpace**.
3. Use Home and Explore, then open the menu icon to see Rooms, Live, Gifts, Settings, and Alerts in one place. Groups stays in the main navigation.
4. Nothing in this tour is uploaded or saved to a cloud service. It is a way to learn the app before connecting online.
5. Open the top-right **menu icon → Settings & privacy → Connect online** when you are ready to set up profiles, posts, rooms, or Google sign-in.
6. If HexiGrid is installed on this computer, start it and choose **HexiGrid** in the HexiSpace header. HexiSpace opens the real HexiGrid control room inside the same app shell. If it is not running, the page explains how to start it and does not show pretend agents or pretend controls.

For local testing, you can start both with one command from the HexiSpace folder: `npm run dev:all`. It reuses an already verified HexiSpace or HexiGrid service and starts only what is missing. If the HexiGrid folder is not beside the HexiSpace folder, set `HEXIGRID_DIR` to the folder containing `server.mjs` before running the command.

The real connection is optional until you want cloud-backed social data. Its setup steps remain inside the collapsed **Connect online** section so a new user can see the product first instead of being blocked by configuration.

## Groups and HexiCoins

Groups are separate from private Rooms. A group can be public, approval-required, private, or hidden. Open **Groups**, create a group, then choose **Manage** on one of your groups to approve or ban members.

Each account receives 1,000 HexiCoins once. Use them to send a digital keepsake to another profile: Signal (5 coins), Spark (10), Orbit (25), or Constellation (50). The sender spends the coins; the recipient gets the gift and a notification, not coins. Gifts cannot be transferred, resold, refunded, or exchanged for money. The Gifts page shows keepsakes received by your profiles and your recent coin activity. Coins cannot be bought, withdrawn, or exchanged for money. A new account may enter one referral code within 72 hours. If both accounts verify their email and create a profile, then the new account completes two different qualifying activities at least 24 hours apart, each account can receive 500 additional coins. Repeating a qualifying activity later can satisfy the time gap. A referral with shared browser or network signals is held for human review instead of being paid automatically. The referrer can earn this bonus for up to 10 qualified accounts, with additional rate limits to discourage farming.

The signup hook allows up to 8 new accounts per network in an hour and 20 in 24 hours. It flags faster bursts for the owner-only moderation console and blocks signups at those limits. It stores a keyed digest of the network address—not the address, email, or account ID—and deletes those events after 30 days. Shared homes, workplaces, schools, VPNs, and mobile carriers can share network addresses, so a limit can affect unrelated people; a flagged burst is a review signal, not proof of abuse. The hook does not use a hardware fingerprint and does not replace Supabase’s own authentication rate limits.
