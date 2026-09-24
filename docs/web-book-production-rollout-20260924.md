# 初回BOOK＋Webブック完成 本番rollout手順（未実行）

2026-09-24追記：cleanupの整合性問題は修正・障害注入TESTを終え、CONDITIONAL GOへ更新。結果は `web-book-copy-integrity-20260924.md`。以下は別途公開承認を受けて使う未実行の手順。本番は変更していない。以前のNO-GO監査は `web-book-production-source-audit-20260924.md` に履歴として残す。

## 現在の本番と反映範囲

- Supabase: `wquxjeqkumossjxehdop`。migration履歴115件、最新 `202609220002_book_milestones`。
- 新完成ライフサイクルの候補table／rollout tableはまだ存在しない。
- サーバー `BOOK_COMPLETION_ENABLED` 未設定（現行の判定ではOFF）。Familyサーバーフラグも未設定、DB family OFF／allowlist 0／C OFF。
- 2026-09-24 07:12 JSTの本番HTML: JS `index-B9e-VcVW.js`、CSS `index-CyDNISLh.css`。HTML SHA-256 `3a638e4774fa0e54665544544d7209f081accccb5308afe4b1f9c36070a15e1a`。
- Vercel inspectで確認した現行deployment: **`dpl_HGcncon2HkXVUp6MbaiUXAWmu7CA`**、`https://tateyoko-book-3xwz6m2av-tateito-yokoito.vercel.app`。過去の節目リリース文書に記載されたdeploymentを復帰先として流用しない。実行直前に再確認する。
- 現行HPは並行更新されている。アプリ候補から古いHPを再公開しないよう、実行時の現行HPと配信assetを保持したrelease artifactを作る。mainへの自動pushは行わない。

未適用migrationは次の10本だけを順に適用する。無差別な日付順 `db push` は使わない。

1. `202609230001_web_book_preview.sql`
2. `202609230002_web_book_pin.sql`
3. `202609230003_web_book_admin_live.sql`
4. `202609230004_book_completion_candidates.sql`
5. `202609230005_completed_web_book_library.sql`
6. `202609230006_book_print_handoff.sql`
7. `202609230007_completed_work_sets.sql`
8. `202609230008_admin_customer_experience.sql`
9. `202609240001_publication_source_asset_guard.sql`
10. `202609240002_publication_legacy_question_compat.sql`

最新本番catalogのローカル復元で10本適用PASS。結合SQL SHA-256 `06f92150b7adb0a137d147f87adb9a235e1c6f9d93666cb34c6fba2eed5a166c`。cleanup修正でmigrationが増える場合はこの一覧・hash・リハーサルを更新してから実行する。

更新／新設するEdgeは以下7本。実行直前に版とhashを再照合し、変更があれば停止して取り込みを判断する。

|Edge|監査時の本番版|gateway verify_jwt|
|---|---:|---|
|public-voice|26|false|
|publish-voice-edition|27|true|
|create-checkout-session|49|false|
|sync-checkout-session|33|false|
|stripe-webhook|32|false（Stripe署名検証を維持）|
|cancel-book-completion|未作成|false（handler内認証・所有権検証）|
|web-book-preview|未作成|既定true＋handler内管理者認可|

録音・文字起こし等の他Edge、Stripeのキー／Webhook設定、Family公開設定は対象外。Stripeは本番のlive設定を維持し、TESTキーを本番へ入れない。公開前smokeで実注文・実課金はしない。

## 0. 実行前条件

cleanupの応答喪失・並行実行問題はTESTで修正確認済み（`web-book-copy-integrity-20260924.md`）。この修正によるmigration追加はなく10本のまま。公開するcommit SHA、10 migrationのhash、Edge bundle、Front artifactを固定する。TEST済み共通ファイル `_shared/immutable-publication-copy.ts` をpublish Edge bundleに必ず含める。

実行直前にREAD ONLYで本番catalog・履歴・素材監査・7 Edge版・現在deploymentを再照合する。現行EdgeコードとそのJWT設定、非秘密設定の値／秘密設定の存在、現在Front artifact／deploymentを退避する。異なるhashや新規素材を見つけたら、今回の監査結果をそのまま適用しない。

日次バックアップ／PITR状態は実行時に再確認。前回確認ではPITR OFF。DB全体復元は通常のrollbackに使わない。日次バックアップ以降の更新、Storage、Stripeは一体で戻らない。

## 1. DB migration

サーバー完成フラグOFFの状態で、検証済み10本と履歴登録を一つのtransactionにまとめる。各ファイルのBEGIN/COMMITを外側transactionへ統合し、lock timeout・statement timeoutを設定する。履歴件数・依存関数hashが直前確認と一致することをtransaction内でも検査する。

commit前に、新rolloutがOFF、新関数のservice-role限定、anon/authenticatedの内部テーブル・確定RPCへの拒否、既存Project／Person／語り／素材／購入／共有値が不変であることを確認する。失敗はtransaction rollback。

