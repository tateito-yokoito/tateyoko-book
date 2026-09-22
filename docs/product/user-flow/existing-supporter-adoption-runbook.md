# 既存本人Projectへの制作Supporter移行（対象限定）

## 範囲と現在の承認

2026-09-22。承認は **TEST検証・本番実行手順の提示まで**。
本番データ、allowlist、rollout、サーバー／フロント公開flagは変更しない。
管理画面、汎用招待画面、HP、mainへのpushは対象外。

本番対象は `scripts/deploy/existing-supporter-adoption.mjs` の
`approvedProductionTarget` に固定された母本人Account／娘Supporter／Person／Project／既存注文1組のみ。
登録済みSupporterメールが娘本人のものとの運営確認は取得済み。
メール・パスワード・セッションは本書やGitへ載せない。

## 再確認した前提

- 母は既存の本人Account、selfリンク、Projectのowner・既存契約の購入者を維持する。
- 娘は既に別Auth Accountを持ち、認証・旧Supporter招待承諾済み。再招待／Account再作成は不要。
- 既存注文は `zero_paid`、`self_book_v1`。契約は本人購入・30日保証、本編開始済み。
- 語りは6件。本人の契約や返金条件を新たな45日ギフト契約へ置換しない。
- 現行 `family_enable()` は本人selfリンクのあるPersonを拒否する。このガードを汎用的に緩めない。
- Cは「新しい本人端末をSMSで接続する」機能。今回は既に存在する本人関係を保持する移行であり、Cの新規claimは行わない。

## 変更の最小単位

### アプリ（TEST検証用変更。本番未反映）

1. `src/main.jsx`：メール認証の既存本人も、本人bindingがあれば通常の `/?app=1` から同じ物語のfamily画面へ進める。
   RLS下で自身のbindingだけを照合する。照合失敗時は旧Person作成へフォールバックせず再確認表示。
2. `src/FamilyConnectionTest.jsx`：既存語りがある人に「最初の問い」の案内を再表示しない。

本人は同じAccountで続けられる。ただし移行対象Projectの画面はfamily対応の共通制作画面になる。
未移行の本人Accountを一律にfamilyへ切り替えない。

### DB：運営トランザクション

永続RPC・テーブル・migrationの追加なし。SQL生成モジュール自体は接続も実行もしない。

- 対象のAccount、selfリンク、owner、既存Supporter ID、注文、Person内のProject数、公開作品の有無を検証。
- Account／Person／Project／注文／契約／語り／写真・音声メタデータ／Supporter／招待／共有／収録のハッシュを直前照合。
- `family_subject_bindings` に **1行だけ追加**：
  - `person_id`：既存の母Person
  - `subject_user_id`：既存の母Account
  - `initiated_by`：娘Account（rolloutの対象スポンサー。運営操作者を娘と偽らない）
  - `claimed_at`：既存selfリンクの作成日時
  - `consent_version='existing-self-link-v1'`：新たなSMS認証／本人同意取得の記録ではない
  - `production_mode='self'`：移行だけで制作権限や進め方を変更しない
  - `progress_enabled=false`：移行による新たな進捗公開をしない
- `activity_logs` に運営操作を記録。operator reference、承認reference、DB session user、対象、変更前後ハッシュを残す。
  `actor_user_id` を母や娘に偽装しない。
- 本人／娘のAuth、selfリンク、既存Supporter行、注文・契約、語り、家族共有にはUPDATE／DELETEしない。
- 移行と同時に制作了承を捏造しない。娘が既存画面で「本人に確認しました」を明示的に操作する。
  その操作が有効な `family_production_consents` とactor／日時付き `family_production_events` を作る。

`SERIALIZABLE`、対象ロック、3秒lock timeout、60秒statement timeoutを使用。
対象違い、snapshot drift、二重実行は停止。失敗したSQLをガードを外して再実行しない。

## 本番実行順（まだ未承認・未実行）

1. 本書・TEST証跡・フロント差分をレビューし、**本番移行と娘1件の開放を別途承認**する。
2. 利用者に短い作業時間帯を案内し、母娘の制作操作を止める。最新カタログ／deployment／Edge／対象データをREAD ONLY再取得。
3. 安全なローカル領域へ保護対象ハッシュと既存状態、rollback用情報を保存。フロントの退避先も確認。
4. 上記2つのフロント修正を含む本番artifactを準備。HPは変更せず、本番公開flagの別途承認範囲を再確認。
   HPは別タスクで更新され得るため、**実行時点の最新本番ソースへ2箇所だけ適用**する。
   今回のTEST artifactや旧closed-release artifactで最新HPを巻き戻さない。
5. 娘UUIDだけのallowlist、DB rollout／server flag／frontend flagを、別途承認された順序で有効化。CはOFF。
   この段階では既存Projectはまだnon-familyなので、新しい制作権限は付かない。
6. `adoptionSQL(approvedProductionTarget, {operatorReference, approvalReference, expectedSnapshot})` で生成した対象限定SQLをレビューし1回実行。
   移行後の本人書き込みがサーバーgateで止まらないよう、必要なflagと新フロントの準備完了を確認してからbindingを追加する。
7. 娘が本人の意向を確認し、ログイン済みの自分のAccountで制作了承。運営はその代わりに本人として認証しない。
8. 母・娘とも同一Projectへ進めること、第三者拒否、C非表示、購入再請求なしを確認。実録音・注文は本人たちの操作・了承のもと行う。

