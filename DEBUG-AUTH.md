# Auth Debug Guide

## Step 1: Check what's happening on the callback page

Open `http://localhost:3005/auth/callback` in your browser and look at:
- Does it say "Verifying..." or "Failed"?
- Does it show "Token: present" or "Token: none"?
- Does it show a type?

## Step 2: What URL do you see after clicking the email link?

When you click the magic link in your email, what URL do you end up on?

It should look like:
```
http://localhost:3005/auth/callback?token=XXXX&email=admin%40saccobuilt.com&type=signup&redirect_to=http://localhost:3005/auth/callback
```

Or possibly:
```
http://localhost:3005/auth/callback?token=XXXX&email=admin%40saccobuilt.com&type=email
```

## Step 3: Check browser console

Press F12 → Console tab when on the auth/callback page and tell me what messages you see.

## Step 4: The magic link URL

The magic link from Supabase looks like:
```
https://cxiusuewtrvcpqequueh.supabase.co/auth/v1/verify?token=XXXX&type=signup&redirect_to=http://localhost:3005/auth/callback
```

When you click it, you should be redirected to:
```
http://localhost:3005/auth/callback?token=XXXX&email=admin%40saccobuilt.com&type=signup
```

Are you seeing that URL in your browser after clicking the email link?

## Possible fix if nothing works:

The magic link might be redirecting to the Supabase verify page first, which then redirects to localhost. This can cause the token to be consumed on the Supabase side before it reaches your callback page.

**Quick workaround:** Copy the full `token` value from the magic link URL in your email and tell me what the URL looks like.