# 制作Supporter：先行利用者限定リリース Runbook

## 判定と範囲

対象コード基準：`624a837`／`b448666`に、本Runbookと同じコミットのpilot公開パッチを追加。
**本番変更は未実行。A/B先行利用とCの公開承認は分離する。** C未完了だけを理由に、本人AccountなしのA/B先行利用を止めない。A/Bも本番反映には別途承認が必要。
HP一般公開・全面開放・新しい商品仕様は対象外。

2026-09-22、承認された005・006をTEST `zpswxefgfabzvxdbtyvq` に個別適用。履歴登録まで完了した。
TEST公開先：<https://tateyoko-book-test.vercel.app>。
Vercelは **tateyoko-book-test** (`prj_sPwDR1BfQBpYUQAgu1ElFlU4QeCX`) のみ更新。
公開gateパッチのTEST deployment: `dpl_HxEY5EHE8nMkudUYbtiFKSaeSC8j`、JS `index-DomZt4et.js`。
Vercelのtargetがproductionでも、これはTEST専用プロジェクトの固定URLであり、実サービスの本番公開ではない。
この作業では本番DB・Edge・環境変数・サイトを変更していない。
TESTには追加migration `202609220001`、`FAMILY_TEST_ENABLED=true`、後述の5 Edgeの公開gateを反映。DB／フロント両方でCはOFF。

## 受入記録

|項目|結果／証拠の範囲|
|---|---|
|005・006|リモートTEST適用済み。権限は進め方ではなく関係＋有効な制作了承|
|A 無料3問あり|PASS：無料3問→TEST購入→はじまりの章→本編→録音・文章化→語り足し／語り直し→編集・写真→収録選択→注文受付。本人Accountなし|
|B 無料3問なし|PASS：3問をスキップしてTEST購入後、Aと同じ本編・制作・注文受付まで到達。本人Accountなし|
|C 本人後付け・本人から停止|実SMS認証を伴う実画面確認は未完了。受信可能な検証番号と送信許可が必要|
|本人利用Smoke|PASS（限定）：既存本人Account→導入案内→マイク確認→本人の問い／録音ボタン。本人購入から注文までの再E2Eではない|
|公開gateのリモートTEST拒否確認|PASS：未認証・allowlist外／別Personのworkspace／制作了承／checkout／素材取得を拒否。CのUI・招待発行・接続確定も拒否、SMS送信0|
|認可・契約・Book回帰|41件PASS（PGlite／adapter）。未認証・allowlist外・Viewer・別Person／Project・rollout OFF・既発行接続リンクの拒否を含む。Cの実画面PASSの代替ではない|
|停止UI単体|取消・拒否・成功・再読込PASS。ネットワーク遮断＋mock APIであり、Cとは別|
|最新本番カタログ照合|2026-09-22 02:04 JST、READ ONLY取得。71テーブル・884列・176関数・97 migration|
|移行リハーサル|最新カタログをローカルに再現、17本を外側単一トランザクションで適用PASS。動的置換23か所の対象確認・TEST照合PASS、変更される既存関数の差分なし|

認証済みの架空QA Accountを使用。ログイン自体・実マイクの品質・実機SMS・印刷発送の検証ではない。
音声は合成音声、写真は検証画像、支払いはStripe TESTカードのみ。
制作了承は現行UIでは **Person作成時に明示確認**。購入後に初めて取る設計ではなく、無料3問でも制作アクセスを説明してから開始する。

公開gateパッチ追加後にA・B・本人Smokeを再実施してPASS。A・B完了後のREAD ONLY監査照合もPASS。両ケースともPerson維持、本人Accountなし、TEST決済1件／live決済0件、Book確定1件を確認。
無料体験回答数はA=3／B=0。`consent`／`starting_chapter`／`main_experience`の3イベントでPerson・実actor・Supporter関係・了承ID・時刻を照合した。
実画面のアプリAPIエラー・ページ例外はいずれも0。
前回の本人Smokeはテスト手順側で導入画面・マイク確認を飛ばして待機していたためタイムアウトした。既存の進捗保存を尊重する手順へ修正済み。今回はその手順でPASS（この問題を理由とするアプリコード変更なし）。

非公開証跡（Git対象外）：公開gate追加後は `output/supporter-pilot-gates/` のスクリーンショット、各ケースのstep記録、監査照合。追加前の証跡は `output/supporter-remote-final/`。
スキーマ生データは `output/supporter-preflight/`。秘密のセッションや接続リンクをレビュー資料に添付しない。

## A/B先行利用の必須Release Gate

