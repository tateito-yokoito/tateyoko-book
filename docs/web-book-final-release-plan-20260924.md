# 初回BOOK＋Webブック完成 最終リリース計画（本番未実行）

更新: 2026-09-24 JST。実装候補commitは `231f581ce2470e802c2b8878112e3bcddb097a1e`（`codex/production-supporter-delegation`）。素材認可・コピー再試行・Stripe TEST完成の証跡は `web-book-copy-integrity-20260924.md`。この文書は計画であり、DB・Edge・Front・Stripeの本番変更や公開ゲート操作は行っていない。

## 判定

**NO-GO：先行利用者だけを対象にする本番公開を、このcommitのまま開始することはできない。** `book_completion_rollout` は `enabled boolean` だけを持ち、`prepare_book_completion` はその全体値を確認する。Edge `BOOK_COMPLETION_ENABLED` とFront `VITE_BOOK_COMPLETION_ENABLED` も全体値である。3つをONにすると、権限のある全顧客が新しい完成導線に入れる。Family用allowlistは本人起点BOOK完成の制御には使えない。

閉鎖反映に必要なDB・素材互換性・EdgeのTESTはPASS。ただし、Front候補ブランチは現在配信中のHPソースと異なる。現在配信されているHPを保った統合Front artifact、および限定公開のサーバー側gateがまだ固定・TESTされていない。**本番反映開始の総合判定も現時点ではNO-GO。** これらを解消してから、対象release commitを確定し再判定する。Safari実機・実動画E2Eだけを理由に止めているわけではない。

## 対象と除外

- 対象: 初回BOOK注文 → Stripe決済成功 → 完成snapshot／恒久URL／Webブック正式公開 → 本棚作品セット → リンク共有・4桁PIN・公開停止／再開。制作中の管理者Live Previewと「顧客体験を見る」の閲覧専用導線も含む。
- 対象外: Premium追加、完成後増刷、QRの印刷会社への実入稿接続、Family/Cの新たな開放、HP一般導線の変更。QR設定と恒久URLの入稿用取得境界は既存実装の範囲に含む。
- 先行開放はAccount単位に限定する。全体booleanをONにするだけの運用を「限定公開」と呼ばない。

## 2026-09-24の読み取り結果

|項目|確認結果|
|---|---|
|GitHub main|`ad017b8e1846ca22783bf8a3085b129f461540a6`|
|対象ブランチ|GitHub上の `f129118aca765a33bf78079e7ce1981837d1bbd6` は実装候補commitの祖先。候補commitはローカル固定、未push。最終release commitではない|
|本番DB|READ ONLYでmigration 115本、最新 `202609220002`。完成候補・rollout tableは未作成|
|本番Edge|`public-voice` 26、`publish-voice-edition` 27、`create-checkout-session` 49、`sync-checkout-session` 33、`stripe-webhook` 32。`cancel-book-completion`／`web-book-preview` は未作成|
|本番設定|`BOOK_COMPLETION_ENABLED` は未設定＝現行判定OFF。`FAMILY_PRODUCTION_ENABLED` 未設定。商用決済モードはlive。秘密値は取得・表示していない|
|本番Front|HTML SHA-256 `3a638e4774fa0e54665544544d7209f081accccb5308afe4b1f9c36070a15e1a`、JS `index-B9e-VcVW.js`、CSS `index-CyDNISLh.css`。以前のVercel deployment ID `dpl_HGcncon2HkXVUp6MbaiUXAWmu7CA` は実行直前に再確認|
|本番素材|READ ONLY監査で使用中27件（音声25、表紙2）、新認可で27件許可・拒否0。既存公開Webブック0、動画0。未参照音声2件は未変更|
|DB再リハーサル|最新本番catalog取得後、未適用10 migrationをローカル復元へ順次適用PASS。結合SQL SHA-256 `06f92150b7adb0a137d147f87adb9a235e1c6f9d93666cb34c6fba2eed5a166c`。本番への適用はゼロ|

## 実行前に確定するもの

1. **限定公開gate**: 既存 `book_completion_rollout` にAccount allowlistを追加する最小変更を設計し、`prepare_book_completion` の本人／制作Supporter actorをサーバー側で照合する。checkout／publishは許可済みcandidateに結びつくことを検証する。Frontも対象外Accountに完成導線を出さない。allowlist外、別Account／Project、失効Supporter、既存候補再試行、支払中のgate closeをTESTする。既存の全体OFFを維持し、allowlistは空で初期化する。これに伴うmigration・ハッシュ・対象commit・TEST証跡を更新する。
2. **Front統合artifact**: 現行本番HPの実ソース／deploymentを特定し、そのデザインと配信assetを保持したまま承認済みWebブック／本棚／管理者導線を統合する。`VITE_BOOK_COMPLETION_ENABLED=false/true` の2 artifactを同じ統合commitからbuildし、画面差分・HP・本人導線の回帰を確認する。現在の候補ブランチをそのままVercelへ反映しない。
3. **release commit固定**: 1・2の変更を含むcommit SHA、10本＋追加があればそのmigration一覧／ハッシュ、7 Edge bundle・JWT設定、Front 2 artifact・ハッシュを確定する。対象外の未コミット変更を含めない。現行配信Frontのdeployment ID、対象Edgeの版と設定、本番catalogを実行直前に再取得し、差異があれば停止して再リハーサルする。
4. **復旧資料**: 現行Front deployment、5既存Edgeの版・JWT設定、非秘密環境値と秘密設定の存在、DB関数定義、DBバックアップ／PITR状態、注文候補0件の基準値を退避する。PITRは前回OFF。Storage・StripeはDB全体復元と同時には戻らない。

