# Hosted Supabase authentication email

Apply `magic-link.html` to **Authentication → Email Templates → Magic Link** in the hosted Supabase dashboard.

- Subject: `【縦糸横糸ブック】あなたの物語を開く`
- Body: `magic-link.html`

The template intentionally contains both `{{ .ConfirmationURL }}` and `{{ .Token }}`. The link is the primary path; the one-time code remains available when the mail app cannot open the link.

Keep authentication-email link tracking disabled so the provider does not rewrite the one-time URL.