**commit後の復帰:** rollout OFFを維持してforward fix。新tableのdrop、履歴巻き戻し、顧客データの全DB復元はしない。既存利用に影響する関数だけ、退避定義と依存関係を照合して最小修正する。

## 2. Edge / Front反映

サーバー `BOOK_COMPLETION_ENABLED=false` を明示し、上記7 Edgeだけを固定済みartifactから反映する。JWT設定を保持する。

Frontは完成フラグOFF版とON版を同じcommitから用意する。まずOFF版を反映する。既存のHP・本人導線・節目機能・Family/CのOFF状態を保持し、未検証増刷を案内しない本棚文言を含める。

**注意:** `VITE_BOOK_COMPLETION_ENABLED=false` は旧仕上げ処理へ分岐する。すべてのBOOK注文を停止するスイッチではない。したがってOFF確認時に「顧客の代わりに注文ボタンを押す」smokeをしない。開放時にはON版を先に配信し、旧画面が新完成候補を作る前提で動かないことを確認する。

**復帰:** 新規処理が一度も始まっていなければ、Frontを実行直前に記録したdeploymentへ復帰できる。Edgeは必要なものだけ退避版へ戻す。ただし素材認可の欠陥がある旧publish Edgeを新完成フローと組み合わせて公開しない。必要なら新完成ゲートを閉じたまま修正版を維持する。

## 3. 公開ゲートOFFのまま確認

- DB `book_completion_rollout.enabled=false`、Edge `BOOK_COMPLETION_ENABLED=false`。
- Family DB OFF／allowlist 0／サーバー・フロントOFF、C OFFを保持。
- 未認証・対象外Project・不正素材pathは拒否。無効入力でStorageコピーや注文が作られない。
- 新完成候補・正式公開作品・本棚追加件数が反映前から増えていない。
- 新service-role専用認可RPCはanon/authenticatedから直接実行不可。
- TEST素材・TEST Stripeキー・検証用入口を公開artifactへ混入させていない。

新しい本番テスト作品の作成や決済は、このチェックに含めない。

**失敗時:** ゲートOFFのまま停止。部分的なEdge/Front更新を適合する組合せへ戻すかforward fix。DBとStorageの顧客データは保持。

## 4. Smoke test

本番HP・ログイン・本人ホーム・既存語り一覧・既存再生・本棚空状態・既存共有境界を閲覧で確認する。「顧客体験を見る」は許可された管理者による閲覧専用操作だけを確認する。

管理者Live Preview等、監査ログ／rate-limitの更新を伴う操作を行う場合は、承認済み本番反映後smokeの範囲とし、今回のREAD ONLY監査とは混同しない。録音・編集・注文・課金は実行しない。一般Viewer・対象外Projectの拒否も確認する。

**失敗時:** 公開せず、手順2と同じ復帰。既存本人導線の異常があればアプリFrontを退避版へ戻し、原因を修正する。

## 5. 公開ゲートON（別途公開承認後）

1. Front ON版（`VITE_BOOK_COMPLETION_ENABLED=true`）を配信。まだDB・Edge完成ゲートOFF。切替中は新完成処理が拒否されることを確認。
2. Edge `BOOK_COMPLETION_ENABLED=true`。この時点でもDB rollout OFFのため新候補は作れない。
3. 最後にDB `book_completion_rollout.enabled=true`。候補作成を開始可能にする。
4. 非課金smokeとエラーログ確認。実ユーザーの初回完成を監視対象とする。実課金TESTはこの手順へ含めない。

現行BOOK完成rolloutは全体booleanでありAccount別allowlistではない。Familyのallowlistで本人起点の完成まで限定できるとは表現しない。今回は既存の少数顧客に対する開放とし、個別Account限定を必須とする場合は別の公開制御が必要。Family/Cの開放は含めない。

**開放後のgate closeと復帰:**

- まずDB rollout OFFで新候補作成を止める。これは既に準備中／決済中の候補を取消す操作ではない。
- 既存候補・決済成功済み注文・未確定作品の件数とIDを保全する。完成処理が健全なら、その決済照合を継続して収束させる。
- 完成処理自体の不整合ならEdge完成フラグもOFFにする。この間に決済成功してもWeb作品が未完成で残るため、障害解消後に同一注文をStripe照合・syncで再確定する。Webhookが受理済みでも再照合を省略しない。
- 決済成功済み注文を未払い・キャンセルへ書き換えない。完成candidate／public ID／Storageを削除しない。
- 完成済み／決済中の顧客を旧注文フローへ戻さない。公開後は互換性のある停止表示／修正版を優先し、旧deploymentへ機械的に全体復帰しない。
- 通常の復旧はgate close＋データ保持＋forward fix。DBだけ全体復元してStripeとずらす方法は採用しない。

## 残すQA・後続事項

iPhone Safari実機・実動画E2Eは未確認。Safari未確認だけを公開停止理由にはしない。Storage障害注入は現時点で未実施だが、今回見つかったcleanupの完成整合性問題については、修正と最小検証を公開条件とする。

Premium追加・完成後増刷・QR実入稿は後続。QR実入稿接続は未実装。閲覧UIに追加の仕様変更は行わない。
