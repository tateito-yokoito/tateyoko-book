# 運営向け自動監視（初期版）

## 稼働中の構成

- Supabase `pg_cron` が15分ごとに `scan_ops_monitor()` を実行し、配信失敗・配信滞留・クライアントが報告した音声保存、文字起こし、回答保存の失敗件数を記録する。
- 8分ずらした別の `pg_cron` ジョブが `pg_net` で `ops-monitor-notify` Edge Functionを呼ぶ。認証用のランダム値はDB内で生成し、Supabase Vaultに保存する。Mac、Codex、GitHub Actionsの稼働に依存しない。
- Edge FunctionはDB監視の鮮度と公開サイトのHTTP応答を確認し、新しい異常だけをResendから `sugawara@saltlight.co.jp` へ送る。
- AIによる自由文の原因推定や自動修正は行わない。通知に書く確認手順は異常の種類ごとに固定する。

監視結果やメールには、顧客名、宛先、語り本文、音声、認証トークンを含めない。個別調査は権限のある運営者が管理画面から行う。

## 反映と確認

1. `202610150001_ops_monitor.sql` と `202610150002_ops_monitor_notify_schedule.sql` を順番に適用する。初期状態では通知が無効なので、配置だけでメールは出ない。
2. `ops-monitor-notify` を `verify_jwt = false` で配置する。関数内でVault由来のBearerトークンを検証する。既存の `RESEND_API_KEY` と検証済み送信元ドメインが必要。
3. `ops_monitor_settings` の `project_ref` を正しいプロジェクトIDにし、`enabled = true` にする。テスト環境には `RESEND_API_KEY` がないため、通知は無効のままにする。
4. `select public.scan_ops_monitor()` でDB集計を確認し、`select public.invoke_ops_monitor_notify()` の戻り値を `net._http_response` で確認する。正常時はHTTP 200、`sentCount: 0`。
5. 認証済みの `{"test":true}` を関数にPOSTすると「接続テスト（異常ではありません）」と明記したメールを1通送れる。通常のcronは `{}` を送り、テストメールは発生しない。

本番では2026-10-15に通常呼び出しがHTTP 200、テストメール呼び出しがHTTP 200になった。`sugawara@saltlight.co.jp` で接続テストメールの到着も確認済み。以後の `ops-monitor-scan` と `ops-monitor-notify` の定期ジョブも成功している。

同日の公開アプリ `/?app=1` は `/assets/main-sJeeAdCK.js` を読み込む。公開用に隔離した同名成果物には `voice_upload_failed`、`voice_transcription_failed`、`answer_save_failed` の3件の記録経路が含まれ、`activity_logs` の認証済み利用者向け INSERT 権限と本人限定 RLS も確認した。したがって「ブラウザーの報告コードがまだ本番にない」という以前の見立ては訂正する。ただし、実際の保存失敗を発生させるエンドツーエンド試験は未実施で、0件は成功の証明ではない。

## 現時点の検知範囲と限界

- 配信失敗・滞留はサーバーDB上の配信ログから検知する。
- 音声・回答保存の失敗はブラウザーから `activity_logs` に報告されたものを数える。報告コードは現行の本番アプリに含まれるが、完全な通信断では報告自体が届かないため、0件は成功の証明ではない。
- 公開サイトのHTTP疎通を確認するが、ログイン後の全画面遷移やiPhone Safariのマイク権限までは再現しない。
- 通知の実行基盤もSupabaseにあるため、Supabase全体が停止するとメール通知も止まる。独立した外形監視は次段階。
- AIによる原因調査を追加する場合も、まず件数と分類だけを渡し、個人の語りをモデルへ渡さない。顧客への連絡、データ変更、本番修正は人の承認を要する。

## 運用と停止

- 運営者は `admin_ops_monitor_status()` で直近の実行と過去7日の発見事項を確認できる。一般アカウントには権限を付けない。
- アラートは種類ごとにUTCの1時間単位で重複を抑える。送信失敗なら次回呼び出しで再試行する。送信後の記録更新に失敗したときは重複メールがあり得る。
- 停止するときは `ops_monitor_settings.enabled = false` にする。集計と履歴削除のcronは継続する。
- 実行履歴は30日、件数だけの発見事項は90日で削除する。
