# HP visual release — 2026-09-23

- Public URL: https://www.tateito-yokoito.jp/
- Source commit: `c13d57ab70cd0dcf6e4ce033131fb522aa5a5de2`
- Branch: `codex/hp-release-20260923`
- Baseline: `0e2af1c46c793f61a6358402f35354b678b6bfc2` (records live application source `2e7746d`).
- Deployment: `dpl_4cKrW9NGRkAweJUKoi8XAgpeiBi9`
- Deployment URL: https://tateyoko-book-kdhxb90b3-tateito-yokoito.vercel.app
- Previous deployment / frontend rollback: `dpl_7AuC65JiBuKitZfFFYvFmpWf562B`, https://tateyoko-book-h5jpoagif-tateito-yokoito.vercel.app
- JS: `index-C4HdlHtN.js`; CSS: `index-C1E-OGIR.css`.

## Scope

User approved publishing the HP work to production. Ported only reviewed HP source/assets onto the current production application baseline, rather than deploying the older HP worktree wholesale.

- Approved B3 integrated HERO and right-only mobile arch; fixed the old A layout remaining at widths 621–1023px. At intermediate widths the typography, CTA padding and photo positioning are responsive; copy and links are unchanged.
- Approved Web book image and HTML headline / QR explanation.
- Standard softcover + additional Premium presentation. Four sample colors, official SVG mark on standard, no mark on provisional Premium cover; additional ¥30,000 clearly stated.
- Book surface and binding are illustrative HTML/CSS, not finished physical product photography. Color controls change the HP visual only, not checkout choices.
- No changes to App, Family/Supporter, authentication, payment, DB or Edge code. No main merge/push. Review pages/screenshots are not shipped.

## Build and release checks

- Used the current production `--book-milestones` build configuration unchanged. `VITE_BOOK_MILESTONES_ENABLED=true`; all four Family/test frontend flags remain false. Build settings deep-equal the prior production manifest.
- Build passed; existing large-chunk warning remains.
- Local production build checked at 1440 / 813 / 626 / 390px. Narrow desktop no longer falls back to the old arch panel; 390px retains the approved layout. No horizontal overflow at these widths.
- Login, purchase entry and trial entry screens opened without submitting forms, signing in, recording or purchasing.
- Candidate deployed with `--prod --skip-domain`; inspected through the authenticated browser without changing deployment protection. Verified current production had not advanced before promotion.
- Promoted after candidate checks. Public domain HTTP 200, expected JS/CSS, robots meta and `X-Robots-Tag: noindex, nofollow` verified.
- Public 813 / 390px styles verified; new hero, Web book and Premium texture assets return HTTP 200.
- Evidence is local, ignored `output/book-milestones-production-release/`.

## Future app releases

Keep the HP delta from `c13d57a` when releasing further application changes. The old HP review branch `codex/hp-production-20260922` is not the current production application baseline. Do not redeploy it wholesale.
