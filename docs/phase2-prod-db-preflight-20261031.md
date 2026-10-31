# Phase 2 本番DB適用前確認（2026-10-31 JST）

本資料は本番DBの読み取り確認を記録する。Phase 2 SQLは本番に適用していない。件数・バックアップ・関数定義は適用直前に再取得する。

## 現行本番

- Supabase project: `wquxjeqkumossjxehdop`、移行履歴182件。Phase 2の3版 `20261028141450`、`20261028160649`、`20261028230358` は未適用。
- 本番履歴の最新番号は `20261030113740`。3ファイルの番号はこれより古いため、全履歴の再生はせず、承認後に同じSQL内容を新しい順序の前進移行として個別記録する。元ファイルの内容・ハッシュと本番側の記録を対応付ける。
- `commerce_orders` 20件、`book_projects` 25件、`auth.users` 27件、`profiles` 23件、`answers` 78件。
- `discount_campaigns` 9件、`discount_codes` 9件、`discount_redemptions` 14件。有効な旧商品 `self_book_v1` 対象はキャンペーン7件・コード7件。
- 既存商品 `self_book_v1` は49,800円、税込JPY、有効。Phase 2の5商品は未登録。
- Phase 2の相談・注文明細・割引対象・申込制限・担当割当・編集監査の6表は未作成。対象のV2列・制約・索引・トリガーも未作成。
- 既存の `commerce_products`、`commerce_orders`、`book_projects`、`family_story_invitations`、`discount_campaigns`、`discount_codes`、`discount_redemptions`、`gift_orders`、`experience_contracts`、`experience_refund_requests`、`book_order_work_snapshots`、`book_production_jobs`、`admin_users`、`answers`、`questions` は存在する。

## 復旧用の現行関数定義

`phase2-prod-rollback-functions-20261031.sql` に次の3関数の現行定義を保存した。Phase 2の最初の移行はこれらを `CREATE OR REPLACE` する。

- `register_experience_contract(uuid)` — MD5 `c6d4c600eb06b6f684c1420865881103`
- `confirm_experience_payment(uuid,timestamptz)` — MD5 `41d957bae46a0477ab5b2fb0b852b35d`
- `start_paid_starting_chapter(uuid,boolean)` — MD5 `5305d772953ed90402ab77bd16c36032`

現行権限は順に `service_role` のみ、`service_role` のみ、`authenticated` のみ。移行後も同じ権限であることを確認する。復旧スクリプトは承認なしに実行しない。

## バックアップ

2026-10-31確認時点、Supabase Dashboardの直近の日次物理バックアップは2026-10-30 19:29:35 UTC（10月31日04:29:35 JST）。PITRは未契約。DBバックアップにはStorage実体が含まれない。適用直前に最新バックアップが取得・復元可能であることを再確認し、当日分がない場合は実行を止める。日次バックアップからの全体復元はバックアップ以降の顧客データを巻き戻すため、障害時の第一手段にはしない。

## TESTで確認した範囲と残る条件

隔離TEST `gmyqqcnbuiaghbrxnkaz` の5商品は35,000/65,000/5,000/35,000/20,000円、税込JPY。Stripeテストモードで34,000円の割引付き決済、Webhook、注文確定、購入後の制作再開まで確認済み。新設6表はRLS有効で、`anon`・`authenticated` にSELECT/INSERT権限がない。公開実行できるV2通常関数はなく、サービスロール経由のEdge Functionがログイン・本人・担当者条件を確認する。

ただし隔離TESTは本番の全RLS/全データを完全複製した環境ではない。本番適用前に既存関数・制約・アクセス権限と3移行の依存関係を再照合する。

## 2026-10-31 実アカウント2件によるAPI権限検証

`scripts/tests/commerce-v2-api-access.test.mjs` を隔離TESTへ向けて実行。2つの別のメール認証アカウントでセッションを取得し、公開鍵による実際のREST/Edge APIを呼んだ。TESTに検証用の相談申込2件を作成した（本番は無変更）。認証コード・セッショントークンは記録しない。

| 操作 | 本人 | 別のログイン利用者 | 未ログイン |
| --- | --- | --- | --- |
| 既存注文1件をID指定でREST取得 | 200・1件 | 200・0件 | 401 |
| 検証用の相談をID指定でEdge取得 | 200・本人の1件 | 404・非開示 | 401 |
| 管理者用の相談一覧をEdge取得 | ― | 403・管理権限なし | 401 |
| 担当者用の相談詳細をEdge取得 | ― | 403・担当/支払/同意条件を満たさず | 401 |

同スクリプトの判定は `orderDenied=true`、`caseDenied=true`、`staffDenied=true`、終了コード0。新設6表はTESTでRLSが有効、`anon`/`authenticated` に直接のSELECT/INSERT権限なし。未ログインのV2購入APIはTEST決済ゲート停止中のため503を返す。この503は認証拒否の証拠として数えず、公開前にゲートが有効な環境で401になることを再確認する。

## 本番適用直前・適用後の順序

