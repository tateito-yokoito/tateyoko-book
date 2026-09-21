# 制作Supporter導線：実装・検証記録

検証日：2026-09-21。商品正本はこのフォルダの `user-flow-master.xlsx` / `README.md`。本書は実装証跡であり、商品条件の追加・変更ではない。

## 新規実装

- 本人、了承を記録した制作Supporter、一般Viewerを分離。娘・親子・購入者・Project所有者であることを制作権限の根拠にしない。
- `family_production_consents` に Person、Project、Supporter関係、Supporter Account、確認したactor、日時、了承、取消を保存。既存Supporterは自動昇格しない。
- `family_production_events` に了承・取消・進め方変更・はじまりの章開始・本編開始を記録。本人の意思を確認したSupporterによる開始を許可し、本人Account/SMSは必須にしない。
- 制作権限は `family_creator` / `family_production_supporter` で判定。本人主体でも制作Supporterの素材アクセスは可能。本編の代理開始には「おまかせ」の了承を要求する。
- 本人による取消後、Supporterの自己申告だけで再付与できない。本人への接続・身元確認、破壊的な所有者操作、本人データエクスポートの権限は拡大しない。
- 録音・文字起こし・文章化、語り足し／語り直し、一覧、文章編集、写真、共有、収録選択、ブック編集・確定・注文を既存画面へ接続。制作アクセスと家族向け公開範囲は独立し、「自分だけ」と誤認させる箇所を制作コンテキストで区別する。
- 非公開素材の明示的な冊子収録は可能だが、初期選択で勝手に収録せず、Viewerへの公開にも変更しない。確定したBookの内容はスナップショットとして保持する。
- 決済Edgeは制作Supporterをサーバー側でも判定。Project所有者でない、了承されたSupporterの制作注文にも対応する。

### 主なレビュー順序

1. `supabase/migrations/202609210003_production_supporter.sql` と `202609210004_production_start_audit_key.sql`
2. `src/lib/familyConnection.js`、語り・写真・音声・共有の各adapter
3. `FamilyConnectionTest` / `FamilyStartingFlow` / `FamilyThemeFlow` / `FamilySubjectStories` / `FamilyBookFlow` と `App.jsx` の既存画面接続
4. `create-checkout-session`、`_shared/family-access.ts`、処理・出版Edge
5. `scripts/tests/production-supporter.sql.test.mjs` とブラウザー検証スクリプト

003の開始監査はTESTで実行時に `experience_contracts` の主キー相違が判明したため、004で `order_id` 参照へ修正した。履歴を改変せず両方を順に適用する。

## 回帰

ローカルPGliteによる実SQL/RLS、JavaScript adapter等を合計38件で検証し、全件成功。SQLスイート内部の複数assertionも含む（「38本のブラウザーE2E」という意味ではない）。

- 本人の既存権限、返金期限・本編開始による保証終了、開始処理の冪等性。
- 本人Accountなしの無料体験／直接購入、ギフト45日保証、本編開始前後の監査、Book確定。
- 了承のないSupporter／別Project／一般Viewerによる制作操作の拒否。
- 明示的に選択されたViewerは共有した語りのみ閲覧可能。非公開・共有取消後は拒否し、編集・共有設定は不可。
- 生の回答テーブルへの書込みを許可せず、予約・対象Project・actor・最新版確認を持つRPCを使用。
- 非所有者の友人Supporterでも制作・注文が可能。購入者・所有者・本人の同一視なし。
- 本人Accountの後付けで同じPerson・Project・回答・購入・Bookが保持される。これは認証済みOTPのfixtureを用いたDBテストであり、実SMSの検証ではない。
- TESTビルドと通常ビルドのコンパイル。本人利用の既存オンボーディングをTESTブラウザーでスモーク確認。

## TEST環境での確認

Supabase：`zpswxefgfabzvxdbtyvq`。レビュー用コードのTESTビルドをローカル `127.0.0.1:5195` で配信し、実TEST API／Stripe TESTへ接続。架空Account・合成音声・ダミー配送先のみを使用した。