## 閉じた本番反映の順序（上記解消・別途承認後）

1. DB: 本番の実際のmigration履歴・関数定義・表・素材監査をREAD ONLYで再照合。未適用分だけを検証済み順序で適用する。現候補は `202609230001`～`202609230008`、`202609240001`、`202609240002` の10本。限定公開用migrationを追加した場合は最後に置き、ローカル再リハーサルをやり直す。外側transactionで適用し、commit前にrollout OFF・allowlist空・権限・既存データ不変を確認。失敗時はtransaction rollback。無差別な `db push` は使わない。
2. Edge: `BOOK_COMPLETION_ENABLED=false` を明示して、`public-voice`、`publish-voice-edition`、`create-checkout-session`、`sync-checkout-session`、`stripe-webhook`、`cancel-book-completion`、`web-book-preview` の7本だけ反映。既存のgateway JWT設定、Stripe署名検証、商用キー／Webhook設定を維持。publish bundleに `_shared/immutable-publication-copy.ts` と素材認可の修正が入ることを確認。
3. Front: 現行HPを保持した統合artifactの完成フラグOFF版を反映。Family/Cと一般HP CTAは現行状態を維持。配信HTMLとJS/CSSのハッシュを記録。
4. DB rollout OFF、allowlist空、Edge OFF、Front OFFのまま、表・関数・Edge版・ログ、既存顧客の画面を確認する。新候補、公開Webブック、本棚作品セットが想定外に増えていないことを確認。ここでは購入・録音・編集・実課金を行わない。

## 公開前smokeと確認の限界

- 本番HP、ログイン、本人ホーム、既存語り一覧・音声再生、本棚、管理画面の対象Project詳細と「顧客体験を見る」を、権限ある閲覧者で確認する。一般Viewer・対象外Projectが管理情報に入れないことも確認する。閲覧で監査ログ等が更新される場合はその範囲を事前に記録する。
- 本番公開Webブックは現時点で0件。従って、本番の既存公開Webブック閲覧、PIN変更、公開停止／再開の成功系を「smoke PASS」とは報告しない。これらはTEST証跡を参照し、最初の先行作品完成後に顧客同意の範囲で確認する。公開前には未認証・誤PIN・非公開draftへの拒否など、既存顧客データを変更しない境界確認のみ行う。
- 管理者Live Preview、PIN設定変更、公開停止は書込みまたは監査ログ更新を伴うため、READ ONLY事前照合には含めない。初回完成後の監視項目とする。
- Front OFFは旧BOOK注文処理への分岐であり、すべてのBOOK注文を止める機構ではない。閉鎖smoke中に顧客の代わりに注文を押さない。

## 先行利用者への有効化（限定gate完成・別途公開承認後）

1. 許可する実在Account UUIDと対象Projectを本人確認し、allowlistにそのAccountだけ登録。残りのAccountの拒否をTESTと本番の非課金境界で確認する。候補0件・決済中0件を起点にする。
2. Front ON版を配信。DB rolloutとEdge完成フラグはOFFのため、新完成候補は作れない。対象外AccountにはUIを出さないことを確認。
3. Edge `BOOK_COMPLETION_ENABLED=true`。DB rollout OFFのため、新候補作成はまだ拒否。
4. 最後にDB rolloutをON。DB allowlistとEdgeの認可が重なった状態で、対象Accountだけの初回導線を非課金smoke。対象外Account・別Project・Viewer・失効Supporterを拒否。最初の実注文では候補・Stripe payment・公開作品・本棚・素材・恒久URLの一意性を監視する。本人Account以外への開放やHP一般CTA変更は含めない。

## 異常時と戻し方

|事象|即時操作|データ／復旧|
|---|---|---|
|対象外Accountが候補作成可能、別Project素材、非公開作品の漏えい、PIN bypass、公開停止無効|DB rolloutをOFF。必要ならEdge完成フラグもOFFにして新しい完成処理を止める|対象候補・公開ID・監査ログを保全し、根拠を調査。DB commit後のmigrationを一括巻き戻さずforward fix|
|素材欠損、誤コピー、完成／本棚の重複、決済成功なのに未完成、Webhook異常|DB rollout OFF、完成処理の安全性に疑義があればEdge OFF|決済中／成功済みの注文・candidate・publication・Storageを削除しない。Stripe照合後、同一注文を修正版のsyncで再確定。成功決済を未払いに書き換えない|
|FrontのHP・既存本人導線に回帰|まずDB rollout OFF。候補・決済中が0件なら退避済みFrontへ戻す|候補が既にある場合は旧注文UIへ全体復帰しない。互換性のある修正版または停止表示を配信|
|DB migration内で失敗|transaction rollback、gate OFFのまま停止|commit後は履歴・新table・顧客データを保持してforward fix。全DB復元を通常のrollbackにしない|
|Edge反映に失敗|gate OFFのまま停止|新完成ゲートを閉じ、互換性を照合した版だけ再配信。認可欠陥のある旧publish Edgeを新完成導線に併用しない|

DB rollout OFFは新candidateの作成を止めるが、決済中を自動キャンセルしない。Edge OFFにすると支払成功後の確定も一時停止するため、必要時に限り閉じ、成功決済は再照合して同一candidateに収束させる。障害時の顧客連絡・処理再開は注文ID単位で管理する。

## 未確認・後続

iPhone Safari実機、実動画E2E、大きい動画のEdge実行時間、孤児Storageの安全なGC、未参照音声2件の由来は未確認・後続タスク。Premium追加・完成後増刷・QR実入稿も今回の公開範囲外。これらをPASS扱いにしない。今回のNO-GO理由は限定公開gateとFront統合artifact／最終release commitの未確定である。
