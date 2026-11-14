# 受け入れ条件・検証台帳（正本）

本書はリリース前に確認すべき条件であり、合格済みの宣言ではない。結果には **成功／失敗／未実施**、環境、コミット、証跡を記録する。仕様は [product-spec.md](./product-spec.md) を参照する。

| 領域 | 受け入れ条件 | 既存の主なテスト |
| --- | --- | --- |
| 無料3問 | 1/3〜3/3の表示と質問・保存内容が一致。終了後に共通購入へ進み、購入済み受取人を再購入へ誘導しない。 | `guest-trial-claim.test.mjs`, `trial-written-retention.test.mjs`; モバイルE2E要確認 |
| 商品・請求 | HPと無料体験後が同じ商品選択・認証・最終確認・Stripe開始を使用。35,000円／65,000円、オプション、割引と見積・請求額が一致し、旧注文は保持。 | `commerce-v2.test.mjs`, `commerce-v2-checkout-gate.test.mjs`, `delivery-entry.test.mjs`; Stripe test mode E2E要確認 |
| ギフトA/B | 購入済み作品に接続し、基本商品を二重購入させない。A受取人は本編、B代理制作は同じ5段階の仕上げへ進む。 | `gift-purchase-mode.test.mjs`, `gift-purchase-intent.test.mjs`; 実決済E2Eは未検証 |
| 権限・非公開 | 制作管理者・共同管理者は最終確定可、お手伝い中は最終確定・追加決済不可。非公開の語り・写真・音声・動画をお手伝い中がUI・API・DB・Storageから取得・変更できない。 | `helper-private-access.test.mjs`, `book-completion-role.test.mjs`; 認証付きE2E要確認 |
| BOOK完成 | 0円は直接確定、追加決済は成功時のみ作品版・注文・配送先を一括確定。失敗・中断は編集可。Webhook重複でも二重確定・二重請求なし。 | `book-completion-role.test.mjs`, `bookshelf-pending.test.mjs`; DB/Stripe test mode E2E要確認 |
| 公開と本棚 | 完成確認中は閲覧専用・Webブック非公開。公開後は本棚から閲覧・再生でき、通知は成功時一回のみ。完成原本は編集不能。 | `book-publication-notice.test.mjs`, `bookshelf-pending.test.mjs`, `book-pdf-server.test.mjs` |
| 季節の記憶箱 | 公開当日から利用可。JSTの季節境界、1季節1件、前季猶予、写真だけの確定、空箱終了、自動確定、保存失敗時の誤表示防止。 | `seasonal-memory.test.mjs`; 端末・通信切断E2Eの証跡要確認 |
| 記憶のかけら・カギ | 一覧・詳細・写真・音声を閲覧可。カギ付き記録は本人だけが見られ、家族は直URL・Storage経由でも取得不可。 | `seasonal-memory.test.mjs`; 多ユーザーRLS・Storage E2E要確認 |
| 回帰 | 本人購入・ギフトA/Bの質問回答、写真から語る、BOOK仕上げ、Webブック閲覧を維持。 | `npm run test:answer-ui`, `unified-app-release.test.mjs` 等 |

表のテスト名は `scripts/tests/` 内。Node単体テストだけで認証・DB・Storage・Stripeの合格とはしない。

## 実行と記録

1. 変更した仕様・コード・migration・Edge Functionsを列挙する。
2. 影響範囲に絞って既存テストを実行し、API・DB・Auth・Storage・Stripeの挙動は架空データの隔離環境でE2E確認する。
3. 顧客データは複製しない。外部AI送信・実決済は承認条件に従う。
4. 環境・コミット・成功／失敗／未実施・残存リスクを報告する。本番反映は承認された範囲と順序に限る。

## 現時点の不足

- この正本作成時点のmainで表の全項目を一括実行した証跡はない。過去のE2E結果を現在コミットの合格証明として扱わない。
- 無料3問のモバイル表示・購入後継続、ギフト実決済、BOOKと季節の共通入力・保存は、コードと実環境の一致を個別に要確認。
- 本番固有の設定・既存注文・顧客状態に関わる検証は、安全な反映計画が別途必要。
