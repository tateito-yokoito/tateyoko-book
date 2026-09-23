# HP visual release — 2026-09-23

## Two works image alignment follow-up

- Source commit: `4f86a1206dfd677c223c00a3074118220cf363fe` (`codex/hp-release-20260923`).
- Live deployment: `dpl_4H924SdD6xDvy2DVNJ4aNVr8A6Sq`, https://www.tateito-yokoito.jp/#works .
- Rollback deployment: `dpl_EouiZG5K99v4KHfvub4LCk1uE121`.
- Corrected the figure's margin rule: 1440px has 130px on each side; 430px, 390px and 375px use their full viewport width with 0px side margins. No overflow or page errors in local Chrome checks.
- Only `src/landing.css` changed. Images, text, app code, checkout and CTA are unchanged. No main merge or push.
- Built with unchanged `--book-milestones` production settings. Candidate verified as Ready; public domain serves JS `index-BDC6Emwb.js`, CSS `index-BelbAYWB.css`, with `X-Robots-Tag: noindex, nofollow`.

## Two works overview visual follow-up

- Source commit: `f11002ce334e83725d6b4834f4132d398e2a7017` (`codex/hp-release-20260923`).
- Live deployment: `dpl_EouiZG5K99v4KHfvub4LCk1uE121`, https://www.tateito-yokoito.jp/#works .
- Rollback deployment: `dpl_8kREz1EhGbAEEHYKcC96iC1eydJ6`.
- Inserted the supplied image immediately after the two works introduction, before the book and Web book details. The existing Web book visual remains in its prior position unchanged.
- New image: `public/site/hp-renewal/book-and-webbook-approved.png`, copied byte for byte from the approved attachment; SHA-256 `3c3b231191d2c42544a914a71a6829d5f13969ee31ff219a9dc1cd690e0eeed6`.
- Other changes: only responsive spacing for the new image. No app, Family/Supporter, Auth, payment, DB or Edge source changed; no main merge or push.
- Local Chrome checks at 1440px and 390px: image loaded after heading, earlier Web book image restored, no horizontal overflow or page errors. Evidence in ignored `output/hp-approved-visual/`.
- Built with unchanged `--book-milestones` production settings. Candidate verified as Ready with expected JS `index-D617dyXP.js`, CSS `index-x6sYeJEj.css`, image HTTP 200 and noindex. Promoted after verifying custom domain still served the earlier build.
- Public custom domain now serves those JS/CSS assets, the image returns HTTP 200, and `X-Robots-Tag: noindex, nofollow` remains active.

## Latest follow-up: approved standard book photograph

- Source commit: `973b399c7cd73ff11c5f7b8f2cb7e94831e5405d` (`codex/hp-release-20260923`).
- Live deployment: `dpl_8kREz1EhGbAEEHYKcC96iC1eydJ6`, https://tateyoko-book-gn6uynxys-tateito-yokoito.vercel.app .
- Rollback: `dpl_4cKrW9NGRkAweJUKoi8XAgpeiBi9` (the earlier release below).
- Replaced only the standard book presentation with the approved wide-photo image `public/site/hp-renewal/standard-softcover-wide-photo-v6.webp` (740×1180, 89,412 bytes). Derived from the approved v6 PNG by trimming outer background only and WebP encoding. The approved cover/photo is not cropped.
- Four color names/swatches remain as static samples; no misleading color-switch buttons for the single approved sage image. No checkout changes.
- Other HP sections and all app/Auth/payment/DB/Edge source unchanged. No main merge or push.
- Production build settings deep-equal the earlier release; commit and manifest verified. JS `index-3mgdrUKK.js`, CSS `index-BQeD9kon.css`.
- Local final artifact verified at 1440, 813 and 390px: image loaded, no horizontal overflow or page errors, four swatches present. Screenshots in ignored `output/hp-standard-photo-release/`.
- Deployed with `--prod --skip-domain`; authenticated browser confirmed the candidate without changing protection. Confirmed the live custom domain still pointed to the previous deployment, then promoted this candidate.
- Public HTML and image return HTTP 200; expected JS/CSS and `noindex, nofollow` (meta + HTTP header) verified. Public mobile rendering visually confirmed in the authenticated in-app browser, then viewport reset.

## Earlier release

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
