# HP renewal preview assets

This directory is owned by the HP renewal branch. Do not overwrite shared app assets.

- `sample-voice.wav`: copied unchanged from the existing local `public/site/trial-demo-voice.wav`. Provenance: `docs/trial-conversion-ui-20260915.md` in the original working tree documents macOS Kyoko synthetic speech, fictional text, ~6.47 seconds, no imitation of a real person. Preview only, explicitly labeled synthetic and separate from the displayed fictional excerpt. Not a customer recording. Before public release, confirm public-use clearance or replace with an approved sample recording and matching transcript.
- Images are existing project assets, not new generations. The doorway is an illustrative image, not an actual customer's photograph. The family book image illustrates gathering around a book, not the standard binding specification.
- HERO / WHO / SUPPORT currently use labeled CSS placeholders, not final imagery.

Review URL: `/src/landing/preview.html` (Vite development server). This entry imports the HP only and does not initialize App or backend clients. App CTA hrefs remain unchanged; backend-dependent signup and checkout are not part of this preview test.

Remaining release checks: supporter availability and invitation entry with the parallel release owner; Web book publication scope for text/photo-only items; approved sample media; staff support interest intake URL/process; current live trial question definitions. No production release is authorized by this preview.

## Preview verification — 2026-09-22

- Dedicated branch: `codex/hp-renewal-20260922`, base `ad017b8e1846ca22783bf8a3085b129f461540a6`.
- `npm run build`: passed (existing combined app chunk-size warning remains).
- Chrome 1440 × 1000 and 390 × 844: no horizontal overflow, broken images, or JavaScript errors. Checked visible paragraph/link/button/summary/caption text: none below 15px.
- Menu open/Escape, FAQ expansion, extra FAQ expansion, privacy dialog open/Escape, manual audio playback/pause: passed at both widths. Audio duration: 6.470884 seconds.
- HP preview made no Supabase or Stripe requests. CTA hrefs preserve login/trial/purchase entries; no signup, purchase, or delivery was executed. The isolated preview intentionally has no backend environment configured.
- Full-page screenshots: `/tmp/hp-renewal-1440.png`, `/tmp/hp-renewal-390.png`. Web book details: `/tmp/hp-webbook-1440.png`, `/tmp/hp-webbook-390.png`.
- Scope excludes App, Family/Supporter, VoicePlaybackPage, migrations, Edge Functions, authentication, payments, main merge, and production deployment.
