# Hosted Supabase authentication email

Apply these files in **Authentication → Email Templates** in the hosted Supabase dashboard.

- **Magic Link / OTP**
  - Subject: `【縦糸横糸ブック】あなたの物語を開く`
  - Body: `magic-link.html`
- **Confirm sign up**
  - Subject: `【縦糸横糸ブック】最初の登録を完了する`
  - Body: `confirm-sign-up.html`

Both templates intentionally contain `{{ .ConfirmationURL }}` and `{{ .Token }}`. The link is the primary path; the one-time code remains available when the mail app cannot open the link.

Keep authentication-email link tracking disabled so the provider does not rewrite the one-time URL.

## Authentication URL configuration

Use the production deployment as the default destination for authentication links.

- Site URL: `https://www.tateito-yokoito.jp`
- Redirect URL: `https://www.tateito-yokoito.jp/**`
- Redirect URL: `https://tateito-yokoito.jp/**`

Keep `https://tateyoko-book.vercel.app/**` temporarily only when direct Vercel deployment testing is still needed. Do not allow the retired `https://koe-project.github.io` origin.