SQL生成時のハッシュは最新READ ONLY結果を渡す。TESTのIDやハッシュを本番へ流用しない。
本番用SQL生成は対象固定。今回のコードには本番実行CLIを作っていない。

## rollback / 障害対応

### commit前

トランザクションをROLLBACK。既存データに変更を残さない。

### commit後、制作了承・利用前のみ

`preUseRollbackSQL()` は同じ対象・変更前ハッシュを要求する。
制作了承、family upload、新規接続invite、既存状態の変更があれば拒否する。
条件を満たす場合だけ今回のbinding1行を外し、復旧操作を監査記録する。
母・娘のAccount／Project／注文／語り／旧Supporter／家族共有は削除しない。

### 制作了承後／利用後

**bindingを削除しない。** 削除すると旧Supporter権限が再び有効になる恐れがある。
母本人の設定から制作Supporterを停止し、`revoke`のactorと時刻を記録する。
運営緊急停止が必要なら、実在する運営actorの記録・権限を確認した対象限定の別手順をレビューし、本人を偽装しない。
新規録音・写真・編集・Book・注文は保持してforward fixする。

- 娘の制作停止後も、明示的な家族共有で許可済みの閲覧は別関係として残す。
- motherの継続を優先する通常復旧では、本人routingを含むフロントとgateを維持し、対象Supporterの制作権限を停止する。
- 全体障害でserver flag／rolloutを閉じる場合、**移行済み母の一部書き込みも止まる**。利用停止を案内し、データを保ったまま修正する。
- この移行後に旧フロントへ機械的に戻すと母の通常入口を壊す可能性がある。bindingを維持する復旧では本人routingの修正も維持する。
- 全DB復元、Storage削除、Stripe巻戻しは通常復旧に含めず別承認とする。

## Accountと物語開始の区別

SupporterとしてのAccount作成・認証・支援は、自分の物語開始ではない。
無料3問の回答は対象Person／Projectで数える。娘が操作した母の回答を娘の無料体験完了と数えない。
空のPerson／Projectが存在しても、語り開始の証拠とは扱わない。
管理画面の表示改善は後続タスクであり今回のRelease Gateにはしない。

## TEST結果

2026-09-22、リモートTEST DB／Edgeと `https://tateyoko-book-test.vercel.app` の実画面でPASS。
最終TEST deployment：`dpl_4MfdGnahYsKTFAgjnoS1AuWUHyoe`。
TEST frontend JS：`index-4ArG1ClS.js`。本番へは反映していない。

| 検証 | 結果 |
|---|---|
| 母本人＋娘Supporter＋本人30日契約＋zero_paid＋6件の語りを架空データで再現 | PASS（顧客の語り・連絡先をコピーしていない） |
| 移行直後の保護対象全行ハッシュ | PASS（Account／Person／Project／契約／語り／共有／関係を変更しない） |
| 移行だけでは娘に制作権限を付与しない | PASS |
| 娘が画面で明示的に制作了承 | PASS、consent/modeのactorは娘 |
| 録音→Edge文字起こし・文章化→保存 | PASS、同一Person／Project |
| 既存文章の編集・写真追加 | PASS、本人の意向確認済み制作操作として実施 |
| 収録選択→仕上げ→TEST注文受付 | PASS、Book確定1件。既存注文と新しいTEST注文は別ID |
| 母の通常 `/?app=1` から既存の語りを表示 | PASS。旧bootstrapへの誤進入・初回案内再表示を修正 |
| 母の設定から停止 | PASS、revokeのactorは母 |
| 停止後の娘のworkspace／録音予約／Book／自己再了承 | すべて拒否。画面にも制作入口なし |
| 停止後も母本人が録音・保存 | PASS、同じProjectに語り追加 |
| 最終時点の本人関係・Auth／profile・旧Supporter・招待・共有・契約 | ハッシュ一致 |
| 元の購入注文 | 全行ハッシュ一致。30日契約も維持 |
| 元の6件の語り | 6件とも保持。うち1件は編集・写真追加のテストで意図的に更新。移行操作自体では全行ハッシュ一致 |
| 娘自身の語り | 0件。母の回答を娘の体験実績へ算入しない |
| Viewerの制作付与・制作アクセス | 拒否。明示的な共有関係は保持 |
| Cの新規本人接続 | OFF、招待RPC拒否 |
| 対象外本番ID／snapshot drift／二重移行 | 拒否 |
| 了承後のbinding削除rollback | 拒否。利用後はforward fix |
| 既存SQL認可回帰 | 135チェック＋制作Supporter＋公開gateのテストPASS |

実画面証跡：`output/existing-supporter/` の `daughter-consent.png`、
`mother-normal-entry.png`、`EXISTING-record.png`、`EXISTING-edit.png`、`EXISTING-book.png`、
`mother-stopped.png`、`daughter-denied.png`、`mother-after-stop.png`。
読み取り照合：同ディレクトリの `evidence.json`。

検証スクリプトの旧画面待機条件（テーマ完了画面）、void RPCの204応答、保存RPC名を修正して再実行した。
それらを本番障害や未保存とは扱わない。最終の各検証はPASS。

実課金・実印刷発送・実SMS・顧客Account操作はしていない。メール送信もなし。
利用前rollbackの成功経路は本番未実行であり、使用後の拒否経路をTESTで確認した。
秘密セッションを含む `*-private.json` はGit・公開サイトへ含めない。