- [x] 公開gate追加後のリモートTEST A/B、本人Smoke、拒否確認、41件の回帰、17本の移行リハーサル。
- [ ] 本コミットの本番用gateパッチを独立レビューする。本番側のflagはまだ設定・解除しない。
- [ ] CのUI flagとDB flagをOFFのままにし、先行利用者には本人スマホ後付けを案内しない。
- [ ] 先行利用者の実Account UUIDを運営が指定・承認する。架空QA IDを本番に転記しない。
- [ ] 現行本番artifact／Edgeソース・設定を退避し、PITR・バックアップの復旧可能性を確認。
- [ ] 環境設定の値を管理者が確認。今回取得したのは設定名のみ。
- [ ] 実行直前に本番カタログを再取得。差分があれば再リハーサルし、止める。
- [ ] ユーザーの本番反映承認を取得。

## 本人Account後付け公開に必須のRelease Gate（A/Bとは独立）

- [ ] Cを実SMS本人認証から実施。制作途中の同じPerson／Project／語り／購入／Bookが維持される。
- [ ] 本人設定から停止後、娘のRPC・RLS素材取得・署名URL新規発行を拒否し、再了承で復活しない。
- [ ] 実画面結果をレビュー後、接続公開を別途承認し、DBとフロントのC flagを両方有効化する。

### Cを再開するための手順

受信できる検証番号・SMS送信許可・受信コードが必要。既存の実電話番号を過去のfixtureから拾って無断送信しない。
検証時だけリモートTESTのDB `subject_connection_enabled` とTEST buildの `VITE_FAMILY_SUBJECT_CONNECTION_ENABLED` を明示的にtrueにする（現行buildスクリプトの既定値はfalse）。本番のC flagは変更しない。検証終了後はTESTもOFFへ戻し、結果の独立レビューを待つ。
そのAccountに既に別Personの本人紐付けがある場合、既存リンクを消さず、未接続の検証Accountを用意する。
A・Bは注文確定済みなので、Cの「制作途中」確認には別の架空Projectで未確定Bookを用意する。注文済みBookを巻き戻さない。
娘側の実画面で接続リンクを作成し、別ブラウザーで本人SMS認証→明示同意→接続を実施する。
接続前後のPerson／Project／語りID／注文ID／Book IDを比較し、本人設定から停止する。
娘側を再読込して制作素材・録音・編集・新規署名URL取得を拒否することと、再了承だけで復活しないことを確認する。
管理者によるDB直接紐付けやAuth改変を、この実画面確認の代替としてPASSにしない。

## 1. DB：17本だけを順に適用

|順|ファイル（`supabase/migrations/`）|
|---|---|
|1|202609170002_family_subject_connection.sql|
|2|202609170003_family_subject_rls.sql|
|3|202609170004_family_legacy_guards.sql|
|4|202609170005_family_creation_payer_guard.sql|
|5|202609170006_family_paid_journey.sql|
|6|202609170007_family_journey_guards.sql|
|7|202609170008_family_voice_adapter.sql|
|8|202609170009_family_photo_voice.sql|
|9|202609170010_family_story_editor.sql|
|10|202609170011_family_voice_revision.sql|
|11|202609170012_family_theme_navigation.sql|
|12|202609170014_family_legacy_question_index.sql|
|13|202609210003_production_supporter.sql|
|14|202609210004_production_start_audit_key.sql|
|15|202609210005_separate_production_mode_and_authority.sql|
|16|202609210006_preserve_supporter_sms_compatibility.sql|
|17|202609220001_family_pilot_release_gates.sql|

`170013`はTEST専用配信設定なので除外。既適用の15・16日付群、170001、SMS対応190004等も再実行しない。
`supabase db push`で未適用ファイルを全部流さない。個別ファイルのhash・適用履歴・依存を検証した実行用manifestを用意する。
初期rolloutはOFF／allowlist空。170004による旧SMS定義への上書きと006の復元を含むため、**途中状態をcommitして利用者へ露出させない**。
17本の外側を単一トランザクションとして実行できるよう、内側のbegin/commitを除去した実行用SQLを事前検証する。
短いlock timeoutを設定し、ロック取得失敗なら全体rollback。実データ量に応じたstatement timeoutは実行前に決める。無制限待ち／timeoutを増やすだけの再試行はしない。
新indexの4種類の重複数はいずれも0。リハーサルは外側単一トランザクションでも再実行し、各migrationのSHA-256を証跡に記録する。空スキーマ再現は実DBのロック時間・負荷の証明ではない。

## 2. Edge Functionsと本番反映対象

