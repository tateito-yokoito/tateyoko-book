# 制作Supporter：本番反映前の3点確認

> これは624a837時点の事前確認記録です。005・006のTEST適用後の結果と公開判断は [先行利用者限定リリース Runbook](production-supporter-release-runbook.md) を参照してください。以下の「未適用」は当時の状態です。

対象：`0f31e3e9f777916007d13fdd436ed68611f65333` からの最小補正。
本番スキーマ取得：2026-09-21 14:07 UTC（23:07 JST）。この作業では本番・TEST DB／Edge／環境設定／公開サイトを変更していない。

## 結論と確認範囲

1. **進め方と権限：ローカル受入テストPASS。** 本編開始に残っていた `production_mode='supporter'` 条件とUI誘導条件を削除。権限は有効なSupporter関係＋有効な制作了承を根拠にする。進め方だけで権限は得られない。開始RPCの `input_subject_intent_confirmed=true` は引き続き必要。
2. **了承・停止境界：DB受入テストPASS。** 自己申告actor、確認日時、Person／Project、Supporter関係を照合。本人Account後付け→本人による停止→Supporter自己申告での再付与拒否を確認。停止後に旧Supporterの録音・アップロード権限へ戻る経路も塞いだ。本人の既存設定画面へ制作サポーター一覧／停止ボタンを接続した。
3. **本番migration：スキーマ再現dry-run PASS。** 実際の本番・TESTカタログをREAD ONLYで取得し、本番スキーマをローカルPostgreSQL互換環境（PGlite）へ再現。下記16本を順に適用し、003の動的置換23か所の存在と置換後定義を検証した。本番上でDDLを実行してrollbackした、という意味ではない。

ただし、これは即本番公開の許可ではない。新005・006はリモートTESTにも未適用であり、後述のTEST確認と本番切替用gateの整備を残している。全工程E2Eを今回再走行したとは扱わない。

## 見つけた移行時の問題と補正

- 本番の `202609150001`〜`202609160013`、`202609170001` は既に適用済み。再適用しない。
- 本番には家族接続テーブルが未導入。003だけの適用は不可。
- 本番では後日 `202609190004_supporter_sms_invites` が適用されている。旧170004をそのまま適用すると、招待応答2関数と一覧1関数のSMS対応が古くなる。
- **006で3関数だけを補正**し、家族向けの認可ガードと現在のSMS検証条件の両方を維持する。190004全体の再実行は家族ガードを外すため不可。
- TESTのmigration履歴は6件、本番は97件で、履歴だけでは比較不能。関数・テーブル・列・制約・index・RLS・triggerの実定義を使った。
- 既存の共通テーブルの列型／nullable／defaultに差分なし。本番884列、TEST959列。新しい質問indexの4条件について、本番・TESTの重複件数はいずれも0（個別の語り・利用者行を持ち出さず件数のみ）。
- 003の置換対象関数は再現後にTESTと一致。今回変更される既存本番関数29件では、005で意図的に変更する `can_confirm_experience_intent` を除いてTESTと一致した。

## 本番反映対象

### フロント／認可コード

初回branchの `src/Family*`、`src/lib/family*`、`src/main.jsx`、`src/App.jsx` の既存画面接続と関連するv2契約／Book adapterが基礎。今回の追加差分は次に限定する。

- `src/FamilyConnectionTest.jsx`：進め方による認可分岐を削除。既存の本人設定へ停止UIを接続。
- `src/FamilyProductionSupporters.jsx`：本人向け一覧・停止。取消確認、保存失敗、再読込を扱う。
- `src/lib/familyConnection.js`：本人限定一覧と停止RPCへのadapter。
- 新005・006、受入テスト、事前照合スクリプト、README・検証資料。

無関係な管理画面・ホーム演出・HPの未コミット変更を混ぜない。テストスクリプト／スキーマfixture／証跡は本番配信物に含めない。

### DB migration：今回必要な16本のみ

|順|migration|目的|
|---|---|---|
|1|202609170002_family_subject_connection|Person接続・招待・upload・既定OFFのrollout|
|2|202609170003_family_subject_rls|家族ProjectのRLS／Storage境界|
|3|202609170004_family_legacy_guards|旧所有者ベースRPCの迂回防止|
|4|202609170005_family_creation_payer_guard|作成・支払人分離・質問のProject単位一意性|
|5|202609170006_family_paid_journey|有料体験・本編導線|
|6|202609170007_family_journey_guards|冊子表紙・注文の境界|
|7|202609170008_family_voice_adapter|録音予約と保存|
|8|202609170009_family_photo_voice|写真付き語り|
|9|202609170010_family_story_editor|文章・写真編集|
|10|202609170011_family_voice_revision|語り足し／語り直し|
|11|202609170012_family_theme_navigation|テーマ移動|
|12|202609170014_family_legacy_question_index|確認済み旧indexの置換|
|13|202609210003_production_supporter|制作役割・了承・監査・制作アクセス|
|14|202609210004_production_start_audit_key|契約監査キー修正|
|15|202609210005_separate_production_mode_and_authority|進め方と認可の分離、停止境界、本人限定一覧|
|16|202609210006_preserve_supporter_sms_compatibility|後日追加されたSMS対応を保全|

170013の配信設定はTEST専用なので除外。`family_private.qa_subject_reset_backup` 等のTEST用テーブルも移行しない。15・16日付の既適用群、管理・SMS・空の演出関連の既適用migrationは再実行しない。

