# Webブック完成素材の認可修正・TEST検証（2026-09-24）

> 最新追記: 上記認可修正後に発見したcleanup問題は、自動削除廃止・内容検証付き再利用へ修正し障害注入TEST済み。最新判定は `web-book-copy-integrity-20260924.md` のCONDITIONAL GO。本書以下のNO-GO／未実施は当時の記録として残す。本番未反映。

> 後続レビューによる訂正: DB結果が不明なときのcleanupは、確定済み参照先を削除し得るため「孤立コピーが残るだけ」とは言えない。認可のTEST結果は維持するが、公開判定はNO-GOへ更新した。詳細は `web-book-production-source-audit-20260924.md`。障害注入は未実施。

本番DB・本番Edge・本番Stripeには反映していない。TESTでは `202609240001`、`202609240002` を適用し、`publish-voice-edition` を更新した。検証終了時、TEST DB rollout と Edge `BOOK_COMPLETION_ENABLED` はともに OFF。

## 1. 原因

旧 `publish-voice-edition` は、音声・写真・動画について `requireFamilyAssetAccess()` の真偽値を確認せず、`false` でも service-role でStorageをコピーした。表紙写真には認可呼び出し自体がなかった。通常の本人作品では家族専用関数が正規素材にも `false` を返すため、同関数だけでは本人作品の所有境界を表現できなかった。

## 2. 修正内容

`publication_source_asset_allowed` を service-role 専用RPCとして追加。完成対象の全コピー素材を列挙して、**一つもコピーする前に**全件の戻り値が厳密に `true` であることを確認する。家族管理作品には既存の家族素材認可も重ね、こちらも `true` 以外は拒否する。検証対象は本文音声、語り足し音声、写真、動画本体、動画の音声・ポスター、標準・プレミアム表紙。

`202609240002` では旧回答の `user_question_id` が空の場合に限り、実在する質問カタログ `question_id` で安全に結び付ける後方互換を追加。新しい質問IDが指定されている場合は同一Project所属を必須にする。

## 3. 認可境界と完成処理

RPCは、Storage実体と正のメタデータ行、Project、対象Person、Answer、質問、Account/有効Supporter、path構造を照合する。`family/...` は確定済み `family_uploads` とAnswerを照合する。別Project・別Person・別Account/family・別bucket・改ざんpath・欠損Storage・他の語りへの同一path再利用は拒否する。クライアントのpathは認可根拠にしない。

一件でも認可できなければ、コピー前に完成処理全体を停止する。途中のStorage失敗またはDB snapshot RPC失敗時は、この試行で**新規作成した**コピーだけを逆順に削除する。再試行で使う既存コピーは消さない。DB側の正式snapshot更新は一つのRPC transactionで行う。ただし、DB応答喪失／並行実行でこの試行のコピーが他の成功処理から参照されている場合をcleanupが識別できない。単独・初回のコピー途中失敗と異なり、欠損した完成作品へ進む可能性があるため、公開前の修正が必要。

## 4. PASSした攻撃・異常系TEST

- ロールバック付きTEST SQLで15ケース：正規の音声、語り足し、写真、動画、動画音声、ポスター、標準/プレミアム表紙を許可。別Project、同Project別Person、別Account/family、欠損path、改ざんpath、誤bucket、公開済みpathの再利用を拒否。
- リモートTEST公開Edgeで、正規音声＋不正写真1件の隔離作品を拒否。publication 0件、completed候補 0件、本棚追加 0件。最終Edge版でも再確認。
- 既存TEST家族アップロードの正規関連57/57件で新RPCが許可。権限のある家族制作Accountの既存認可は44/44件許可。
- 旧質問互換後、TESTの確定済み自己作品で正規v2 pathは48/48件許可。QA用特殊path 3件とその他非標準path 4件は拒否を維持。

## 5. 正常系回帰

- リモートTESTで正規音声・写真のコピーとSHA-256一致、公開作品再呼び出しの冪等性を確認。
- **最終Edge版**で、隔離作品の注文候補 → Stripe TESTカード決済 → 完成候補1件 → 公開Webブック1件 → 本棚表示1件を確認。実課金なし。
- 決済後、隔離作品の制作元文章と音声・写真参照を変更しても、完成Webブックの本文、コピー済み音声・写真のSHA-256、恒久public IDは不変。
- `git diff --check`、Edgeのbundle構文チェック、Webブック既存テスト、アプリbuildをPASS。

## 6. 未確認事項

iPhone Safari実機はこの環境から操作できず未確認。動画のDB/Storage認可は正規動画・音声・ポスターのTEST SQLで確認したが、実カメラ/動画ファイルのアップロードからStripe決済、完成Webブック再生までの実動画E2Eは未実施。Storageコピーの途中失敗時にcleanupが実際に成功する障害注入テストも未実施。TESTの非標準path 4件は安全側に拒否しており、個別の移行要否を本番適用前に確認する。

## 7. リリース判定

今回の `false` を無視したservice-roleコピーという本番リリースブロッカーは、実装と隔離TEST上は解消。**本番反映は未承認・未実施**。適用前に最新本番カタログのdrift、非標準pathの利用状況、migration 2本の適用順をREAD ONLYで確認する。動画実機E2EとiPhone Safariは未確認として残す。
