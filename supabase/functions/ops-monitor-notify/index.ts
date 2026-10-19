import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
const alertFrom = Deno.env.get("OPS_ALERT_FROM")?.trim()
  || "縦糸横糸 監視 <hello@tateito-yokoito.jp>";
const appUrl = Deno.env.get("APP_URL")?.trim()
  || "https://www.tateito-yokoito.jp";

type Finding = {
  fingerprint: string;
  kind: "delivery_failed" | "delivery_stuck" | "voice_save_failed"
    | "voice_transcription_failed" | "answer_save_failed"
    | "site_unavailable";
  severity: "warning" | "critical";
  affected_count: number;
  first_detected_at: string;
};

type Incident = {
  id: string;
  kind: "voice_upload_failed" | "voice_transcription_failed" | "answer_save_failed";
  importance: "review" | "urgent";
  attempt_count: number;
  first_seen_at: string;
  last_seen_at: string;
  failure_point: string | null;
  error_code: string | null;
  http_status: number | null;
};

const incidentLabels: Record<Incident["kind"], string> = {
  voice_upload_failed: "音声の保存",
  voice_transcription_failed: "文字起こし",
  answer_save_failed: "回答の保存",
};
const importanceLabels = { review: "要確認", urgent: "至急確認" };
const japaneseTime = (value: string) => new Date(value).toLocaleString("ja-JP", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

const labels: Record<Finding["kind"], string> = {
  delivery_failed: "問いの配信に失敗しました",
  delivery_stuck: "問いの配信処理が20分以上進んでいません",
  voice_save_failed: "音声のサーバー保存失敗が報告されました",
  voice_transcription_failed: "文字起こしの失敗が報告されました",
  answer_save_failed: "回答の保存失敗が報告されました",
  site_unavailable: "公開サイトにアクセスできません",
};

const firstChecks: Record<Finding["kind"], string> = {
  delivery_failed: "配信履歴のエラー分類と、メール/SMS事業者の送信結果を確認してください。",
  delivery_stuck: "配信ワーカーの直近の実行結果と、sending のままの配信履歴を確認してください。",
  voice_save_failed: "音声Storageの応答、認証状態、端末側の通信切断を順に確認してください。",
  voice_transcription_failed: "文字起こし関数の実行結果と、音声保存が完了しているかを確認してください。",
  answer_save_failed: "回答保存APIのエラー、権限条件、直前の画面遷移を確認してください。",
  site_unavailable: "公開サイトのデプロイ状態、ホスティング、DNSを確認してください。",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function sendFinding(finding: Finding, alertEmail: string) {
  const label = labels[finding.kind] || "監視で異常を検知しました";
  const body = [
    `縦糸横糸の自動監視: ${label}`,
    `直近の該当件数: ${finding.affected_count}`,
    `初回検知 (UTC): ${finding.first_detected_at}`,
    `最初の確認: ${firstChecks[finding.kind]}`,
    "",
    "この通知には顧客名・メールアドレス・語りの内容・音声を含めていません。",
    "管理画面の配信履歴または利用履歴で、対象と原因を確認してください。",
    "自動修正や顧客への連絡は行っていません。",
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: alertFrom,
      to: alertEmail,
      subject: `【縦糸横糸・運営監視】${label}`,
      text: body,
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}`);
  }
}

async function sendIncident(incident: Incident, alertEmail: string) {
  const importance = importanceLabels[incident.importance];
  const label = incidentLabels[incident.kind] || "保存処理";
  const body = [
    `検証の重要度: ${importance}`,
    `事象: ${label}の失敗が同じ操作で${incident.attempt_count}回報告されました。`,
    `初回 (JST): ${japaneseTime(incident.first_seen_at)}`,
    `最終 (JST): ${japaneseTime(incident.last_seen_at)}`,
    `工程: ${incident.failure_point || "不明"}`,
    `安全なエラーコード: ${incident.error_code || "記録なし"}${incident.http_status ? ` / HTTP ${incident.http_status}` : ""}`,
    `履歴ID: ${incident.id}`,
    "",
    `対象のアカウントと物語は管理画面の「エラー履歴」で確認: ${appUrl.replace(/\/$/, "")}/?admin=1`,
    "このメールには顧客名・メールアドレス・語りの本文・音声・保存パスを含めていません。",
    "自動修正や顧客への連絡は行っていません。",
  ].join("\n");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: alertFrom, to: alertEmail,
      subject: `【縦糸横糸・${importance}】${label}の失敗（${incident.attempt_count}回）`,
      text: body,
    }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}

async function sendTestEmail(alertEmail: string) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: alertFrom,
      to: alertEmail,
      subject: "【縦糸横糸・運営監視】接続テスト（異常ではありません）",
      text: "自動監視の通知経路を確認するためのテストメールです。異常は検知されていません。",
    }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}

async function isSiteReachable() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(appUrl, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(5_000),
      });
      await response.body?.cancel();
      if (response.ok) return true;
    } catch {
      // One transient network error is not enough to notify the operator.
    }
  }
  return false;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabaseUrl || !serviceRoleKey || !resendKey) {
    console.error("ops monitor configuration incomplete");
    return json({ error: "Monitor configuration incomplete" }, 503);
  }

  const supplied = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!supplied) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: caller, error: callerError } = await supabase
    .rpc("verify_ops_monitor_call", { input_token: supplied });
  if (callerError) {
    console.error("ops monitor authorization unavailable", callerError.code);
    return json({ error: "Monitor authorization unavailable" }, 503);
  }
  if (!caller?.authorized) {
    return json({ error: "Unauthorized" }, 401);
  }
  const alertEmail = String(caller.alert_email || "").trim();
  if (!alertEmail) {
    console.error("ops monitor alert email missing");
    return json({ error: "Monitor configuration incomplete" }, 503);
  }

  let payload: { test?: boolean } = {};
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (payload.test === true) {
    try {
      await sendTestEmail(alertEmail);
      return json({ ok: true, test: true });
    } catch (error) {
      console.error("ops monitor test email failed", error instanceof Error ? error.message : "unknown");
      return json({ error: "Test email failed" }, 502);
    }
  }

  const { data: latestRun, error: runError } = await supabase
    .from("ops_monitor_runs")
    .select("checked_at")
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError || !latestRun
    || Date.now() - Date.parse(latestRun.checked_at) > 35 * 60_000) {
    console.error("ops monitor database schedule is stale", runError?.code || "no_recent_run");
    return json({ error: "Monitor database schedule is stale" }, 503);
  }

  if (!await isSiteReachable()) {
    const hour = new Date().toISOString().slice(0, 13).replaceAll("-", "").replace("T", "");
    const { error: siteError } = await supabase.from("ops_monitor_findings").insert({
      fingerprint: `site_unavailable:${hour}`,
      kind: "site_unavailable",
      severity: "critical",
      affected_count: 1,
    });
    if (siteError && siteError.code !== "23505") {
      console.error("ops monitor site result save failed", siteError.code);
      return json({ error: "Site result save failed" }, 503);
    }
  }

  const { data: findings, error: findingsError } = await supabase
    .from("ops_monitor_findings")
    .select("fingerprint,kind,severity,affected_count,first_detected_at")
    .in("kind", (await supabase.from("ops_monitor_settings").select("incident_alerts_enabled").eq("singleton", true).single()).data?.incident_alerts_enabled ? ["delivery_failed", "delivery_stuck", "site_unavailable"] : ["delivery_failed", "delivery_stuck", "site_unavailable", "voice_save_failed", "voice_transcription_failed", "answer_save_failed"])
    .is("email_sent_at", null)
    .gte("first_detected_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString())
    .order("first_detected_at", { ascending: true })
    .limit(20);

  if (findingsError) {
    console.error("ops monitor finding lookup failed", findingsError.code);
    return json({ error: "Finding lookup failed" }, 503);
  }

  let sentCount = 0;
  for (const finding of (findings || []) as Finding[]) {
    try {
      await sendFinding(finding, alertEmail);
      const { error: markError } = await supabase
        .from("ops_monitor_findings")
        .update({ email_sent_at: new Date().toISOString() })
        .eq("fingerprint", finding.fingerprint)
        .is("email_sent_at", null);
      if (markError) throw new Error(`Alert mark failed: ${markError.code}`);
      sentCount += 1;
    } catch (error) {
      console.error("ops monitor alert delivery failed", {
        kind: finding.kind,
        message: error instanceof Error ? error.message : "unknown",
      });
      return json({ error: "Alert delivery failed", sentCount }, 502);
    }
  }

  const { data: settings, error: settingsError } = await supabase
    .from("ops_monitor_settings")
    .select("incident_alerts_enabled")
    .eq("singleton", true)
    .single();
  if (settingsError) {
    console.error("ops monitor incident setting lookup failed", settingsError.code);
    return json({ error: "Incident setting lookup failed", sentCount }, 503);
  }

  let incidentSentCount = 0;
  if (settings?.incident_alerts_enabled) {
    const { data: pendingIncidents, error: claimError } = await supabase
      .rpc("claim_ops_error_notifications", { input_limit: 10 });
    if (claimError) {
      console.error("ops monitor incident claim failed", claimError.code);
      return json({ error: "Incident claim failed", sentCount }, 503);
    }
    for (const incident of (pendingIncidents || []) as Incident[]) {
      try {
        await sendIncident(incident, alertEmail);
        const { error: finishError } = await supabase.rpc("finish_ops_error_notification", {
          input_id: incident.id, input_importance: incident.importance, input_sent: true,
        });
        if (finishError) throw new Error(`Incident mark failed: ${finishError.code}`);
        incidentSentCount += 1;
      } catch (error) {
        console.error("ops monitor incident delivery failed", {
          id: incident.id, message: error instanceof Error ? error.message : "unknown",
        });
        await supabase.rpc("finish_ops_error_notification", {
          input_id: incident.id, input_importance: incident.importance, input_sent: false,
        });
        return json({ error: "Incident delivery failed", sentCount, incidentSentCount }, 502);
      }
    }
  }

  return json({ ok: true, pendingCount: findings?.length || 0, sentCount, incidentSentCount });
});