実適用時は最新カタログで再照合し、rolloutをOFFのまま1〜16をレビュー済みの単位で実行する。特に170004→006の途中状態を公開しない。`supabase db push` による未適用全件の一括適用は使わない。空スキーマ再現では実DBのロック時間・負荷・実行中処理は測れないため、短いlock timeoutと失敗時のトランザクションrollbackを前提にする。

### Edge Functions

|対象|現在の本番version|JWT gateway設定|扱い|
|---|---:|---|---|
|create-checkout-session|48|false|制作Supporter注文認可・環境gateを含む候補を差分反映|
|transcribe-audio|42|false|family処理認可adapterを反映|
|polish-transcript|41|false|family処理認可adapterを反映|
|publish-voice-edition|26|true|本人／制作Supporter・確定Bookを確認する候補|
|sync-checkout-session|33|false|既存v2決済連携の同一性を確認し、差分がある場合のみ|
|stripe-webhook|32|false|既存署名・live/test照合を維持。同一性確認後、必要時のみ|
|export-experience-data|9|false|本人限定のまま。今回のSupporter権限へ広げない|
|request-experience-refund|6|false|支払人・保証条件を維持。今回の停止修正とは独立|

`_shared/family-access.ts`、`experience-access.ts`、`experience-commerce.ts` は利用するEdgeと同時にbundleする。上表は読み取った版番号であり、旧bundle本体を取得・復元試験した意味ではない。公開前に現行bundleと設定を退避する。gatewayの `verify_jwt=false` を「認証不要」と解釈せず、コード内部認証・署名検証を維持する。

### 環境設定と残る切替作業

- `src/lib/familyConnection.js` と `create-checkout-session` にはTEST参照の固定拒否が残る。本番参照を明示許可する別の公開パッチが必要。今回、安全装置を外していない。
- `VITE_FAMILY_CONNECTION_TEST` で入口を出す構成を本番向けに分離する必要がある。現在のPages workflowはv2／family用flagを渡していない。mainへ入れるだけでは新導線は公開されない。
- `family_private.rollout.enabled` と `allowed_actor_ids` は初期OFF／空。レビュー・動作確認後、承認された対象だけを明示的に開ける。これは新規利用のgateであり、既存セッション全体を止めるkill switchではない。
- `FamilyDeliverySettings` は170013のTEST専用RPCを使用している。本番公開時にこの入口を非表示にするか既存本番通知設定へつなぐ。TEST専用保存先を本番の通知設定として扱わない。
- 本番 `EXPERIENCE_COMMERCE_MODE`、`EXPERIENCE_COMMERCE_SUPABASE_URL`、`EXPERIENCE_CONTRACTS_V2_TEST_ONLY`、`EXPERIENCE_CHECKOUT_ENABLED`、`APP_URL` は存在を確認したが**値は未取得**。切替時にlive／本番参照／TEST_ONLY=false／正式return URLの整合を管理者側で確認する。
- `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET`、service role／OpenAI関連の秘密値は読み取らず、流用・変更しない。設定名があることだけを確認した。SMS・通知の有効化や自動送信設定は今回変更しない。

## rollback／安全停止手順（未実行）

1. 切替前に公開フロントartifact、対象Edge bundle・版・gateway設定、変更する環境設定、DBスキーマ／関数／policyとバックアップ・PITRの復旧可能性を確認する。今回のmetadataは利用者データのバックアップではない。
2. migration中の失敗は未commitトランザクションをrollbackし、公開gateは開けない。関数の途中状態を公開しない。
3. 公開後に問題が出た場合は入口と新規family rolloutを閉じる。既存利用も止める必要がある場合、review済みの緊急パッチで `family_production_supporter` と `family_supporter` の結果を一時的にfalseにして制作Supporterの既存経路も遮断する。本人アクセスを巻き添えにしない。既発行signed URLや端末保存済みデータは即時回収できない。
4. Front／Edgeは保存済みartifactへ戻すか最小修正をforward deployする。ただし、**新しい家族Projectが存在する状態で、family認可を持たない旧Edgeへ戻してはいけない**。必要なら認可ガードを維持したままfamily機能を停止する。決済リスク時の新規checkout停止は本人利用も止めるため、影響範囲を明示して判断する。受領済みwebhookは落とさない。
5. Person／Project／語り／購入／Book／了承・監査記録は削除しない。新indexを旧Account単位indexへ無条件に戻さない（新たな複数Projectの記録で旧制約に違反し得る）。障害後の注文を消すDB全体巻戻しも自動実施しない。データを保持したforward fixを優先し、実データを戻す場合は別途承認・差分保全が必要。

## 検証方法と未確認

- SQL・認可・adapter回帰39件PASS、通常／TESTビルド成功。
- 本人停止UIはネットワーク遮断・mock APIのブラウザーで取消・拒否・停止・再読込を検証。実SMS／実機での本人後付け→停止は未実施。
- 新005・006のリモートTEST適用と、その後の実画面での受入確認は次の切替前ステップ。本番へ先に適用しない。
- `scripts/tests/production-supporter.preflight.mjs --read-only`：カタログ、migration履歴、一意性違反の件数、Edge版、環境変数名のみを取得。
- `scripts/tests/production-supporter.rehearsal.mjs`：取得した本番カタログをローカル再現し16本を検証。auth.uid／jwt／storage等はローカルstub。利用者データ、実際の認証・決済・SMS・ロック負荷を再現したものではない。
- 生のカタログと詳細証跡はGit対象外の `output/supporter-preflight/`。公開レビュー用には関数の一致・依存migration・件数のみを本書へ記載した。

以上の確認により、旧migrationによる既存SMS対応の後退を防ぐ方針まで確定した。本番公開の実行は別途承認後とする。