|関数|取得時の本番版|verify_jwt|予定|
|---|---:|---|---|
|create-checkout-session|48|false|制作Supporter認可＋本番明示gateを反映|
|transcribe-audio|42|false|family録音／素材の認可adapterを反映|
|polish-transcript|41|false|family制作アクセスを反映|
|publish-voice-edition|26|true|確定Book・制作権限の境界を反映|
|sync-checkout-session|33|false|現行bundleと差分がある場合のみ。既存v2同期を維持|
|stripe-webhook|32|false|現行bundleと差分がある場合のみ。署名とlive/test検証を維持|
|export-experience-data|9|false|共通family公開gate依存を反映。本人限定のまま|
|request-experience-refund|6|false|現行比較後、必要なfamily境界のみ。支払人と保証条件を維持|

共有ファイル：`_shared/family-release.ts`、`family-access.ts`、`experience-access.ts`、`experience-commerce.ts`。
今回TESTで更新した5関数はcreate-checkout-session／transcribe-audio／polish-transcript／publish-voice-edition／export-experience-data。
sync-checkout-session／stripe-webhook／request-experience-refundは今回未変更。公開停止で既に受領した決済同期・署名済みwebhook・正当な返金まで止めない。既存の認証・支払人・Stripe mode／署名検証を維持する。
共有コードを取り込む関数はbundle単位で更新する。JWT gateway設定は表と現行設定を再照合し、コード内部認証／webhook署名検証を省略しない。
現時点は版番号・設定の照合であり、現行bundle全体とのソース同一性確認ではない。無関係な差分を含む旧bundleを本番へ一括上書きしない。

フロント対象はレビューbranchの `src/Family*`、`src/lib/family*`、`src/main.jsx`、`src/App.jsx` のfamily導線接続と契約／Book adapter。
最新本番フロントとの差分を改めて限定し、元worktreeの未コミット変更や別機能を混ぜない。
本番配信物へQAスクリプト・セッション・スキーマfixture・証跡を含めない。

## 3. TEST固定拒否解除パッチ（実装済み・本番未適用）

単にTEST参照チェックを削除せず、次の公開パッチを実装した。

1. `familyRollout.js`／`familyConnection.js`：本番URL＋`VITE_FAMILY_PRODUCTION_ENABLED=true`でのみ本番入口/API adapterを許可。TESTはTEST URL＋`VITE_FAMILY_CONNECTION_TEST=true`。未知の環境は拒否。フロントflagは認可の根拠にしない。
2. `main.jsx`／`App.jsx`：先行利用者向けfamily入口へ接続し、HPの一般CTAは変更していない。`VITE_FAMILY_SUBJECT_CONNECTION_ENABLED`がない／falseなら本人接続リンク・電話入力を表示しない。
3. `_shared/family-release.ts`：本番URL＋`FAMILY_PRODUCTION_ENABLED=true`、TEST URL＋`FAMILY_TEST_ENABLED=true`をそれぞれ必須にする。DB `family_release_actor_allowed`でもrollout／actorを照合。既存の役割・制作了承・Person／Project／素材認可は別に維持する。
4. `FamilyDeliverySettings`：本番ではTEST専用RPCの入口を渡さず、テーマの配信設定ボタンも非表示。既存本番通知設定への自動変換はしない。
5. gate回帰：公開flagなし／不正ref／未認証／別Person／Viewerは拒否。production_modeだけで権限を与えない。本人利用の非family決済・録音を維持。

初期allowlistは `family_private.rollout.allowed_actor_ids` に**運営が承認した先行Supporter Accountのみ**。本人Accountは接続時に同じPersonへ追加されるので、別Personを新規作成させない。
追加migrationは既存の `family_supporter` と `family_production_supporter` の両方にDB rollout／actor gateを追加する。そのため、allowlist外・rollout OFFは新規作成だけでなく既存Supporterの制作RPC／RLS／素材新規取得も拒否する。本人Account・一般Viewerの既存権限と同一視しない。
`subject_connection_enabled`は初期falseで、招待発行・接続確定の両RPCを拒否する。既発行リンクでも接続できない。既に接続済みの本人を切断する設定ではない。

## 4. 本番環境値チェック（秘密値は資料へ記載しない）

