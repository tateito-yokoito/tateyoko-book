# 先行案内の本番反映・TEST購入入口（2026-11-16）

- 本番HPの購入CTAは `/early-access/` に接続。メール、関心対象、利用意向、案内同意を受け、登録後の理由は任意。既存の一般向けCheckoutゲートは閉鎖を維持する。
- TEST HPの購入CTAは既存の `/?app=1&entry=purchase` へ接続。動画付きの商品選択、認証、最終確認、Stripe TEST決済開始は既存コンポーネントを使用し、購入フローを複製しない。
- 先行案内のDB migration `20261115000300_launch_interest.sql` と `submit-launch-interest` Edgeを本番へ適用。Edgeは既存Resend設定を使い、新規登録時に確認メールを送る。メール送信に失敗しても登録行は維持し、画面では送信済みと表示しない。
- 本番Vercel deployment: `dpl_2QRE7YSQRXSYJqQUybXm26gqF4n7`。TEST Vercel deployment: `dpl_B4dkecwXzJ5iyyyarCzZavQBUfDa`。TEST専用の参照ID・価格ID・秘密値を本番ビルドへ含めていない。
- 本番HPから先行案内へ遷移し、指定アドレスを1件登録。画面で登録完了と確認メール送信を確認し、本番DBで同意済み1行を確認。指定Gmailの受信箱にも同件名のメールが届いた。
- TEST HPのCTAから既存の動画付き商品選択を開き、サーバー見積もりでスタンダード35,000円、プレミアム65,000円を確認。今回の追加決済は行っていない。
- `scripts/deploy/build-production.mjs` と `build-public-test.mjs` は、同じpostCTA部品を各環境向けにビルドする。古いビルド済みCTAをもう一方の環境へコピーしない。

本番の一般向け購入再開は本反映の対象外。既存購入済みユーザーの制作・閲覧導線は維持する。