1. **適用直前に読み取りのみで再取得**：直近の復元可能なバックアップと時刻、PITRの有無、DB応答・負荷、既存注文/作品/利用者/回答/割引利用の件数、旧商品に紐づく有効な割引キャンペーンとコードのID・件数（7件のままか）、3つの置換対象関数の定義・MD5・実行権限。本書の10月31日値はその時点の記録であり、適用直前の再確認の代わりにはしない。バックアップ不足、コード集合の変化、関数差分、DB不安定なら停止する。
2. **別途承認後、決済ゲートを閉じたまま**3つのPhase 2 SQL内容だけを順番に個別トランザクションで適用する。全履歴の `db push` は使わない。適用前後の既存行件数・注文状態・旧コード7件、商品5件の価格、3関数の権限、新設表のRLSを照合する。失敗したトランザクションはロールバックし、後続を止める。
3. **DB先行の互換性確認**：旧アプリは `self_book_v1` の購入経路を使い、Phase 2の新列は既存行ではNULL可、置換関数のV2分岐は `pricing_version='v2'` に限定される。旧回答・旧注文・旧購入後の開始を読み取り/検証し、コード公開前に既存アプリが使えることを確認する。ただしTESTと本番スキーマは完全同一ではないため、本番の旧購入経路を承認なしに実決済で試さない。
4. 新しいEdge Function・アプリ公開とStripe/決済ゲートの有効化は、DB適用とは別の手順と承認に分ける。公開前に異なる利用者による注文・相談の非開示、未ログイン401、スタッフ以外403、旧割引コードと新価格を再確認する。

障害時は決済ゲートを閉じ、影響範囲を確認する。3つの既存関数の置換に起因する障害なら保存済み定義に戻す。日次バックアップからのDB全体復元は、その後の顧客データを失うため最後の手段とし、復旧前に影響と時点を確認する。

## 2026-10-31 21:46 JST 最終承認前の再照合

- 隔離TESTで `EXPERIENCE_CHECKOUT_ENABLED=true` と `commerce_environment.stripe_mode=test` を一時設定し、公開鍵のみ・認証ヘッダーなしで `create-commerce-v2-checkout` の見積APIを呼んだ。結果は **HTTP 401「ログインが必要です」**。新規注文・決済は発生していない。直後にDBを `disabled`、Edge Secretを `false` に戻し、後者のSHA-256が従前の `fcbcf165908dd18a9e49f7ff27810176db8e9f63b4352213741664245224f8aa` と一致することを確認した。
- 本番Supabaseは `ACTIVE_HEALTHY`。読み取りSQL `select 1` は正常応答し、MCP呼び出し全体は約3.5秒（DB内部実行時間そのものではない）。Observabilityの直近24時間CPU表示は **2.31%**。直近24時間のService HealthはDatabaseエラー0.04%の表示で、現時点で高CPU・SQLタイムアウトは確認していない。
- [Scheduled backups](https://supabase.com/dashboard/project/wquxjeqkumossjxehdop/database/backups/scheduled) に直近の物理バックアップ **2026-10-30 19:29:35 UTC（10月31日04:29:35 JST）**とRestore操作が表示される。[PITR](https://supabase.com/dashboard/project/wquxjeqkumossjxehdop/database/backups/pitr)は追加契約なし。実際の復元操作はしておらず、復元成功を保証するものではない。
- 本番件数は注文20・作品25・認証ユーザー27・プロフィール23・割引利用14で、前回記録から変化なし。Phase 2の3移行番号は本番履歴に存在しない。
- 旧 `self_book_v1` に紐づく `status in ('active','scheduled')` かつ `is_active=true` のキャンペーン/コードはそれぞれ **7件**。移行ファイルの7件ガードと一致。7件すべて対象商品は旧商品、割引対象範囲は `base_product` 4件・`entire_order` 3件。期間条件では過去期限切れ2件・開始前2件・現在利用可能3件（照合時点）。V2見積関数も既存の開始・終了・コード有効期限を判定するため、対応付けで期限切れコードが再有効化されることはない。コードそのものは記録・表示しない。
- 置換対象3関数の定義MD5は本書上部の保存値とすべて一致。実行権限も前回どおりで、`register_experience_contract` と `confirm_experience_payment` はservice_roleのみ、`start_paid_starting_chapter` はauthenticatedのみ。anonにはいずれも実行権限なし。
- DB先行・旧アプリ継続の確認は、既存の `self_book_v1` 表示、ログイン、作品・回答の読み込み、既存購入者の制作再開、旧注文/契約の状態、既存割引コード見積（実決済なし）の順で行う。V2用の新列は旧行でNULL可、3関数の新分岐は `pricing_version='v2'` または聞き取り制作サポート条件で限定されている。コードを公開するまでV2決済ゲートを無効に保つ。

この照合値は承認判断用。適用の実行時刻が離れる場合、バックアップ・件数・7件の集合と期限条件・3関数・CPU/DB応答はもう一度読み取って比較する。異常または想定外の差分があれば停止し、承認があっても適用しない。

## 適用後の移行履歴とソースの対応

上記は適用前の記録である。承認後、本番DBには3つのSQL内容を依存順に適用し、本番の移行履歴には次の番号で記録した。PR内のSQLファイル名も本番履歴に合わせている。SQL本文は承認済みの3ファイルから変更していない。

| 承認時のSQLファイル | 本番に記録された番号 | 本流に載せるファイル名 |
| --- | --- | --- |
| `20261028141450_product_commerce_v2.sql` | `20261031125930` | `20261031125930_phase2_product_commerce_v2_20261031.sql` |
| `20261028160649_commerce_v2_legacy_coupon_mapping.sql` | `20261031130003` | `20261031130003_phase2_commerce_v2_legacy_coupon_mapping_20261031.sql` |
| `20261028230358_commerce_v2_staff_scope.sql` | `20261031130032` | `20261031130032_phase2_commerce_v2_staff_scope_20261031.sql` |

本番の3件は適用済みであり、アプリコード統合時に再適用しない。隔離TESTは別の移行履歴を持つため、今回も全履歴の `db push` は使わない。