|設定|確認事項|
|---|---|
|SUPABASE_URL／EXPERIENCE_COMMERCE_SUPABASE_URL|両方とも `https://wquxjeqkumossjxehdop.supabase.co`|
|EXPERIENCE_COMMERCE_MODE|live。Stripe key・webhookのモードと一致|
|EXPERIENCE_CONTRACTS_V2_TEST_ONLY|本番公開時false。既存の契約guardを残す|
|EXPERIENCE_CHECKOUT_ENABLED|運営承認どおり。停止は本人購入にも影響することに注意|
|APP_URL|現行の正式本番URL／return URL。TEST URLやpreviewへ遷移しない|
|FAMILY_PRODUCTION_ENABLED|本番Edge用。DB・Edge・フロント照合と承認まで未設定／false|
|FAMILY_TEST_ENABLED|TEST Edge専用。本番URLではこのflagをtrueにしても開かない|
|VITE_FAMILY_PRODUCTION_ENABLED|本番フロント用。本人既存導線とHP CTAを変えず先行入口のみ|
|VITE_FAMILY_SUBJECT_CONNECTION_ENABLED／DB subject_connection_enabled|C完了・別途承認まで両方false|
|VITE_PUBLIC_TEST_MODE|本番ではfalse。TESTの鍵／CSP／noindex設定を流用しない|
|VITE_EXPERIENCE_V2_ENABLED等|レビュー済みの本番設定を明示し、ローカル.envを混入させない|
|STRIPE_SECRET_KEY／STRIPE_WEBHOOK_SECRET|存在とモード・対象endpointを安全に確認。TEST秘密鍵を本番へコピーしない|
|SERVICE_ROLE_KEY／OPENAI_API_KEY|現行の正しいプロジェクト用設定を保持|
|EXPERIENCE_NOTIFICATIONS_ENABLED／SMS関連|今回自動的に有効化しない。TEST通知先を本番に移さない|

現状のmain pushはPages deployを起動するため、レビュー前のmain pushを切替手段にしない。現行の本番ホスティング先と公開artifactの同一性も確認する。

## 5. 実行順序（承認後のみ）

1. A/B先行利用の必須ゲートを満たす。C公開は別承認とし、接続flagはOFFを維持。実行責任者・対象UUID・戻すartifactを記録。
2. 最新READ ONLYカタログ取得→17本リハーサル→差分なしを確認。
3. 本番family公開flag OFF、DB rollout OFFで17 migrationを適用。commit前に005認可・006 SMS保全・新gate・RLS・権限を再確認し、履歴も同じトランザクションで登録。
4. Edgeを反映。未認証／未許可のfamilyアクセスは閉じたまま、本人利用の既存APIをSmoke。
5. 本番gateパッチを含む静的artifactを公開。一般HPの入口は変更しない。
6. 承認済み先行Accountのみallowlist登録し、family公開flag／rolloutを開ける。
7. 下記Smoke後に当該先行利用者へ案内。失敗なら新規入口を閉じ、必要なら既存制作も停止する。

## 6. 本番Smoke

- 未認証・allowlist外・Viewer・別Projectのアクセス拒否を確認。
- 既存本人のログイン／本人Person／語り一覧・再生／設定が維持される。
- 先行Supporterが本人Accountなしで意向確認→同じPersonで録音・保存・写真・編集へ進める。
- 購入と本編開始のactor／Person／Supporter了承、保証境界が一致する。
- 家族共有OFFの素材は制作Supporterにだけ見え、一般Viewerへ漏れない。
- A/B公開では本人接続UIがなく、接続RPCも拒否することを確認。接続→停止→再了承拒否の実画面確認はCの公開条件として別管理する。
- 本番注文・課金・印刷発送をSmoke目的だけで実行しない。運営が別途承認した購入のみ扱う。TESTカードをliveに入力しない。
- エラー率・権限拒否・webhook受領・注文重複を監視する。自動継続監視は別途設定。

## 7. rollback / gate close

1. `FAMILY_PRODUCTION_ENABLED=false`とフロント入口停止でfamilyの新規Edge処理を閉じる。決済確定済みのwebhook処理は継続する。
2. 既存SupporterのDB制作も止める場合は `family_private.rollout.enabled=false`。追加migrationにより旧Supporter経路も閉じる。限定停止は対象Accountをallowlistから外す。復旧は原因修正後、承認済みUUIDとflagsを復元し再Smoke。本人／一般Viewerの既存閲覧を一括剥奪しない。
3. 新規checkout停止は既存本人購入にも影響。決済障害時だけ影響を説明して実施。受領済みStripe webhookは停止しない。
4. 関連フロント／Edgeを保全済みartifactへ戻すかforward fix。ただしfamily Projectが生じた後、family認可を持たない旧Edgeへ単純rollbackしない。
5. Person・Project・語り・Book・注文・同意／監査履歴は削除しない。旧Account単位unique indexへの復元やDB全体巻戻しは自動実行しない。
6. 既発行signed URLやダウンロード済み素材は即時回収できない。以降の新規取得拒否と、残存アクセスの有効期限を分けて確認する。

**本書の存在は本番公開の承認を意味しない。A/B公開パッチのレビュー・先行利用者UUIDの承認後にA/Bを公開できる。Cは別のRelease Gateを通るまで案内・利用を停止する。**
