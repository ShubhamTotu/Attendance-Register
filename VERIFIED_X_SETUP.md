# Verified X Setup

This version no longer trusts a typed `@handle`.

Users must:
1. share the exact post: `I'm still Present. Are you?`
2. verify with X OAuth
3. mark attendance with their verified X account

## 1. Update Supabase

Run [supabase-schema.sql](/Users/shubhamtotu/Documents/Codex/supabase-schema.sql) in Supabase SQL Editor again.

This migration:
- adds `x_user_id` to `attendance_entries`
- creates `x_auth_sessions`
- removes anonymous insert access
- keeps public reads open

## 2. Create or Update Your X App

In the X Developer portal:
- enable OAuth 2.0
- set the callback URL to your live callback endpoint
- use these scopes:
  - `tweet.read`
  - `users.read`
  - `offline.access`

### Callback URL

Set it to:

```text
https://YOUR_DOMAIN/api/auth/callback
```

If you are still using the default Vercel URL, it will look like:

```text
https://YOUR_PROJECT.vercel.app/api/auth/callback
```

The callback URL must exactly match the value you put in Vercel.

## 3. Add Vercel Environment Variables

In Vercel:
- Project
- `Settings`
- `Environment Variables`

Add:

```text
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SESSION_SECRET=a_long_random_secret
X_CLIENT_ID=your_x_oauth_client_id
X_CLIENT_SECRET=your_x_oauth_client_secret
X_REDIRECT_URI=https://YOUR_DOMAIN/api/auth/callback
```

### SESSION_SECRET

Use a long random value. Example from terminal:

```bash
openssl rand -base64 32
```

## 4. Redeploy

After:
- the new SQL is run
- the Vercel env vars are saved

push the repo again or trigger a redeploy from Vercel.

## 5. How The Flow Works

On the live site:
- `Share` opens the public promo post template
- `Verify with X` signs the user in
- `Mark attendance` checks their recent X posts for the exact line
- if found, the verified X handle is written to the register