| 経路 | 確認結果 |
| --- | --- |
| E2E-A | 娘Account → 母Person → 同席無料3問 → Stripe TEST購入 → はじまりの章 → Supporterによる本編開始 → 9テーマ側の最初の問い・録音 → 語り足し／語り直し → 文章編集・写真 → 収録選択・紙面確認・仕上げ → TEST注文受付・確定Book／出版記録を確認 |
| E2E-B | 無料3問が0件のまま娘購入 → はじまりの章 → Supporter本編開始 → 本編録音 → 文章編集・写真 → 仕上げ・TEST注文受付。レビュー用ビルドから同じPerson・確定Book・出版記録の継続アクセスを再確認 |

両経路とも本人Account未接続のまま完了。アプリAPI失敗・ページ例外なし。Bの購入～注文は関連変更を含む元作業ツリーで実行し、レビュー用に無関係な変更を除いた後に同じ完成データを再確認した。Aの本編・編集・写真・仕上げ・注文はレビュー用ビルドで実行した。

TEST側で今回実施した変更は003・004の適用と `create-checkout-session` の更新。既存のTEST認証・allowlist・決済・文字起こし等の設定を利用した。フロントのリモートTESTサイトへの再配信は行っていない。

実課金、実SMS、実印刷・配送、本番DB・本番Edge・本番公開は実施していない。

## 未確認事項・本番反映前の条件

- 実機iPhoneでの録音／写真／復帰、母の実SMSによる後付け接続、9テーマ全問の完走。
- 本人単独の全工程のブラウザー再走行、返金の実Stripe往復、実印刷・配送。返金境界と本人権限はSQL回帰で確認した範囲。
- 有料オプション追加／増刷決済のブラウザー全パターン。今回は初回購入済みの標準冊子注文まで。
- 既存のTEST専用host gate・ビルドflag・DB rollout/allowlistを維持している。このコミットだけをmainへ入れても本番向けの新導線を自動開放しない。本番解禁はレビュー後に別途、公開設定と対象者範囲を確認する必要がある。
- 本番の適用済みmigration／Edge設定との照合は未実施。今回コミットには元々未コミットだったv2契約・Book・家族接続・録音等の必要な前提変更も含む。日付150001以降を無確認で一括本番適用しない。
- 関係ないホーム演出、管理画面、独立SMS検証画面、マーケティング等のローカル変更は含めない。元作業ツリーは保持し、隔離worktreeのレビュー用branchへコミットする。

## 再検証

```sh
QA_PGLITE_PATH=/absolute/path/to/pglite/dist/index.js node --test \
  scripts/tests/family-*.test.mjs \
  scripts/tests/experience-contracts.sql.test.mjs \
  scripts/tests/book-work.sql.test.mjs \
  scripts/tests/commerce-mode.test.mjs \
  scripts/tests/production-supporter.sql.test.mjs
```

TESTビルドは `QA_RELEASE_TEST_REF=zpswxefgfabzvxdbtyvq` と `QA_SUPABASE_CLI` を指定して `scripts/deploy/build-public-test.mjs` を実行し、`scripts/tests/serve-family-e2e.mjs` で起動する。CLI接続はTESTに限定する。

ブラウザー検証は `scripts/tests/production-supporter.browser.mjs A|B <step>`。利用可能stepは `create / inspect / record / purchase / starting / main / append / replace / edit / book`。録音3問は `QA_RECORD_COUNT=3`。

必要な環境変数：`QA_SUPABASE_CLI`、`QA_PLAYWRIGHT_PATH`、`QA_SESSION_FILE`（`ref` と `actors.family.session` を持つ既存の架空TESTセッション）。任意で `QA_OUTPUT_DIR`、`QA_AUDIO_FILE`。本人スモークには同ファイルの `actors.self.session` を使う。テストはOTP APIを遮断するため、実行中にSMSを送信しない。ブラウザーはmacOS Google Chromeを使用する。

認証セッション、checkout URL、スクリーンショット等の `output/` はGit対象外。fixtureの `family-baseline-schema.json` はSQL再現に必要なスキーマ定義のみで、利用者の行データは含まない。
