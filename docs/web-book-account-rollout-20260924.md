# 初回BOOK完成のAccount限定rollout（TEST済・本番未反映）

2026-09-24 JST。対象は新しい「初回BOOK注文 → Webブック完成 → 本棚」ライフサイクルだけ。HP改修ブランチ、配信中Front、本番DB／Edge／Stripe／顧客データは変更していない。

## 判定の単位

`book_completion_rollout.enabled` が全体の緊急停止スイッチ。追加した `allowed_account_ids` は初期値が空。新導線の開始条件は **全体ON ∧ 実際に操作している認証済みAccountがallowlist対象 ∧ そのAccountに対象Projectの制作権限がある**。Frontのフラグは表示制御だけで、認可根拠にはしない。

本人利用では本人Account、制作Supporter利用では制作を操作し注文するSupporter Accountを判定する。Person／作品所有者のAccount、既存の購入者、family全体をallowlistへ自動展開しない。制作Supporterは自分の担当Projectだけ利用でき、一般Viewerや別Projectにはallowlist登録だけでは権限を得られない。Checkoutの購入者は候補の `requested_by` と一致させる。

## 強制境界

- DB `prepare_book_completion`: `auth.uid()` のallowlistと既存のProject制作権限／本人意向確認を必須にする。
- DB `create_book_completion_order`: service-role専用のまま、候補の `requested_by` と購入者が一致し、その購入者がまだallowlist対象であることを注文作成直前に再検証する。
- Edge `publish-voice-edition` の `prepare_completion`: 候補・Project・既存認可に加え、操作者AccountをDBで再検証してから素材準備へ進む。
- Edge `create-checkout-session`: 候補・Project・購入者の一致に加え、購入者AccountをDBで再検証してから既存注文の再開／新規注文へ進む。
- Front `Scene_BookBuilder`: Project単位の `can_use_book_completion` を取得。対象外には新Webブック完成設定を見せず、従来画面を維持する。候補作成後にallowlistを外された場合は候補を旧注文へ流さず、新規続行を止めて取消導線を残す。

決済に進んだ後で全体gate／allowlistが閉じられても、**既に成功した支払いの確定処理**は同じ注文・候補へ冪等に収束させる。支払済み注文をゲート停止だけで宙に浮かせないため、webhook／syncの最終確定でallowlistを再要求しない。新たな候補・素材準備・Checkoutは拒否する。

## TEST証跡

- `202609240003_book_completion_account_rollout.sql` をリモートTESTでtransaction rollbackリハーサル後に適用。初期全体OFF／allowlist空、内部allowlist非公開、authenticatedのcapability関数、候補／注文ガードを確認。
- 保存済み本番catalogへ未適用11 migrationをローカルで順次再現しPASS。結合SQL SHA-256 `1b0cacb77f459b91c5f2cb7d6177c95f7dbce2eb77767fa47465f431942f8695`。本番実行前には最新catalog取得とdrift照合をやり直す。
- リモートTESTで対象Accountは候補作成・素材準備が可能。非対象Accountはcapability false／候補作成RPC拒否。allowlistから外すと既存候補の素材準備・Checkout直接呼出も拒否され、注文は作成されない。再追加で復帰。全体OFFはallowlist登録済みでも拒否。
- TESTの制作Supporterは了承済みの担当Projectでのみcapability true。別Projectと一般Viewerはfalse。本人による制作権限停止後もfalse。
- 390pxの実BookBuilderブラウザ検証で、対象外は従来画面、候補を持つAccountのallowlist解除時は旧注文へのフォールバックなし、注文続行は停止・取消可を確認。
- 隔離TEST作品で許可AccountのStripe TEST決済成功 → completed candidate 1件 → 正式Webブック1件 → 本棚作品セット → 実Storage音声・写真を確認。実課金なし。
- TEST終了時、DB rollout OFF／allowlist空／Edge `BOOK_COMPLETION_ENABLED=false` へ復帰。TESTに作成した隔離作品・決済記録は検証証跡として残す。本番変更なし。

## 残る本番ブロッカー

HP側の最終commit未確定。現在配信中HPとHP改修ブランチを巻き戻さない形で、**最新HP＋今回のアプリ／Webブック実装**を統合したFront release candidateを別途作る。Frontの本番固定・配信はこの作業に含めない。統合後にbuild／画面差分／既存HP・本人導線の回帰、対象commit・artifact hash、最新本番DB catalog／Edge／deploymentのdrift照合、最終GO判定が必要。

Safari実機・実動画E2E、孤児Storage GC、未参照音声2件は未確認／後続。今回のTESTでPASS扱いにはしない。
