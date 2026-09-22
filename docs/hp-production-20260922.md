# HP renewal production release — 2026-09-22

- Public URL: https://www.tateito-yokoito.jp/
- Release source: `9b6cd1a` on `codex/hp-production-20260922`.
- Baseline: `5ea27a8eb7f8ee551ed1949ceedd51934faf6937`, matching the previous production release.
- HP source reviewed: `ea8ec305420ff5fb6de0a6836b9eaefc00484c68`.
- Production deployment: `dpl_Cvj7aewBWvvQjmXZP5PHrqnQG3qt`.
- Deployment URL: https://tateyoko-book-jymq5zft1-tateito-yokoito.vercel.app
- Rollback deployment: `dpl_Bxz4BNRFCCRsibf2whHzTjg5Vbmn`.
- Main JS: `index-DVuyX-QT.js`; CSS: `index-BjlMEWC3.css`.

The user explicitly approved production publication with existing registration and purchase enabled, and search indexing suppressed. The preview protection was not changed.

## Scope and isolation

Clean worktree based on current production, not the older HP review application's source. Only LandingPage, landing.css, the HP Web book example and its audio asset were ported. The production HP no longer claims it is unpublished. HTML metadata was updated and `noindex, nofollow` added to HTML and deployment response headers.

The existing closed-production build script was copied from `fb5a82f`; its only change is the X-Robots-Tag header configuration. All four family/test flags remain false as on the previous production deployment. App, main, Family/Supporter, authentication, payment, DB and Edge implementations are unchanged. No main merge/push was performed.

Static build only was uploaded to the existing Vercel project, first with `--prod --skip-domain`, then promoted. Review screenshots and documentation are not included in public assets.

## Checks

Local 1440px and 390px browser checks passed: correct hero, no horizontal overflow, no broken images, original login/trial/purchase links. Login, purchase entry and free-trial entry body text matched the previous production deployment. No actual registration, purchase or customer-data writes were performed.

Post-promotion public-domain checks also passed at both widths, with no page errors or broken images. HTTP 200, the expected JS asset, HTML robots meta and `X-Robots-Tag: noindex, nofollow` were confirmed. All three application entry screens loaded successfully.

Build evidence and full-page screenshots are local under `output/closed-production-release/` (not published). The build manifest was generated before the release commit, so its sourceCommit field shows the baseline; `9b6cd1a` records the actual source changes used for the build.

## Subsequent releases

Future App releases must retain these HP changes and search-suppression headers rather than deploy the pre-renewal HP. Search suppression is not access control and cannot guarantee immediate removal from every search engine. Placeholder imagery and the clearly labeled synthetic sample audio remain for review.
