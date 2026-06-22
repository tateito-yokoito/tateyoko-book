# Koe BOOK Production Readiness 1-6

## Scope

This kit covers the first six production-readiness items:

1. Vite + React build
2. Favicon / OGP / custom-domain-ready structure
3. Data retention policy draft
4. Permission/RLS design draft
5. Minimal admin review direction
6. Simple audit log table

## Repository URL

From the GitHub screen, the repository URL is:

```text
https://github.com/koe-project/koe-app
```

## Step 1: Vite + React

Copy these files into the root of the repository:

```text
package.json
index.html
vite.config.js
postcss.config.js
tailwind.config.js
.env.example
src/main.jsx
src/App.jsx
src/index.css
scripts/migrate-v1-html.mjs
public/favicon.svg
public/og-image.svg
```

Then run:

```bash
npm install
npm run migrate:v1
npm run dev
```

The migration script expects the current working HTML here:

```text
koe-1e/v1-backup260622.html
```

If the production file has another name, pass it explicitly:

```bash
npm run migrate:v1 -- koe-1e/v1.html
```

## Step 2: Favicon / OGP / Domain

This kit includes:

```text
public/favicon.svg
public/og-image.svg
```

For GitHub Pages under:

```text
https://koe-project.github.io/koe-app/
```

`vite.config.js` uses:

```js
base: "/koe-app/"
```

If a custom domain serves this app at the root path, change it to:

```js
base: "/"
```

## Step 3: Data Retention Policy Draft

Recommended beta policy:

| Data | Beta default | User-facing promise |
|---|---|---|
| Raw audio | Keep while the book project is active | Used for review, re-editing, and future voice playback |
| Transcript raw | Keep while the account/project exists | Preserved as the original text record |
| Edited transcript | Keep while the account/project exists | Used for book production |
| Photos | Keep while attached to an answer | User can request deletion |
| Activity logs | Keep for 180 days initially | Used for security and support |
| Deleted account/project | Soft-delete first, then purge after an operational window | Avoid accidental loss while respecting deletion requests |

Before paid launch, turn this into:

```text
Terms of Service
Privacy Policy
Recording consent
AI processing consent
Deletion request process
```

## Step 4: Permission/RLS Design Draft

Use role separation from the beginning:

| Role | Meaning | Access |
|---|---|---|
| self | Speaker / subject | Own project, own answers, own media |
| owner | Purchaser / project owner | Project progress and completed output |
| supporter | Family helper | Limited project support and photo/review access |
| editor | Internal or outsourced editor | Assigned content only |
| admin | Koe operator | Support, review, correction, incident response |

Do not rely only on frontend hiding. Enforce access in Supabase RLS.

## Step 5: Minimal Admin Review

For the first 300 users, a simple admin view is enough:

```text
Project list
Answer list
Audio/transcript preview
Edited text review
Re-run transcription/polish
Mark review status
```

Suggested statuses:

```text
draft
recorded
transcribed
polished
needs_review
reviewed
ready_for_book
```

## Step 6: Simple Audit Logs

Apply the migration:

```text
supabase/migrations/202606220001_create_activity_logs.sql
```

Use it for:

```text
answer_created
answer_updated
audio_uploaded
photo_uploaded
photo_deleted
transcription_requested
transcription_completed
polish_fallback_used
admin_viewed_answer
admin_updated_answer
```

Minimum useful fields:

```text
actor_user_id
action
entity_type
entity_id
book_project_id
metadata
created_at
```

## Practical Priority

Do now:

```text
Vite migration
favicon/OGP
activity_logs migration
data retention draft
role/RLS review
```

Do before paid launch:

```text
Terms and privacy
custom domain
brand email
minimal admin screen
```

Do before 1000 users:

```text
transcription job queue
retry dashboard
cost tracking
Supabase Pro review
```
