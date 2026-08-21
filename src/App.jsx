import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, BookOpen, ChevronLeft, ChevronRight, Files, Home, Image as ImageIcon, Lock, Mic, Pause, Pencil, Play, Plus, RotateCw, ScanLine, Settings, Square, UserCircle, UserCog, Users } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://wquxjeqkumossjxehdop.supabase.co";

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const FREE_TRIAL_QUESTION_COUNT = 3;

const STORY_RELATIONSHIP_LABELS = {
  child: "子",
  parent: "親",
  spouse: "配偶者",
  sibling: "きょうだい",
  grandchild: "孫",
  other: "その他"
};

function getSequenceFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const seq = parseInt(params.get("sequence"), 10);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
}

function getDeliveryTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || null;
}

function getEntryModeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("entry") || null;
}

function getCheckoutReturnFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    status: params.get("checkout") || null,
    sessionId: params.get("session_id") || null
  };
}

function hasFullProjectAccess(project) {
  return ["paid", "gifted", "legacy"].includes(project?.access_status);
}

function hasRestrictedProjectAccess(project) {
  if (hasFullProjectAccess(project)) return false;

  if (["trial", "checkout_pending", "refunded"].includes(project?.access_status)) {
    return true;
  }

  // Before the purchase migration is applied, only explicit commercial
  // entry routes are restricted. This keeps existing beta users available.
  return ["trial", "purchase"].includes(getEntryModeFromUrl());
}

function getFreeTrialQuestions(questionSet) {
  return (questionSet || [])
    .filter(question => isFormalOnboardingQuestion(question))
    .slice(0, FREE_TRIAL_QUESTION_COUNT);
}

function hasCompletedFreeTrial(questionSet) {
  const trialQuestions = getFreeTrialQuestions(questionSet);
  return (
    trialQuestions.length === FREE_TRIAL_QUESTION_COUNT &&
    trialQuestions.every(question => question?.status === "answered")
  );
}

function getFreeTrialResumeQuestionIndex(questionSet) {
  const trialQuestions = getFreeTrialQuestions(questionSet);
  const nextUnansweredQuestion = trialQuestions.find(
    question => question?.status !== "answered"
  );

  if (!nextUnansweredQuestion) {
    return 0;
  }

  const nextIndex = (questionSet || []).findIndex(
    question =>
      question?.user_question_id === nextUnansweredQuestion.user_question_id
  );

  return nextIndex >= 0 ? nextIndex : 0;
}

function getAuthenticatedQuestionIndex(questionSet, project, profile) {
  if (
    getEntryModeFromUrl() === "trial" &&
    hasRestrictedProjectAccess(project) &&
    !hasCompletedFreeTrial(questionSet)
  ) {
    return getFreeTrialResumeQuestionIndex(questionSet);
  }

  return getProjectQuestionIndex(questionSet, project, profile);
}

function isLastFreeTrialQuestion(questionSet, currentQuestion) {
  const trialQuestions = getFreeTrialQuestions(questionSet);
  return (
    trialQuestions.length === FREE_TRIAL_QUESTION_COUNT &&
    trialQuestions[trialQuestions.length - 1]?.user_question_id ===
      currentQuestion?.user_question_id
  );
}

function getCommercialEntryScene({ project, questionSet, defaultScene }) {
  if (
    getEntryModeFromUrl() === "trial" &&
    hasFullProjectAccess(project)
  ) {
    return "home";
  }

  if (!hasRestrictedProjectAccess(project)) return defaultScene;

  const entryMode = getEntryModeFromUrl();
  const checkoutReturn = getCheckoutReturnFromUrl();

  if (entryMode === "purchase" || checkoutReturn.status) {
    return "purchase_start";
  }

  if (hasCompletedFreeTrial(questionSet)) {
    return "trial_complete";
  }

  // The free taste should open quickly, without the full 10–15 minute
  // onboarding explanation that belongs to the purchased experience.
  return 0;
}

function replaceCommercialEntryUrl(entry) {
  const url = new URL(window.location.href);
  url.searchParams.set("app", "1");
  url.searchParams.set("entry", entry);
  url.searchParams.delete("checkout");
  url.searchParams.delete("session_id");
  window.history.replaceState({}, "", url.toString());
}

function getSupporterInviteReferenceFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("supporter_invite") || null;
}

function getSupporterInvitationUrlFromCurrentLocation() {
  const params = new URLSearchParams(window.location.search);
  const inviteReference = params.get("supporter_invite");

  if (!inviteReference || inviteReference === "1") return null;

  const url = new URL(window.location.origin + window.location.pathname);
  const betaMode = params.get("beta");

  if (betaMode) {
    url.searchParams.set("beta", betaMode);
  }

  url.searchParams.set("supporter_invite", inviteReference);
  return url.toString();
}

function getAuthReturnUrlFromCurrentLocation() {
  const params = new URLSearchParams(window.location.search);
  const url = new URL(window.location.origin + window.location.pathname);
  const betaMode = params.get("beta");

  if (betaMode) {
    url.searchParams.set("beta", betaMode);
  }

  const sharingInvite = params.get("sharing_invite");
  if (sharingInvite) url.searchParams.set("sharing_invite", sharingInvite);

  const appMode = params.get("app");
  if (appMode) url.searchParams.set("app", appMode);

  const entryMode = params.get("entry");
  if (entryMode) url.searchParams.set("entry", entryMode);

  const checkoutStatus = params.get("checkout");
  if (checkoutStatus) url.searchParams.set("checkout", checkoutStatus);

  const checkoutSessionId = params.get("session_id");
  if (checkoutSessionId) url.searchParams.set("session_id", checkoutSessionId);

  return url.toString();
}

async function resolveDeliveryToken(token) {
  const { data, error } = await supabaseClient.rpc("resolve_delivery_token", {
    input_token: token
  });

  if (error) {
    console.error("resolve delivery token error", error);
    throw error;
  }

  return Array.isArray(data) ? data[0] : data;
}

async function transcribeAudioOnServer({
  answerId,
  audioPaths,
  fallbackTranscript,
  bookProjectId,
  questionText,
  previousTranscript
}) {
  const { data, error } = await supabaseClient.functions.invoke("transcribe-audio", {
    body: {
      answerId,
      audioPaths,
      fallbackTranscript,
      bookProjectId,
      questionText,
      previousTranscript
    }
  });

  if (error) {
    console.error("transcribe-audio invoke error", error);
    throw error;
  }

  if (!data || data.success === false) {
    console.error("transcribe-audio returned error", data);
    throw new Error(data?.error || "文字起こしに失敗しました");
  }

  return data;
}

async function polishTranscriptOnServer({
  answerId,
  transcriptRaw,
  questionText,
  bookProjectId,
  mode = "answer"
}) {
  const { data, error } = await supabaseClient.functions.invoke("polish-transcript", {
    body: {
      answerId,
      transcriptRaw,
      questionText,
      bookProjectId,
      mode
    }
  });

  if (error) {
    console.error("polish-transcript invoke error", error);
    throw error;
  }

  if (!data || data.success === false) {
    console.error("polish-transcript returned error", data);
    throw new Error(data?.error || "文章整形に失敗しました");
  }

  return data;
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };

    reader.onerror = () => reject(reader.error || new Error("音声の変換に失敗しました"));
    reader.readAsDataURL(blob);
  });
}

async function buildTokenAudioItems(voiceData) {
  const segments =
    voiceData.audioSegments && voiceData.audioSegments.length > 0
      ? voiceData.audioSegments
      : (
          voiceData.audioBlob
            ? [{
                blob: voiceData.audioBlob,
                duration: voiceData.duration || 0,
                transcript: voiceData.transcript || ""
              }]
            : []
        );

  const items = [];

  for (const segment of segments) {
    const blob = segment?.blob;

    if (!blob || !blob.size) continue;

    items.push({
      base64: await blobToBase64(blob),
      contentType: blob.type || "audio/mp4",
      durationSeconds: segment.duration || 0,
      transcript: segment.transcript || ""
    });
  }

  return items;
}


async function saveTokenAnswerOnServer({ token, voiceData, tag }) {
  const audioItems = await buildTokenAudioItems(voiceData);

  const { data, error } = await supabaseClient.functions.invoke("save-token-answer", {
    body: {
      token,
      transcriptRaw: voiceData.transcript,
      transcriptClean: voiceData.transcriptClean || voiceData.editedText || voiceData.transcript,
      transcriptReadable: voiceData.transcriptReadable || voiceData.editedText || voiceData.transcript,
      transcriptEssay: voiceData.transcriptEssay || null,
      transcriptEdited: voiceData.editedText || voiceData.transcriptReadable || voiceData.transcript,
      selectedStyle: voiceData.selectedStyle || "readable",
      aiMirror: voiceData.aiMirror || "",
      snippet: voiceData.extractedSnippet || "",
      meaningTag: tag,
      durationSeconds: voiceData.duration || 0,
      audioItems
    }
  });

  if (error) {
    console.error("save-token-answer invoke error", error);
    throw error;
  }

  if (!data || data.success === false) {
    console.error("save-token-answer returned error", data);
    throw new Error(data?.error || "回答の保存に失敗しました");
  }

  return data;
}

async function startTokenAuthOnServer(token) {
  const { data, error } = await supabaseClient.functions.invoke("start-token-auth", {
    body: {
      token
    }
  });

  if (error) {
    console.error("start-token-auth invoke error", error);
    throw error;
  }

  if (!data || data.success === false) {
    console.error("start-token-auth returned error", data);

    const message = data?.error || "認証コードの送信に失敗しました";
    const code = data?.code ? `\n(${data.code})` : "";

    throw new Error(`${message}${code}`);
  }

  return data;
}

async function verifyTokenAuthOnServer({ token, pin }) {
  const { data, error } = await supabaseClient.functions.invoke("verify-token-auth", {
    body: {
      token,
      pin
    }
  });

  if (error) {
    console.error("verify-token-auth invoke error", error);
    throw error;
  }

  if (!data || data.success === false || !data.session) {
    console.error("verify-token-auth returned error", data);
    throw new Error(data?.error || "認証に失敗しました");
  }

  return data;
}

function isDevMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("dev") === "1";
}

function isBetaMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("beta") === "1";
}

function isTokenMode() {
  const params = new URLSearchParams(window.location.search);
  return !!params.get("token");
}

function withHonorific(name) {
  const text = String(name || "あなた").trim();

  if (!text || text === "あなた") {
    return "あなた";
  }

  return text.endsWith("さん") ? text : `${text}さん`;
}


function formatTranscriptForReading(input) {
  let text = String(input || "").replace(/\s+/g, " ").trim();
  if (!text) return "";

  const commaWords = [
    "それは", "それで", "そして", "でも", "ただ", "たしか", "確か",
    "たぶん", "多分", "だから", "その時", "そのとき", "そこでは",
    "近所の", "あとは", "ちなみに"
  ];

commaWords.forEach(word => {
  text = text.split(word).join(`${word}、`);
});

  text = text
    .replace(/、+/g, "、")
    .replace(/、\s*/g, "、")
    .replace(/\s+/g, " ")
    .trim();

  if (!/[。！？]$/.test(text)) text += "。";
  return text;
}

const DEV_LOGIN_EMAIL = import.meta.env.VITE_DEV_LOGIN_EMAIL || "";
const DEV_LOGIN_PASSWORD = import.meta.env.VITE_DEV_LOGIN_PASSWORD || "";

async function ensureProfileExists(sessionUser, registrationData = {}) {
  const userId = sessionUser.id;
  const email = sessionUser.email || registrationData.email || "";

  const userMetadata = sessionUser.user_metadata || {};

  const familyName =
    registrationData.familyName || userMetadata.family_name || null;
  const givenName =
    registrationData.givenName || userMetadata.given_name || null;

  const fullName =
    registrationData.fullName ||
    userMetadata.display_name ||
    userMetadata.full_name ||
    [familyName, givenName].filter(Boolean).join(" ") ||
    "あなた";

  const preferredName =
    registrationData.preferredName ||
    userMetadata.preferred_name ||
    (givenName ? `${givenName}さん` : fullName);

  const { data: existingProfile, error: existingError } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (existingError) {
    console.error("profile select error", existingError);
    throw existingError;
  }

if (existingProfile) {
  const updatePayload = {};

  if (registrationData.hasSpouse !== undefined) {
    updatePayload.has_spouse = registrationData.hasSpouse;
  }

  if (registrationData.hasChildren !== undefined) {
    updatePayload.has_children = registrationData.hasChildren;
  }

  if (registrationData.hasGrandchildren !== undefined) {
    updatePayload.has_grandchildren = registrationData.hasGrandchildren;
  }

  if (registrationData.canTalkAboutParents !== undefined) {
    updatePayload.can_talk_about_parents = registrationData.canTalkAboutParents;
  }

  if (registrationData.canTalkAboutPets !== undefined) {
    updatePayload.can_talk_about_pets = registrationData.canTalkAboutPets;
  }

  if (Object.keys(updatePayload).length === 0) {
    return {
      ...existingProfile,
      __isNewProfile: false
    };
  }

  const { data: updatedProfile, error: updateError } = await supabaseClient
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId)
    .select()
    .single();

  if (updateError) {
    console.error("profile update error", updateError);
    throw updateError;
  }

  return {
    ...updatedProfile,
    __isNewProfile: false
  };
}

  const { data: newProfile, error: profileError } = await supabaseClient
    .from("profiles")
    .insert({
      id: userId,
      email,
      name: fullName,
      family_name: familyName,
      given_name: givenName,
      display_name: fullName,
      preferred_name: preferredName,

      has_spouse:
        registrationData.hasSpouse === undefined
          ? true
          : registrationData.hasSpouse,

      has_children:
        registrationData.hasChildren === undefined
          ? true
          : registrationData.hasChildren,

      has_grandchildren:
        registrationData.hasGrandchildren === undefined
          ? true
          : registrationData.hasGrandchildren,

      can_talk_about_parents:
        registrationData.canTalkAboutParents === undefined
          ? true
          : registrationData.canTalkAboutParents,

      can_talk_about_pets:
        registrationData.canTalkAboutPets === undefined
          ? true
          : registrationData.canTalkAboutPets
    })
    .select()
    .single();

  if (profileError) {
    console.error("profile insert error", profileError);
    throw profileError;
  }

return {
  ...newProfile,
  __isNewProfile: true
};


}

async function getDefaultQuestionSet() {
  const { data, error } = await supabaseClient
    .from("question_sets")
    .select("id, code, name, version")
    .eq("product_type", "koebook")
    .eq("is_default", true)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("default question set load error", error);
    throw error;
  }

  if (!data) {
    throw new Error("デフォルト質問セットが見つかりません");
  }

  return data;
}

function isFormalOnboardingQuestion(question) {
  return (
    question?.flow_type === "onboarding" ||
    question?.flow_phase === "onboarding" ||
    question?.onboarding_group === "voice_intro" ||
    question?.onboarding_group === "life_outline"
  );
}

function isFirstStoryQuestion(question) {
  return (
    question?.question_role === "first_story" ||
    question?.question_role === "first_weekly_question" ||
    question?.onboarding_group === "first_story" ||
    question?.flow_phase === "first_story" ||
    question?.completes_onboarding === true
  );
}

function getFirstMainStoryIndex(questionSet) {
  const explicitIndex = (questionSet || []).findIndex(question =>
    question?.question_role === "first_weekly_question" ||
    question?.question_role === "first_story"
  );

  if (explicitIndex >= 0) return explicitIndex;

  return (questionSet || []).findIndex(
    question => question?.include_in_story_list !== false
  );
}

function getNotificationSchedules(preference) {
  if (!preference || preference.is_active === false) return [];

  const source = Array.isArray(preference.schedules) && preference.schedules.length > 0
    ? preference.schedules
    : [preference];

  return source
    .map((schedule, index) => ({
      ...schedule,
      weekday: Number(schedule.weekday),
      hour: Number(schedule.hour),
      minute: Number(schedule.minute || 0),
      sort_order: Number(schedule.sort_order || index + 1)
    }))
    .filter(schedule => (
      schedule.is_active !== false && schedule.enabled !== false &&
      Number.isInteger(schedule.weekday) && schedule.weekday >= 0 && schedule.weekday <= 6 &&
      Number.isInteger(schedule.hour) && schedule.hour >= 0 && schedule.hour <= 23 &&
      Number.isInteger(schedule.minute) && schedule.minute >= 0 && schedule.minute <= 59
    ))
    .sort((a, b) => a.sort_order - b.sort_order);
}

function getNextNotificationOccurrence(preference, now = new Date()) {
  const schedules = getNotificationSchedules(preference);
  if (schedules.length === 0) return null;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)])
  );

  const currentDate = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day
  ));
  const currentWeekday = currentDate.getUTCDay();
  const currentMinutes = parts.hour * 60 + parts.minute;

  const occurrences = schedules.map(schedule => {
    const targetMinutes = schedule.hour * 60 + schedule.minute;
    let daysUntil = (schedule.weekday - currentWeekday + 7) % 7;
    if (daysUntil === 0 && targetMinutes <= currentMinutes) daysUntil = 7;
    const targetDate = new Date(Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day + daysUntil
    ));
    return { ...schedule, daysUntil, targetMinutes, targetDate };
  });

  occurrences.sort((a, b) => (
    a.daysUntil - b.daysUntil || a.targetMinutes - b.targetMinutes
  ));
  return occurrences[0];
}

function formatNextNotificationLabel(preference, now = new Date()) {
  const occurrence = getNextNotificationOccurrence(preference, now);
  if (!occurrence) return "";

  const { targetDate, hour, minute } = occurrence;
  const weekdayLabels = ["日", "月", "火", "水", "木", "金", "土"];
  const targetHour = String(hour).padStart(2, "0");
  const targetMinute = String(minute).padStart(2, "0");

  return (
    `次の問い　${targetDate.getUTCMonth() + 1}/${targetDate.getUTCDate()}` +
    `（${weekdayLabels[targetDate.getUTCDay()]}）${targetHour}:${targetMinute}ごろ（メール）`
  );
}

async function loadNotificationPreference(userId) {
  if (!userId) return null;

  const [preferenceResult, schedulesResult] = await Promise.all([
    supabaseClient
      .from("notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseClient
      .from("notification_schedules")
      .select("id, weekday, hour, minute, delivery_channel, enabled, sort_order")
      .eq("user_id", userId)
      .eq("enabled", true)
      .order("sort_order", { ascending: true })
  ]);

  if (preferenceResult.error) throw preferenceResult.error;
  if (schedulesResult.error) throw schedulesResult.error;

  const preference = preferenceResult.data || null;
  const schedules = schedulesResult.data || [];

  if (!preference && schedules.length === 0) return null;

  const normalizedSchedules = schedules.map(schedule => ({
    ...schedule,
    is_active: schedule.enabled !== false,
    timezone: preference?.timezone || "Asia/Tokyo"
  }));
  const first = normalizedSchedules[0] || preference || {};
  return {
    ...(preference || {}),
    weekday: first.weekday,
    hour: first.hour,
    minute: first.minute || 0,
    is_active: preference?.is_active !== false,
    schedules: normalizedSchedules
  };
}

function getMainStoryProgress(questionSet, currentIndex) {
  const mainStoryQuestions = (questionSet || []).filter(
    question => question?.include_in_story_list !== false
  );
  const currentQuestion = questionSet?.[currentIndex] || null;
  const mainStoryIndex = mainStoryQuestions.findIndex(question =>
    question === currentQuestion ||
    (
      question?.user_question_id &&
      question.user_question_id === currentQuestion?.user_question_id
    ) ||
    Number(question?.sequence_order) === Number(currentQuestion?.sequence_order)
  );

  return {
    currentIndex: Math.max(mainStoryIndex, 0),
    total: mainStoryQuestions.length
  };
}

function isProjectOnboardingComplete(project) {
  return project?.onboarding_status === "completed";
}

async function ensureUserFoundation(userId, profile) {
  const displayName =
    profile?.display_name ||
    profile?.name ||
    [profile?.family_name, profile?.given_name].filter(Boolean).join(" ") ||
    "あなた";

  const familyName = profile?.family_name || null;
  const givenName = profile?.given_name || null;
  const preferredName =
    profile?.preferred_name ||
    (givenName ? `${givenName}さん` : displayName);

  let { data: family, error: familySelectError } = await supabaseClient
    .from("families")
    .select("*")
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (familySelectError) {
    console.error("family select error", familySelectError);
    throw familySelectError;
  }

  if (!family) {
    const { data: newFamily, error: familyInsertError } = await supabaseClient
      .from("families")
      .insert({
        owner_user_id: userId,
        name: `${displayName}さんの家族`
      })
      .select()
      .single();

    if (familyInsertError) {
      console.error("family insert error", familyInsertError);
      throw familyInsertError;
    }

    family = newFamily;
  }

  let { data: link, error: linkSelectError } = await supabaseClient
    .from("user_person_links")
    .select(`
      *,
      persons (*)
    `)
    .eq("user_id", userId)
    .eq("role", "self")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (linkSelectError) {
    console.error("user_person_links select error", linkSelectError);
    throw linkSelectError;
  }

  let person = link?.persons || null;

  if (!person) {
    const { data: newPerson, error: personInsertError } = await supabaseClient
      .from("persons")
      .insert({
        family_id: family.id,
        display_name: displayName,
        family_name: familyName,
        given_name: givenName,
        preferred_name: preferredName
      })
      .select()
      .single();

    if (personInsertError) {
      console.error("person insert error", personInsertError);
      throw personInsertError;
    }

    person = newPerson;

    const { error: linkInsertError } = await supabaseClient
      .from("user_person_links")
      .insert({
        user_id: userId,
        person_id: person.id,
        role: "self"
      });

    if (linkInsertError) {
      console.error("user_person_links insert error", linkInsertError);
      throw linkInsertError;
    }
  }

  let { data: project, error: projectSelectError } = await supabaseClient
    .from("book_projects")
    .select("*")
    .eq("owner_user_id", userId)
    .eq("subject_person_id", person.id)
    .eq("project_type", "koebook")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (projectSelectError) {
    console.error("book_projects select error", projectSelectError);
    throw projectSelectError;
  }

  if (!project) {
    const defaultQuestionSet = await getDefaultQuestionSet();

    const { data: newProject, error: projectInsertError } =
      await supabaseClient
        .from("book_projects")
        .insert({
          family_id: family.id,
          owner_user_id: userId,
          subject_person_id: person.id,
          project_type: "koebook",
          title: `${displayName}さんの縦糸横糸`,
          status: "active",

          base_question_set_id: defaultQuestionSet.id,
          onboarding_status: "not_started",
          current_onboarding_user_question_id: null,
          onboarding_started_at: null,
          onboarding_completed_at: null
        })
        .select()
        .single();

    if (projectInsertError) {
      console.error("book_projects insert error", projectInsertError);
      throw projectInsertError;
    }

    project = newProject;
  } else if (!project.base_question_set_id) {
    /*
     * 既存プロジェクトの場合は、すでに配布済みの質問セットを優先する。
     * 旧ユーザーへ新しいv2を強制適用しないための処理。
     */
    const { data: existingUserQuestion } = await supabaseClient
      .from("user_questions")
      .select("meta_json")
      .eq("book_project_id", project.id)
      .order("sequence_order", { ascending: true })
      .limit(1)
      .maybeSingle();

    const existingQuestionSetId =
      existingUserQuestion?.meta_json?.question_set_id || null;

    const existingQuestionSetCode =
      existingUserQuestion?.meta_json?.question_set_code || null;

    let baseQuestionSetId = existingQuestionSetId;
    let onboardingUpdate = {};

    if (!baseQuestionSetId) {
      const defaultQuestionSet = await getDefaultQuestionSet();
      baseQuestionSetId = defaultQuestionSet.id;
    }

    /*
     * 旧v1利用者は、新オンボーディングの対象外。
     * migrationでnot_startedが入っているため、completedに補正する。
     */
    if (existingQuestionSetCode === "koebook_standard_v1") {
      onboardingUpdate = {
        onboarding_status: "completed",
        current_onboarding_user_question_id: null,
        onboarding_completed_at:
          project.onboarding_completed_at || new Date().toISOString()
      };
    }

    const { data: updatedProject, error: projectUpdateError } =
      await supabaseClient
        .from("book_projects")
        .update({
          base_question_set_id: baseQuestionSetId,
          ...onboardingUpdate
        })
        .eq("id", project.id)
        .select()
        .single();

    if (projectUpdateError) {
      console.error("book project question set backfill error", projectUpdateError);
      throw projectUpdateError;
    }

    project = updatedProject;
  }



  const participantRoles = ["owner", "subject", "speaker"];

  for (const role of participantRoles) {
    const { data: existingParticipant, error: participantSelectError } =
      await supabaseClient
        .from("project_participants")
        .select("*")
        .eq("book_project_id", project.id)
        .eq("person_id", person.id)
        .eq("role", role)
        .limit(1)
        .maybeSingle();

    if (participantSelectError) {
      console.error("project_participants select error", participantSelectError);
      throw participantSelectError;
    }

    if (!existingParticipant) {
      const { error: participantInsertError } = await supabaseClient
        .from("project_participants")
        .insert({
          book_project_id: project.id,
          user_id: userId,
          person_id: person.id,
          role,
          invite_status: "active"
        });

      if (participantInsertError) {
        console.error("project_participants insert error", participantInsertError);
        throw participantInsertError;
      }
    }
  }

  const { data: speakerParticipant, error: speakerParticipantError } =
    await supabaseClient
      .from("project_participants")
      .select("*")
      .eq("book_project_id", project.id)
      .eq("person_id", person.id)
      .eq("role", "speaker")
      .limit(1)
      .maybeSingle();

  if (speakerParticipantError) {
    console.error("speaker participant select error", speakerParticipantError);
    throw speakerParticipantError;
  }

  return {
    family,
    person,
    project,
    speakerParticipant
  };
}

async function ensureUserQuestions(userId, foundationData = null) {
  const projectId = foundationData?.project?.id || null;
  const participantId = foundationData?.speakerParticipant?.id || null;

  let existingQuery = supabaseClient
    .from("user_questions")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (projectId) {
    existingQuery = existingQuery.eq("book_project_id", projectId);
  }

  const { data: existing, error: existingError } = await existingQuery;

  if (existingError) {
    console.warn("user_questions check error", existingError);
  }

  if (existing && existing.length > 0) {
    if (projectId && participantId) {
      const { error: backfillError } = await supabaseClient
        .from("user_questions")
        .update({
          book_project_id: projectId,
          participant_id: participantId
        })
        .eq("user_id", userId)
        .is("book_project_id", null);

      if (backfillError) {
        console.warn("user_questions project backfill error", backfillError);
      }
    }

    return;
  }

 let questionSet = null;

const fixedQuestionSetId =
  foundationData?.project?.base_question_set_id || null;

if (fixedQuestionSetId) {
  const { data, error } = await supabaseClient
    .from("question_sets")
    .select("id, code, name, version")
    .eq("id", fixedQuestionSetId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("fixed question set load error", error);
    return;
  }

  questionSet = data;
} else {
  try {
    questionSet = await getDefaultQuestionSet();
  } catch (error) {
    console.error("default question set load error", error);
    return;
  }
}

if (!questionSet) {
  console.error("question set not found");
  return;
}

  const { data: setItems, error: itemError } = await supabaseClient
    .from("question_set_items")
    .select(`
      id,
      question_set_id,
      question_id,
      sequence_order,
      chapter_id,
      chapter_title_snapshot,
      chapter_subtitle_snapshot,
      question_text_snapshot,
      prompt_style,
      prompt_hint_snapshot,
      reassurance_text_snapshot,
      followup_hint_snapshot,
      min_duration_seconds,
      min_transcript_chars,
      is_required,
      is_active,
      meta_json,
      questions (
        id,
        content,
        chapter,
        chapter_id,
        chapters (
          id,
          label,
          description,
          display_order
        )
      )
    `)
    .eq("question_set_id", questionSet.id)
    .eq("is_active", true)
    .order("sequence_order", { ascending: true });

  if (itemError) {
    console.error("question set items load error", itemError);
    return;
  }

  if (!setItems || setItems.length === 0) {
    console.error("question set items not found");
    return;
  }

  const inserts = setItems.map((item, index) => {
    const questionText =
      item.question_text_snapshot ||
      item.questions?.content ||
      "";

    const chapterTitle =
      item.chapter_title_snapshot ||
      item.questions?.chapters?.label ||
      item.questions?.chapter ||
      null;

    const chapterSubtitle =
      item.chapter_subtitle_snapshot ||
      item.questions?.chapters?.description ||
      item.questions?.chapter ||
      null;

    return {
      user_id: userId,
      book_project_id: projectId,
      participant_id: participantId,
      question_id: item.question_id,
      sequence_order: index + 1,
      chapter: chapterTitle,
      chapter_title_snapshot: chapterTitle,
      chapter_subtitle_snapshot: chapterSubtitle,
      question_text_snapshot: questionText,
      status: "pending",
      is_active: true,
      meta_json: {
        ...(item.meta_json || {}),

        question_set_id: questionSet.id,
        question_set_code: questionSet.code,
        question_set_name: questionSet.name,
        question_set_version: questionSet.version || null,
        question_set_item_id: item.id,

        original_sequence_order: item.sequence_order,

        prompt_style: item.prompt_style || null,
        prompt_hint: item.prompt_hint_snapshot || null,
        reassurance_text: item.reassurance_text_snapshot || null,
        followup_hint: item.followup_hint_snapshot || null,

        min_duration_seconds: item.min_duration_seconds || 25,
        min_transcript_chars: item.min_transcript_chars || 80
      }
    };
  });

  const { error: insertError } = await supabaseClient
    .from("user_questions")
    .upsert(inserts, {
      onConflict: projectId
        ? "book_project_id,question_id"
        : "user_id,question_id"
    });

    if (insertError) {
    console.error("user_questions insert error", insertError);
    return;
  }

  if (
    projectId &&
    questionSet.code === "tateito_yokoito_standard_v2"
  ) {
    const { data: firstOnboardingQuestion, error: firstQuestionError } =
      await supabaseClient
        .from("user_questions")
        .select("id")
        .eq("book_project_id", projectId)
        .eq("is_active", true)
        .order("sequence_order", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (firstQuestionError) {
      console.warn("first onboarding question load error", firstQuestionError);
      return;
    }

    const { error: onboardingUpdateError } = await supabaseClient
      .from("book_projects")
      .update({
        onboarding_status: "in_progress",
        current_onboarding_user_question_id:
          firstOnboardingQuestion?.id || null,
        onboarding_started_at: new Date().toISOString()
      })
      .eq("id", projectId)
      .eq("onboarding_status", "not_started");

    if (onboardingUpdateError) {
      console.warn("project onboarding start error", onboardingUpdateError);
    }
  }
}

function normalizeUserQuestions(rows) {
  return (rows || []).map(row => {
    const chapterTitle =
      row.chapter_title_snapshot ||
      row.questions?.chapters?.label ||
      row.chapter ||
      row.questions?.chapter ||
      "";

    const chapterDescription =
      row.chapter_subtitle_snapshot ||
      row.questions?.chapters?.description ||
      row.chapter ||
      row.questions?.chapter ||
      "";

    const content =
      row.custom_question_text ||
      row.question_text_snapshot ||
      row.questions?.content ||
      "";

    const meta = row.meta_json || {};

    return {
      user_question_id: row.id,
      book_project_id: row.book_project_id || null,
      participant_id: row.participant_id || null,
      id: row.questions?.id || row.question_id,
      question_id: row.question_id,
      sequence_order: row.sequence_order,
      is_active: row.is_active !== false,
      status: row.status || "pending",
      answered_at: row.answered_at || null,
      content,
      chapter: chapterDescription || chapterTitle,
      chapter_label: chapterTitle,
      chapter_description: chapterDescription,
      prompt_style: meta.prompt_style || null,
      prompt_hint: meta.prompt_hint || "",
      reassurance_text: meta.reassurance_text || "",
      followup_hint: meta.followup_hint || "",
      min_duration_seconds: meta.min_duration_seconds || 25,
      min_transcript_chars: meta.min_transcript_chars || 80,

      flow_type: meta.flow_type || null,
      flow_phase: meta.flow_phase || null,
      onboarding_group: meta.onboarding_group || null,
      onboarding_order: meta.onboarding_order ?? null,
      question_role: meta.question_role || null,

      include_in_profile_text:
        meta.include_in_profile_text === true,

      include_in_profile_audio:
        meta.include_in_profile_audio === true,

      include_in_story_list:
        meta.include_in_story_list !== false,

      include_in_book_body:
        meta.include_in_book_body !== false,

      completes_onboarding:
        meta.completes_onboarding === true,

      progress_label:
        meta.progress_label || null,

      question_set_id:
        meta.question_set_id || null,

      question_set_code:
        meta.question_set_code || null,

      question_set_version:
        meta.question_set_version || null
    };
  });
}

async function loadUserQuestionSet(userId, foundationData = null) {
  await ensureUserQuestions(userId, foundationData);

  const projectId = foundationData?.project?.id || null;

  let query = supabaseClient
    .from("user_questions")
    .select(`
      id,
      book_project_id,
      participant_id,
      sequence_order,
      chapter,
      chapter_title_snapshot,
      chapter_subtitle_snapshot,
      question_text_snapshot,
      custom_question_text,
      question_id,
      is_active,
      status,
      answered_at,
      meta_json,
      questions (
        id,
        content,
        chapter,
        chapter_id,
        chapters (
          id,
          label,
          description,
          display_order
        )
      )
    `)
    .eq("is_active", true)
    .order("sequence_order", { ascending: true });

  if (projectId) {
    query = query.eq("book_project_id", projectId);
  } else {
    query = query.eq("user_id", userId);
  }

  const { data: userQuestions, error: uqError } = await query;

  if (uqError) throw uqError;

  return normalizeUserQuestions(userQuestions || []);
}

function getProjectQuestionIndex(questionSet, project, profile) {
  if (!questionSet || questionSet.length === 0) return 0;

  const onboardingQuestionId =
    project?.current_onboarding_user_question_id || null;

  if (
    project?.onboarding_status !== "completed" &&
    onboardingQuestionId
  ) {
    const onboardingIndex = questionSet.findIndex(
      question => question.user_question_id === onboardingQuestionId
    );

    if (onboardingIndex >= 0) {
      return onboardingIndex;
    }
  }

  return getInitialQuestionIndex(questionSet, profile);
}


function getInitialSceneForProject({
  project,
  notificationPref
}) {
  if (
    project?.onboarding_status === "life_outline_completed" ||
    project?.onboarding_status === "first_story"
  ) {
    return "life_outline_complete";
  }

  if (project?.onboarding_status === "introduction_review") {
    return "life_outline_summary";
  }

  const onboardingIncomplete =
    project &&
    project.onboarding_status !== "completed";

  /*
   * 通知設定とは切り離し、初回説明をまだ見ていない場合だけ
   * 全体説明から始める。
   */
  if (
    onboardingIncomplete &&
    !project?.onboarding_overview_completed_at
  ) {
    return "onboarding_overview";
  }

  /*
   * 初回説明を終えた後は、通知設定を挟まず人生の輪郭へ進む。
   */
  if (onboardingIncomplete) {
    return 0;
  }

  /*
   * 旧利用者など、初回体験は完了しているが
   * 通知設定がない場合。
   */
  if (!notificationPref) {
    return "notification_setup";
  }

  return "home";
}

async function ensureLifeOutlineReviewPhase({
  foundationData,
  questionSet,
  currentIndex
}) {
  const project = foundationData?.project;
  const currentQuestion = questionSet?.[currentIndex] || null;

  /*
   * まとめ画面の導入前に「人生の輪郭」を終えた利用者は、
   * projectがin_progressのまま最初の毎週の問いを指している。
   * その場合だけ一度まとめ画面へ戻し、既存回答から生成する。
   */
  if (
    project?.onboarding_status !== "in_progress" ||
    !isFirstStoryQuestion(currentQuestion)
  ) {
    return foundationData;
  }

  const { data: updatedProject, error } = await supabaseClient
    .from("book_projects")
    .update({
      onboarding_status: "introduction_review"
    })
    .eq("id", project.id)
    .select()
    .single();

  if (error) {
    console.warn("life outline review phase migration error", error);
    return foundationData;
  }

  return {
    ...foundationData,
    project: updatedProject
  };
}

function getInitialQuestionIndex(questionSet, profile) {
  const urlSeq = getSequenceFromUrl();

  if (urlSeq) {
    const urlIndex = questionSet.findIndex(q => q.sequence_order === urlSeq);
    if (urlIndex >= 0) return urlIndex;
  }

  const storedSeq = profile?.current_sequence || questionSet[0]?.sequence_order || 1;
  let currentIndex = questionSet.findIndex(q => q.sequence_order >= storedSeq);

  if (currentIndex < 0) {
    currentIndex = Math.max(questionSet.length - 1, 0);
  }

  return currentIndex;
}

function getResumeQuestionIndexFromToken(questionSet, tokenData) {
  const tokenSeq = Number(tokenData?.sequence_order || 0);

  if (!tokenSeq || !questionSet || questionSet.length === 0) {
    return 0;
  }

  const nextUnansweredIndex = questionSet.findIndex(q =>
    Number(q.sequence_order) >= tokenSeq &&
    q.status !== "answered"
  );

  if (nextUnansweredIndex >= 0) {
    return nextUnansweredIndex;
  }

  const anyUnansweredIndex = questionSet.findIndex(q =>
    q.status !== "answered"
  );

  if (anyUnansweredIndex >= 0) {
    return anyUnansweredIndex;
  }

  return Math.max(questionSet.length - 1, 0);
}

async function markUserQuestionAnswered(userQuestionId) {
  if (!userQuestionId) return;

  const { error } = await supabaseClient
    .from("user_questions")
    .update({
      answered_at: new Date().toISOString(),
      status: "answered"
    })
    .eq("id", userQuestionId);

  if (error) {
    console.warn("answered_at update error", error);
  }
}

const BETA_SURVEYS = {
  5: {
    key: "survey_1",
    title: "1問目を終えて",
    url: "https://forms.gle/w8dVw44gnLL6bacH7"
  },
  11: {
    key: "survey_7",
    title: "7問目を終えて",
    url: "https://forms.gle/FMGDjuJvofKoDTQm7"
  },
  19: {
    key: "survey_15",
    title: "15問目を終えて",
    url: "https://forms.gle/p8aC9TNddKXPFqpx5"
  }
};

function getBetaSurveyForSequence(sequenceOrder) {
  return BETA_SURVEYS[Number(sequenceOrder)] || null;
}

function getBetaSurveySeenKey(userId, surveyKey) {
  return `tateyoko_beta_${userId}_${surveyKey}_seen`;
}

function getBetaIntroSeenKey(userId) {
  return `tateyoko_beta_${userId}_intro_seen`;
}


const MIN_RECORDING_SECONDS = 15;
const MAX_RECORDING_SECONDS_PER_QUESTION = 10 * 60;
const MAX_AUDIO_PARTS_PER_QUESTION = 5;
const MAX_LIFE_OUTLINE_ADDITIONS = 5;

function isRecordingTooShort(duration) {
  const seconds = Number(duration || 0);
  return seconds > 0 && seconds < MIN_RECORDING_SECONDS;
}

async function markUserQuestionSkipped(userQuestionId) {
  if (!userQuestionId) return;

  const { error } = await supabaseClient
    .from("user_questions")
    .update({
      status: "skipped"
    })
    .eq("id", userQuestionId);

  if (error) {
    console.warn("question skip update error", error);
  }
}

async function loadStorySharingPreference(bookProjectId) {
  if (!bookProjectId) return null;

  const { data, error } = await supabaseClient
    .from("story_sharing_preferences")
    .select("*")
    .eq("book_project_id", bookProjectId)
    .maybeSingle();

  if (error) {
    console.warn("story sharing preference load error", error);
    return null;
  }

  return data || null;
}

function getStorySharingFlags(preference, fallbackScope = "private") {
  const liveScope = preference?.live_scope || fallbackScope;

  return {
    familyEnabled:
      typeof preference?.family_sharing_enabled === "boolean"
        ? preference.family_sharing_enabled
        : liveScope === "family",
    selectedEnabled:
      typeof preference?.selected_sharing_enabled === "boolean"
        ? preference.selected_sharing_enabled
        : liveScope === "selected"
  };
}

function getStorySharingLiveScope({ familyEnabled, selectedEnabled }) {
  if (selectedEnabled) return "selected";
  if (familyEnabled) return "family";
  return "private";
}

async function upsertStorySharingPreference({
  bookProjectId,
  ownerPersonId,
  liveScope,
  familyEnabled,
  selectedEnabled,
  markInitialSetupComplete = false
}) {
  if (!bookProjectId) {
    throw new Error("物語の情報が見つかりません");
  }

  const resolvedFlags =
    typeof familyEnabled === "boolean" || typeof selectedEnabled === "boolean"
      ? {
          familyEnabled: Boolean(familyEnabled),
          selectedEnabled: Boolean(selectedEnabled)
        }
      : getStorySharingFlags({ live_scope: liveScope || "private" });

  const payload = {
    book_project_id: bookProjectId,
    owner_person_id: ownerPersonId || null,
    live_scope: getStorySharingLiveScope(resolvedFlags),
    family_sharing_enabled: resolvedFlags.familyEnabled,
    selected_sharing_enabled: resolvedFlags.selectedEnabled,
    updated_at: new Date().toISOString()
  };

  if (markInitialSetupComplete) {
    payload.initial_setup_completed_at = new Date().toISOString();
  }

  const { data, error } = await supabaseClient
    .from("story_sharing_preferences")
    .upsert(payload, { onConflict: "book_project_id" })
    .select()
    .single();

  if (error) {
    console.error("story sharing preference save error", error);
    throw error;
  }

  return data;
}

async function loadSupportedStoryProjects() {
  const { data, error } = await supabaseClient.rpc(
    "list_supported_story_projects"
  );

  if (error) {
    console.warn("supported story projects load error", error);
    return [];
  }

  return data || [];
}

async function loadPendingSupporterInvites() {
  const { data, error } = await supabaseClient.rpc(
    "list_pending_supporter_invites"
  );

  if (error) {
    console.warn("pending supporter invites load error", error);
    return [];
  }

  return data || [];
}

async function respondToSupporterInvite(inviteId, accept) {
  if (!inviteId) {
    throw new Error("招待の情報が見つかりません");
  }

  let lastError = null;

  // 承諾処理はDB側で冪等にしている。応答タイムアウト時にも一度だけ
  // 再照合することで、保存済みなのに失敗表示になる状態を避ける。
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabaseClient.rpc(
      "respond_to_supporter_invite_resilient",
      {
        input_invite_id: inviteId,
        input_accept: accept
      }
    );

    if (!error) {
      return Array.isArray(data) ? data[0] : data;
    }

    lastError = error;
    console.warn("supporter invite response retry", { attempt, error });
    if (attempt === 0) {
      await new Promise(resolve => window.setTimeout(resolve, 650));
    }
  }

  console.error("supporter invite response error", lastError);
  throw lastError;
}

async function loadReceivedStoryProjects() {
  const { data, error } = await supabaseClient.rpc("list_received_story_projects");
  if (error) {
    console.warn("received story projects load error", error);
    return [];
  }
  return data || [];
}

async function loadReceivedStoryData(project) {
  if (!project?.book_project_id) {
    throw new Error("共有された物語が見つかりません");
  }

  const { data, error } = await supabaseClient.rpc("get_received_story_stories", {
    input_book_project_id: project.book_project_id
  });
  if (error) throw error;

  const rows = data || [];
  return {
    questionSet: rows.map(row => ({
      sequence_order: row.sequence_order,
      chapter: row.chapter_title || "物語",
      chapter_label: row.chapter_title || "物語",
      content: row.question_text || "残された語り"
    })),
    storyRows: rows.map(row => ({
      id: row.answer_id,
      sequence_order: row.sequence_order,
      transcript_edited: row.book_text,
      transcript_readable: row.book_text,
      created_at: row.created_at
    })),
    mediaByAnswerId: {}
  };
}

async function loadOwnedStoryRelationships(bookProjectId) {
  if (!bookProjectId) return [];
  const { data, error } = await supabaseClient.rpc("list_owned_story_relationships", {
    input_book_project_id: bookProjectId
  });
  if (error) throw error;
  return data || [];
}

async function loadPendingStoryRelationshipInvites() {
  const { data, error } = await supabaseClient.rpc("list_pending_story_relationship_invites");
  if (error) {
    console.warn("pending story relationship invites load error", error);
    return [];
  }
  return data || [];
}

async function respondToStoryRelationshipInvite(inviteId, accept) {
  const { error } = await supabaseClient.rpc("respond_to_story_relationship_invite", {
    input_invite_id: inviteId,
    input_accept: accept
  });
  if (error) throw error;
}

function derivePhotoStoryTitle(text) {
  const normalized = String(text || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/^(えー|えっと|あの|まあ)[、,\s]*/g, "")
    .trim();
  if (normalized.length < 12) return "この一枚のこと";
  const first = normalized.split(/[。！？!?]/)[0].trim();
  if (first.length < 15) return "この一枚のこと";
  return first.length > 24 ? `${first.slice(0, 23)}…` : first;
}

async function loadSupporterBookData(supportedProject) {
  const bookProjectId = supportedProject?.book_project_id;

  if (!bookProjectId) {
    throw new Error("お手伝いする物語が見つかりません");
  }

  const canReadStories =
    supportedProject?.can_edit_book_text || supportedProject?.can_build_book;
  const canReadPhotos =
    supportedProject?.can_manage_photos || canReadStories;

  const [questionsResult, storiesResult, photosResult] = await Promise.all([
    supabaseClient.rpc("get_supporter_questions", {
      input_book_project_id: bookProjectId
    }),
    canReadStories
      ? supabaseClient.rpc("get_supporter_book_stories", {
          input_book_project_id: bookProjectId
        })
      : Promise.resolve({ data: [], error: null }),
    canReadPhotos
      ? supabaseClient.rpc("get_supporter_book_photos", {
          input_book_project_id: bookProjectId
        })
      : Promise.resolve({ data: [], error: null })
  ]);

  if (questionsResult.error) throw questionsResult.error;
  if (storiesResult.error) throw storiesResult.error;
  if (photosResult.error) throw photosResult.error;

  const storyRows = (storiesResult.data || []).map(row => ({
    id: row.answer_id,
    book_project_id: bookProjectId,
    sequence_order: row.sequence_order,
    transcript_raw: "",
    transcript_clean: row.book_text || "",
    transcript_readable: row.book_text || "",
    transcript_essay: "",
    transcript_edited: row.book_text || "",
    selected_style: "readable",
    ai_mirror: "",
    snippet: "",
    created_at: row.created_at
  }));

  const questionSet = (questionsResult.data || []).map(row => ({
    user_question_id: row.user_question_id,
    owner_user_id: row.owner_user_id,
    subject_person_id: row.subject_person_id,
    family_id: row.family_id,
    sequence_order: row.sequence_order,
    question_id: row.question_id,
    content: row.question_text || "",
    chapter: row.chapter_title || "その他",
    chapter_label: row.chapter_title || "その他",
    chapter_description: row.chapter_title || "その他",
    status: row.status || "pending",
    prompt_style: row.prompt_style || null,
    prompt_hint: row.prompt_hint || "",
    reassurance_text: row.reassurance_text || "",
    followup_hint: row.followup_hint || "",
    min_duration_seconds: row.min_duration_seconds || 25,
    min_transcript_chars: row.min_transcript_chars || 80,
    flow_type: row.flow_type || null,
    onboarding_group: row.onboarding_group || null,
    answer_id: row.answer_id || null,
    include_in_story_list: row.flow_type === "story"
  }));

  const groupedMedia = {};

  for (const photo of photosResult.data || []) {
    const { data: signed } = await supabaseClient.storage
      .from("photos")
      .createSignedUrl(photo.storage_path, 60 * 60);

    if (!groupedMedia[photo.answer_id]) {
      groupedMedia[photo.answer_id] = [];
    }

    groupedMedia[photo.answer_id].push({
      id: photo.media_id,
      answer_id: photo.answer_id,
      asset_type: "photo",
      storage_path: photo.storage_path,
      meta_json: photo.meta_json || {},
      created_at: photo.created_at,
      url: signed?.signedUrl || null
    });
  }

  return {
    storyRows,
    questionSet,
    mediaByAnswerId: groupedMedia
  };
}

function getNextDeliveryText(notificationPref) {
  const occurrence = getNextNotificationOccurrence(notificationPref);
  if (!occurrence) {
    return "次の問いが届いたら、また続きを開いてください。";
  }

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const month = occurrence.targetDate.getUTCMonth() + 1;
  const date = occurrence.targetDate.getUTCDate();
  const weekday = weekdays[occurrence.targetDate.getUTCDay()];
  const hour = String(occurrence.hour).padStart(2, "0");
  const minute = String(occurrence.minute).padStart(2, "0");

  return `次の問いは、${month}月${date}日（${weekday}）${hour}:${minute}ごろに届きます。`;
}

function formatRecordedAt(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");

  return `${y}/${m}/${d} ${h}:${min}`;
}

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const MIC_CHECK_VALID_MS = 60 * 60 * 1000;

function hasRecentMicCheck() {
  const raw = localStorage.getItem("tateyoko_last_mic_check_at");
  const checkedAt = Number(raw || 0);

  if (!checkedAt) return false;

  return Date.now() - checkedAt < MIC_CHECK_VALID_MS;
}

function markMicCheckDone() {
  localStorage.setItem("tateyoko_last_mic_check_at", Date.now().toString());
}


async function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("画像の読み込みに失敗しました"));
    };

    img.src = url;
  });
}

function canvasToBlob(canvas, type = "image/jpeg", quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("画像の変換に失敗しました"));
          return;
        }

        resolve(blob);
      },
      type,
      quality
    );
  });
}

function getPointDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function solveLinearSystem(matrix, values) {
  const n = values.length;
  const rows = matrix.map((row, index) => [...row, values[index]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;

    for (let row = col + 1; row < n; row++) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivotRow][col])) {
        pivotRow = row;
      }
    }

    [rows[col], rows[pivotRow]] = [rows[pivotRow], rows[col]];

    const pivot = rows[col][col] || 1e-12;

    for (let item = col; item <= n; item++) {
      rows[col][item] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;

      const factor = rows[row][col];

      for (let item = col; item <= n; item++) {
        rows[row][item] -= factor * rows[col][item];
      }
    }
  }

  return rows.map(row => row[n]);
}

function getHomography(sourcePoints, targetPoints) {
  const matrix = [];
  const values = [];

  for (let i = 0; i < 4; i++) {
    const x = sourcePoints[i].x;
    const y = sourcePoints[i].y;
    const u = targetPoints[i].x;
    const v = targetPoints[i].y;

    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    values.push(u);

    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    values.push(v);
  }

  return solveLinearSystem(matrix, values);
}

function applyHomography(point, h) {
  const denominator = h[6] * point.x + h[7] * point.y + 1;

  return {
    x: (h[0] * point.x + h[1] * point.y + h[2]) / denominator,
    y: (h[3] * point.x + h[4] * point.y + h[5]) / denominator
  };
}

async function processScannedPhotoFile(file, options = {}) {
  const {
    brightness = 8,
    contrast = 1.1,
    maxWidth = 2200,
    cropMode = "original",
    cropRect = null,
    perspectivePoints = null,
    rotationDegrees = 0
  } = options;

  const originalImg = await loadImageFromFile(file);
  const normalizedRotation = ((Number(rotationDegrees) % 360) + 360) % 360;

  const rotationCanvas = document.createElement("canvas");
  const rotationCtx = rotationCanvas.getContext("2d");

  if (!rotationCtx) throw new Error("画像処理を開始できませんでした");

  if (normalizedRotation === 90 || normalizedRotation === 270) {
    rotationCanvas.width = originalImg.height;
    rotationCanvas.height = originalImg.width;
  } else {
    rotationCanvas.width = originalImg.width;
    rotationCanvas.height = originalImg.height;
  }

  rotationCtx.save();

  if (normalizedRotation === 90) {
    rotationCtx.translate(rotationCanvas.width, 0);
    rotationCtx.rotate(Math.PI / 2);
  } else if (normalizedRotation === 180) {
    rotationCtx.translate(rotationCanvas.width, rotationCanvas.height);
    rotationCtx.rotate(Math.PI);
  } else if (normalizedRotation === 270) {
    rotationCtx.translate(0, rotationCanvas.height);
    rotationCtx.rotate((Math.PI * 3) / 2);
  }

  rotationCtx.drawImage(originalImg, 0, 0);
  rotationCtx.restore();

  const img = await new Promise((resolve, reject) => {
    const url = rotationCanvas.toDataURL("image/jpeg", 0.95);
    const rotatedImg = new Image();

    rotatedImg.onload = () => resolve(rotatedImg);
    rotatedImg.onerror = () => reject(new Error("画像の回転に失敗しました"));
    rotatedImg.src = url;
  });

  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = img.width;
  let sourceHeight = img.height;

  const cropRatios = {
    square: 1,
    portrait: 4 / 5,
    landscape: 5 / 4
  };

  const targetRatio = cropRatios[cropMode];

if (perspectivePoints) {
  const sourcePoints = [
    perspectivePoints.topLeft,
    perspectivePoints.topRight,
    perspectivePoints.bottomRight,
    perspectivePoints.bottomLeft
  ].map(point => ({
    x: img.width * point.x,
    y: img.height * point.y
  }));

  const topWidth = getPointDistance(sourcePoints[0], sourcePoints[1]);
  const bottomWidth = getPointDistance(sourcePoints[3], sourcePoints[2]);
  const leftHeight = getPointDistance(sourcePoints[0], sourcePoints[3]);
  const rightHeight = getPointDistance(sourcePoints[1], sourcePoints[2]);

  sourceWidth = Math.max(40, Math.round((topWidth + bottomWidth) / 2));
  sourceHeight = Math.max(40, Math.round((leftHeight + rightHeight) / 2));

  sourceX = 0;
  sourceY = 0;
} else if (cropRect) {
    const left = Math.max(0, Math.min(0.95, Number(cropRect.left) || 0));
    const top = Math.max(0, Math.min(0.95, Number(cropRect.top) || 0));
    const right = Math.max(left + 0.05, Math.min(1, Number(cropRect.right) || 1));
    const bottom = Math.max(top + 0.05, Math.min(1, Number(cropRect.bottom) || 1));

    sourceX = Math.round(img.width * left);
    sourceY = Math.round(img.height * top);
    sourceWidth = Math.round(img.width * (right - left));
    sourceHeight = Math.round(img.height * (bottom - top));
  } else if (targetRatio) {
    const currentRatio = img.width / img.height;

    if (currentRatio > targetRatio) {
      sourceWidth = Math.round(img.height * targetRatio);
      sourceX = Math.round((img.width - sourceWidth) / 2);
    } else {
      sourceHeight = Math.round(img.width / targetRatio);
      sourceY = Math.round((img.height - sourceHeight) / 2);
    }
  }

  const scale = Math.min(1, maxWidth / sourceWidth);
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像処理を開始できませんでした");


if (perspectivePoints) {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = img.width;
  sourceCanvas.height = img.height;

  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) throw new Error("画像処理を開始できませんでした");

  sourceCtx.drawImage(img, 0, 0);

  const sourceImageData = sourceCtx.getImageData(0, 0, img.width, img.height);
  const sourceData = sourceImageData.data;

  const outputImageData = ctx.createImageData(width, height);
  const outputData = outputImageData.data;

  const sourceQuad = [
    { x: img.width * perspectivePoints.topLeft.x, y: img.height * perspectivePoints.topLeft.y },
    { x: img.width * perspectivePoints.topRight.x, y: img.height * perspectivePoints.topRight.y },
    { x: img.width * perspectivePoints.bottomRight.x, y: img.height * perspectivePoints.bottomRight.y },
    { x: img.width * perspectivePoints.bottomLeft.x, y: img.height * perspectivePoints.bottomLeft.y }
  ];

  const targetQuad = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 }
  ];

  const homography = getHomography(targetQuad, sourceQuad);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sourcePoint = applyHomography({ x, y }, homography);

      const sx = Math.max(0, Math.min(img.width - 1, sourcePoint.x));
      const sy = Math.max(0, Math.min(img.height - 1, sourcePoint.y));

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(img.width - 1, x0 + 1);
      const y1 = Math.min(img.height - 1, y0 + 1);

      const wx = sx - x0;
      const wy = sy - y0;

      const outputIndex = (y * width + x) * 4;

      for (let channel = 0; channel < 4; channel++) {
        const topLeft = sourceData[(y0 * img.width + x0) * 4 + channel];
        const topRight = sourceData[(y0 * img.width + x1) * 4 + channel];
        const bottomLeft = sourceData[(y1 * img.width + x0) * 4 + channel];
        const bottomRight = sourceData[(y1 * img.width + x1) * 4 + channel];

        const top = topLeft * (1 - wx) + topRight * wx;
        const bottom = bottomLeft * (1 - wx) + bottomRight * wx;

        outputData[outputIndex + channel] = top * (1 - wy) + bottom * wy;
      }
    }
  }

  ctx.putImageData(outputImageData, 0, 0);
} else {
  ctx.drawImage(
    img,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    height
  );
}


  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, (data[i] - 128) * contrast + 128 + brightness));
    data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] - 128) * contrast + 128 + brightness));
    data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] - 128) * contrast + 128 + brightness));
  }

  ctx.putImageData(imageData, 0, 0);

  const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);

  return new File(
    [blob],
    file.name ? file.name.replace(/\.[^.]+$/, ".jpg") : "scanned-photo.jpg",
    { type: "image/jpeg" }
  );
}

function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [scene, setScene] = useState(-1);
  const [user, setUser] = useState(null);
  const [questionsDB, setQuestionsDB] = useState([]);
  const [notificationPref, setNotificationPref] = useState(null);
  const [progress, setProgress] = useState({ currentIndex: 0, total: 0 });
  const [foundation, setFoundation] = useState(null);
  const [sharingPreference, setSharingPreference] = useState(null);
  const [supportedProjects, setSupportedProjects] = useState([]);
  const [receivedProjects, setReceivedProjects] = useState([]);
  const [supportContext, setSupportContext] = useState(null);
  const [receivedContext, setReceivedContext] = useState(null);
  const [acceptedConnection, setAcceptedConnection] = useState(null);
  const [pendingSupporterInvites, setPendingSupporterInvites] = useState([]);
  const [pendingStoryRelationshipInvites, setPendingStoryRelationshipInvites] = useState([]);
  const [postSupporterInviteScene, setPostSupporterInviteScene] = useState("home");
  const [hasAcceptedSupporterInvite, setHasAcceptedSupporterInvite] = useState(false);
  const [endTodayHasSavedAnswer, setEndTodayHasSavedAnswer] = useState(false);
  const [lifeOutlineIntroduction, setLifeOutlineIntroduction] = useState(null);
  const [lifeOutlineStatus, setLifeOutlineStatus] = useState("idle");
  const [lifeOutlineError, setLifeOutlineError] = useState("");
  const [lifeOutlineReturnScene, setLifeOutlineReturnScene] = useState(null);
  const [notificationSetupReturnScene, setNotificationSetupReturnScene] = useState(null);
  const [pendingBetaSurvey, setPendingBetaSurvey] = useState(null);
  const [accessMode, setAccessMode] = useState("session");
  const [deliveryToken, setDeliveryToken] = useState(null);
  const [deliveryTokenData, setDeliveryTokenData] = useState(null);
  const [purchaseStatus, setPurchaseStatus] = useState("idle");
  const [purchaseError, setPurchaseError] = useState("");
  const checkoutSyncAttemptedRef = useRef(false);

  const [voiceData, setVoiceData] = useState({
    duration: 0,
    transcript: "",
    audioUrl: null,
    hasAudio: false,
    audioBlob: null,
    audioSegments: [],
    photoItems: [],
    storyOrigin: "question",
    photoStoryTitle: "",
    photoStoryTitleSource: null,
    photoStoryCaption: "",
    editedText: "",
    aiMirror: "",
    extractedSnippet: "",
    transcriptionStatus: "idle",
    transcriptionError: "",
    polishStatus: "idle",
    polishError: "",
    transcriptClean: "",
    transcriptReadable: "",
    transcriptEssay: "",
    selectedStyle: "readable",
    answerId: null,
    storagePath: null,
    storagePaths: [],
    appendMode: false,
    addMoreCount: 0,
    editRecordingMode: null,
    targetAnswerId: null,
    targetSequenceOrder: null,
    editBaseText: "",
    existingAudioPaths: [],
    returnQuestionIndex: null,
    editReturnScene: null
  });

  useEffect(() => {
    const initApp = async () => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();

  const initialDeliveryToken = getDeliveryTokenFromUrl();

if (!session) {
  if (initialDeliveryToken) {
    try {
      const tokenData = await resolveDeliveryToken(initialDeliveryToken);

      if (tokenData?.user_id) {
        setAccessMode("session");
        setDeliveryToken(initialDeliveryToken);
        setDeliveryTokenData(tokenData);
        setScene("token_auth");
        return;
      }

      setScene("token_invalid");
      return;
    } catch (tokenError) {
      console.error("token init error", tokenError);
      setScene("token_invalid");
      return;
    }
  }

  setScene(-1);
  return;
}

        const profile = await ensureProfileExists(session.user);

        const notificationData = await loadNotificationPreference(session.user.id);

        setNotificationPref(notificationData || null);

        const currentUser = {
          id: session.user.id,
          ...profile,
          email: session.user.email || profile?.email || "",
          name: profile?.display_name || profile?.name || "あなた"
        };

const foundationData = await ensureUserFoundation(
  session.user.id,
  currentUser
);

const questionSet = await loadUserQuestionSet(
  session.user.id,
  foundationData
);

/*
 * loadUserQuestionSet内でuser_questions作成と
 * onboarding状態更新が行われる可能性があるため、
 * 最新のbook_projectsを取得し直す。
 */
const refreshedFoundationData = await ensureUserFoundation(
  session.user.id,
  currentUser
);

const deliveryToken = getDeliveryTokenFromUrl();

let currentIndex = getAuthenticatedQuestionIndex(
  questionSet,
  refreshedFoundationData?.project,
  profile
);

let activeFoundationData = await ensureLifeOutlineReviewPhase({
  foundationData: refreshedFoundationData,
  questionSet,
  currentIndex
});

setFoundation(activeFoundationData);

const sharingPreferenceData = await loadStorySharingPreference(
  activeFoundationData?.project?.id
);

setSharingPreference(sharingPreferenceData);

let nextScene = getInitialSceneForProject({
  project: activeFoundationData?.project,
  notificationPref: notificationData || null
});

nextScene = getCommercialEntryScene({
  project: activeFoundationData?.project,
  questionSet,
  defaultScene: nextScene
});

const currentQuestion = questionSet[currentIndex] || null;

if (deliveryToken) {
  try {
    const tokenData = await resolveDeliveryToken(deliveryToken);

    if (tokenData?.sequence_order) {
      setAccessMode("session");
      setDeliveryToken(deliveryToken);
      setDeliveryTokenData(tokenData);

      currentIndex = getResumeQuestionIndexFromToken(questionSet, tokenData);
      nextScene = hasRecentMicCheck() ? 1 : "daily_mic_check";
    }
  } catch (tokenError) {
    console.error("delivery token handling error", tokenError);
    nextScene = "token_invalid";
  }
}


setUser(currentUser);
setQuestionsDB(questionSet);
const [supportedStoryProjects, receivedStoryProjects, pendingInvites, pendingRelationshipInvites] = await Promise.all([
  loadSupportedStoryProjects(),
  loadReceivedStoryProjects(),
  loadPendingSupporterInvites(),
  loadPendingStoryRelationshipInvites()
]);

const supporterInviteReference = getSupporterInviteReferenceFromUrl();
const targetedSupporterInviteId =
  supporterInviteReference && supporterInviteReference !== "1"
    ? supporterInviteReference
    : null;
const orderedPendingInvites = targetedSupporterInviteId
  ? [...pendingInvites].sort((a, b) =>
      Number(b.invite_id === targetedSupporterInviteId) -
      Number(a.invite_id === targetedSupporterInviteId)
    )
  : pendingInvites;

setSupportedProjects(supportedStoryProjects);
setReceivedProjects(receivedStoryProjects);
setPendingSupporterInvites(orderedPendingInvites);
setPendingStoryRelationshipInvites(pendingRelationshipInvites);
setProgress({
  currentIndex,
  total: questionSet.length
});

let sceneAfterInvite = nextScene;

const ownStoryStartedKey = `tateyoko:own-story-started:${session.user.id}`;
if (
  !deliveryToken &&
  (supportedStoryProjects.length > 0 || receivedStoryProjects.length > 0) &&
  nextScene !== "home" &&
  localStorage.getItem(ownStoryStartedKey) !== "1"
) {
  sceneAfterInvite = "connections_home";
}

if (
  isBetaMode() &&
  currentUser?.__isNewProfile &&
  session.user?.id &&
  supportedStoryProjects.length === 0 &&
  receivedStoryProjects.length === 0
) {
  const betaIntroSeenKey = getBetaIntroSeenKey(session.user.id);

  if (localStorage.getItem(betaIntroSeenKey) !== "1") {
    sceneAfterInvite = "beta_intro";
  }
}

if (
  targetedSupporterInviteId &&
  !orderedPendingInvites.some(
    invite => invite.invite_id === targetedSupporterInviteId
  ) &&
  !deliveryToken
) {
  setPostSupporterInviteScene(sceneAfterInvite);
  setScene("supporter_invite_account_mismatch");
  return;
}

if (pendingRelationshipInvites.length > 0 && !deliveryToken) {
  setPostSupporterInviteScene(sceneAfterInvite);
  setScene("story_relationship_invite_received");
  return;
}

if (orderedPendingInvites.length > 0 && !deliveryToken) {
  setPostSupporterInviteScene(sceneAfterInvite);
  setHasAcceptedSupporterInvite(false);
  setScene("supporter_invite_received");
  return;
}

      setScene(sceneAfterInvite);


      } catch (e) {
        console.error("init error", e);
        setScene(-1);
      } finally {
        setIsInitializing(false);
      }
    };

    initApp();
  }, []);

 const resetVoiceData = () => {
  setVoiceData({
    duration: 0,
    transcript: "",
    audioUrl: null,
    hasAudio: false,
    audioBlob: null,
    audioSegments: [],
    photoItems: [],
    storyOrigin: "question",
    photoStoryTitle: "",
    photoStoryTitleSource: null,
    photoStoryCaption: "",
    editedText: "",
    aiMirror: "",
    extractedSnippet: "",
    transcriptionStatus: "idle",
    transcriptionError: "",    
    polishStatus: "idle",
    polishError: "",
    transcriptClean: "",
    transcriptReadable: "",
    transcriptEssay: "",
    selectedStyle: "readable",
    answerId: null,
    storagePath: null,
    storagePaths: [],
    appendMode: false,
    addMoreCount: 0,
    editRecordingMode: null,
    targetAnswerId: null,
    targetSequenceOrder: null,
    editBaseText: "",
    existingAudioPaths: [],
    returnQuestionIndex: null,
    editReturnScene: null
  });
};

const goToNextQuestion = async () => {
  const currentQ = questionsDB[progress.currentIndex];
  const currentSeq = currentQ?.sequence_order || 1;

  const nextIndex = progress.currentIndex + 1;
  const nextSeq = questionsDB[nextIndex]?.sequence_order || (currentSeq + 1);

  if (user?.id) {
    await supabaseClient
      .from("profiles")
      .update({ current_sequence: nextSeq })
      .eq("id", user.id);
  }

  resetVoiceData();

  if (nextIndex >= questionsDB.length) {
    setProgress(p => ({
      ...p,
      currentIndex: Math.max(questionsDB.length - 1, 0)
    }));
    setScene(6);
    return;
  }

  setProgress(p => ({
    ...p,
    currentIndex: nextIndex
  }));

  setScene(1);
};

const handleSkipQuestion = async () => {
  setIsInitializing(true);

  try {
    const currentQ = questionsDB[progress.currentIndex];
    await markUserQuestionSkipped(currentQ?.user_question_id);
    await goToNextQuestion();
  } catch (e) {
    console.error("skip question error", e);
    alert("次の問いへ進めませんでした。");
  } finally {
    setIsInitializing(false);
  }
};

const handleSupporterInviteAccountSwitch = async () => {
  try {
    setIsInitializing(true);
    await supabaseClient.auth.signOut();
    window.location.reload();
  } catch (e) {
    console.error("supporter invite account switch error", e);
    alert("アカウントを切り替えられませんでした。");
    setIsInitializing(false);
  }
};

const handleDevLogout = async () => {
  if (!isDevMode()) return;

  const ok = window.confirm("開発用ログアウトしますか？");
  if (!ok) return;

  try {
    await supabaseClient.auth.signOut();

    resetVoiceData();
    setUser(null);
    setQuestionsDB([]);
    setNotificationPref(null);
    setProgress({ currentIndex: 0, total: 0 });
    setFoundation(null);
    setPendingBetaSurvey(null);
    setScene(-1);
  } catch (e) {
    console.error("dev logout error", e);
    alert("ログアウトに失敗しました。");
  }
};

const openSupportedProject = async (supportedProject) => {
  if (!supportedProject?.book_project_id) return;

  try {
    setIsInitializing(true);

    const bookData = await loadSupporterBookData(supportedProject);

    setSupportContext({
      project: supportedProject,
      ...bookData
    });
    setScene("support_project_home");
  } catch (error) {
    console.error("supported project open error", error);
    alert("お手伝いする物語を開けませんでした。");
  } finally {
    setIsInitializing(false);
  }
};

const openReceivedProject = async (receivedProject) => {
  if (!receivedProject?.book_project_id) return;

  try {
    setIsInitializing(true);
    const storyData = await loadReceivedStoryData(receivedProject);
    setReceivedContext({ project: receivedProject, ...storyData });
    setScene("received_story_pages");
  } catch (error) {
    console.error("received project open error", error);
    alert("共有された物語を開けませんでした。");
  } finally {
    setIsInitializing(false);
  }
};

const refreshSupportedProject = async () => {
  if (!supportContext?.project) return;

  const bookData = await loadSupporterBookData(supportContext.project);

  setSupportContext(prev => ({
    ...prev,
    ...bookData
  }));
};

const handleSupporterInviteResponse = async (invite, accept) => {
  if (!invite?.invite_id) return;

  await respondToSupporterInvite(invite.invite_id, accept);

  const remainingInvites = pendingSupporterInvites.filter(
    item => item.invite_id !== invite.invite_id
  );
  const acceptedAfterResponse = hasAcceptedSupporterInvite || accept;

  setPendingSupporterInvites(remainingInvites);
  setHasAcceptedSupporterInvite(acceptedAfterResponse);

  if (accept) {
    const refreshedSupportedProjects = await loadSupportedStoryProjects();
    setSupportedProjects(refreshedSupportedProjects);
    setAcceptedConnection({
      type: "supporter",
      ownerName: invite.subject_name || "ご家族",
      project: refreshedSupportedProjects.find(
        project => project.book_project_id === invite.book_project_id
      ) || null
    });
  }

  if (remainingInvites.length > 0) {
    return;
  }

  setScene(
    acceptedAfterResponse
      ? "connection_complete"
      : postSupporterInviteScene || "home"
  );
};

const handleStoryRelationshipInviteResponse = async (invite, accept) => {
  if (!invite?.invite_id) return;
  try {
    setIsInitializing(true);
    await respondToStoryRelationshipInvite(invite.invite_id, accept);
    const remaining = pendingStoryRelationshipInvites.filter(item => item.invite_id !== invite.invite_id);
    setPendingStoryRelationshipInvites(remaining);
    if (accept) {
      const refreshedReceivedProjects = await loadReceivedStoryProjects();
      setReceivedProjects(refreshedReceivedProjects);
      setAcceptedConnection({
        type: invite.invite_type,
        ownerName: invite.owner_name || "ご家族",
        relationshipLabel: invite.relationship_label || null,
        project: refreshedReceivedProjects.find(
          project => project.book_project_id === invite.book_project_id
        ) || refreshedReceivedProjects[0] || null
      });
    }
    setScene(
      remaining.length > 0
        ? "story_relationship_invite_received"
        : accept
          ? "connection_complete"
          : (postSupporterInviteScene || "home")
    );
  } catch (error) {
    console.error("story relationship invite response error", error);
    alert("依頼への回答を保存できませんでした。");
  } finally {
    setIsInitializing(false);
  }
};

const continueAfterTokenAuth = async () => {
  setIsInitializing(true);

  try {
    const {
      data: { session },
      error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError || !session) {
      throw new Error("ログイン情報を取得できませんでした");
    }

    const token = deliveryToken || getDeliveryTokenFromUrl();

    if (!token) {
      throw new Error("復帰リンクの情報が見つかりません");
    }

    const tokenData = deliveryTokenData || await resolveDeliveryToken(token);

    if (!tokenData?.user_id) {
      throw new Error("復帰リンクを確認できませんでした");
    }

    if (session.user.id !== tokenData.user_id) {
      await supabaseClient.auth.signOut();
      throw new Error("このリンクは別のアカウントのものです");
    }

    const profile = await ensureProfileExists(session.user);

    const currentUser = {
      id: session.user.id,
      ...profile,
      email: session.user.email || profile?.email || "",
      name: profile?.display_name || profile?.name || "あなた"
    };

    const foundationData = await ensureUserFoundation(session.user.id, currentUser);
    setFoundation(foundationData);

    const questionSet = await loadUserQuestionSet(
      session.user.id,
      foundationData
    );

    const notificationData = await loadNotificationPreference(session.user.id);

    const resumeIndex = getResumeQuestionIndexFromToken(questionSet, tokenData);

    setAccessMode("session");
    setDeliveryToken(token);
    setDeliveryTokenData(tokenData);
    setUser(currentUser);
    setNotificationPref(notificationData || null);
    setQuestionsDB(questionSet);
    setProgress({
      currentIndex: resumeIndex,
      total: questionSet.length
    });

    setScene(hasRecentMicCheck() ? 1 : "daily_mic_check");
  } catch (e) {
    console.error("continue after token auth error", e);
    alert(e instanceof Error ? e.message : "物語の続きを開けませんでした。");
    setScene(-1);
  } finally {
    setIsInitializing(false);
  }
};

const pickTranscriptByStyle = (data, style) => {
  if (style === "clean") {
    return data.transcriptClean || data.transcriptReadable || data.editedText || data.transcript || "";
  }

  if (style === "essay") {
    return data.transcriptEssay || data.transcriptReadable || data.editedText || data.transcript || "";
  }

  return data.transcriptReadable || data.transcriptClean || data.editedText || data.transcript || "";
};

const buildRecordedVoiceData = (prev, txt, dur, url, blob) => {
  const previousTranscript = String(prev.transcript || "").trim();
  const newTranscript = String(txt || "").trim();

  const mergedTranscript = prev.appendMode
    ? formatTranscriptForReading([previousTranscript, newTranscript].filter(Boolean).join("\n\n"))
    : newTranscript;

  const mergedDuration = prev.appendMode
    ? Math.min(
        MAX_RECORDING_SECONDS_PER_QUESTION,
        (prev.duration || 0) + (dur || 0)
      )
    : Math.min(
        MAX_RECORDING_SECONDS_PER_QUESTION,
        dur || 0
      );

  const newSegment = blob && blob.size > 0
    ? {
        url,
        blob,
        duration: dur || 0,
        transcript: newTranscript,
        createdAt: Date.now()
      }
    : null;

  const mergedSegments = prev.appendMode
    ? [
        ...(prev.audioSegments || []),
        ...(newSegment ? [newSegment] : [])
      ]
    : (newSegment ? [newSegment] : []);

  return {
    ...prev,
    transcript: mergedTranscript,
    duration: mergedDuration,
    audioUrl: newSegment?.url || prev.audioUrl,
    audioBlob: newSegment?.blob || prev.audioBlob,
    audioSegments: mergedSegments,
    hasAudio: mergedSegments.length > 0 || prev.hasAudio,
    appendMode: false,
    transcriptionStatus: "idle",
    transcriptionError: "",
    polishStatus: "idle",
    polishError: ""
  };
};

const handleRecordComplete = (txt, dur, url, blob) => {
  console.log("recorded blob", {
    type: blob?.type,
    size: blob?.size,
    duration: dur,
    transcript: txt
  });

  const hasBlob = !!blob && blob.size > 0;
  const hasTranscript = !!String(txt || "").trim();

  if (!hasBlob && !hasTranscript) {
    alert("音声を取得できませんでした。ブラウザのマイク許可を確認して、もう一度お試しください。");
    resetVoiceData();
    setScene(3);
    return;
  }

  const nextVoiceData = buildRecordedVoiceData(voiceData, txt, dur, url, blob);

  setVoiceData({
    ...nextVoiceData,
    transcriptionStatus: "processing",
    transcriptionError: ""
  });

  setScene(3.5);

  handleTranscribeForReview(nextVoiceData);
};


const handlePhotoSelect = (files) => {
    const selectedFiles = Array.from(files || [])
      .filter(file => file && file.type && file.type.startsWith("image/"));

    if (selectedFiles.length === 0) return;

    setVoiceData(prev => {
      const existing = prev.photoItems || [];

      const additions = selectedFiles.map(file => ({
        file,
        url: URL.createObjectURL(file),
        name: file.name || "photo",
        type: file.type || "image/jpeg",
        createdAt: Date.now() + Math.random()
      }));

      return {
        ...prev,
        photoItems: [...existing, ...additions]
      };
    });
  };

  const startPhotoStory = async photo => {
    if (!photo?.file) return;
    try {
      setIsInitializing(true);
      const prompt = "この写真について、覚えていることをお話しください。";
      const { data: newUserQuestionId, error } = await supabaseClient.rpc("add_custom_story_question", {
        input_book_project_id: foundation?.project?.id,
        input_question_text: prompt,
        input_chapter_title: "写真から残した記憶",
        input_position: "next"
      });
      if (error) throw error;
      const refreshed = await loadUserQuestionSet(user.id, foundation);
      const nextIndex = refreshed.findIndex(item => item.user_question_id === newUserQuestionId);
      setQuestionsDB(refreshed);
      setProgress({ currentIndex: nextIndex >= 0 ? nextIndex : 0, total: refreshed.length });
      resetVoiceData();
      setVoiceData(prev => ({
        ...prev,
        photoItems: [photo],
        storyOrigin: "photo",
        photoStoryTitle: "この一枚のこと",
        photoStoryTitleSource: "fallback"
      }));
      setScene(3);
    } catch (error) {
      console.error("photo story start error", error);
      alert("写真から語る準備ができませんでした。");
    } finally { setIsInitializing(false); }
  };

  const handleRemovePhoto = (createdAt) => {
    setVoiceData(prev => {
      const remaining = (prev.photoItems || []).filter(photo => photo.createdAt !== createdAt);
      const removed = (prev.photoItems || []).find(photo => photo.createdAt === createdAt);

      if (removed?.url) {
        try { URL.revokeObjectURL(removed.url); } catch (e) {}
      }

      return {
        ...prev,
        photoItems: remaining
      };
    });
  };

  const handleEditedTextChange = (nextText) => {
    setVoiceData(prev => ({
      ...prev,
      editedText: nextText
    }));
  };

const getAnswerTextForEditRecording = (answer) => (
  answer?.transcript_edited ||
  answer?.transcript_readable ||
  answer?.transcript_clean ||
  answer?.transcript_raw ||
  answer?.snippet ||
  ""
);

const startEditRecording = (
  answer,
  mode,
  existingAudioPaths = [],
  editReturnScene = "story_pages"
) => {
  if (!answer?.id) return false;

  if (mode === "replace") {
    const ok = window.confirm(
      "語り直すと、今保存されている音声と文章は新しい内容に置き換わります。写真は残ります。よろしいですか？"
    );
    if (!ok) return false;
  }

  if (mode === "append") {
    if ((existingAudioPaths || []).length >= MAX_AUDIO_PARTS_PER_QUESTION) {
      alert("語り足しの上限に達しました。\nここからは本文の編集で整えられます。");
      return false;
    }

    const ok = window.confirm(
      "語り足すと、今の本文に追加の語りを加えて文章を再構成します。本文は上書きされます。よろしいですか？"
    );
    if (!ok) return false;
  }

  const targetIndex = questionsDB.findIndex(q =>
    Number(q.sequence_order) === Number(answer.sequence_order)
  );

  if (targetIndex >= 0) {
    setProgress(prev => ({
      ...prev,
      currentIndex: targetIndex
    }));
  }

  const target = {
    mode,
    answerId: answer.id,
    sequenceOrder: answer.sequence_order,
    existingAudioPaths: existingAudioPaths || [],
    baseText: getAnswerTextForEditRecording(answer)
  };

  setVoiceData({
    duration: 0,
    transcript: "",
    audioUrl: null,
    hasAudio: false,
    audioBlob: null,
    audioSegments: [],
    photoItems: [],
    storyOrigin: "question",
    photoStoryTitle: "",
    photoStoryTitleSource: null,
    photoStoryCaption: "",
    editedText: "",
    aiMirror: "",
    extractedSnippet: "",
    transcriptionStatus: "idle",
    transcriptionError: "",
    polishStatus: "idle",
    polishError: "",
    transcriptClean: "",
    transcriptReadable: "",
    transcriptEssay: "",
    selectedStyle: "readable",
    answerId: answer.id,
    storagePath: null,
    storagePaths: [],
    appendMode: false,
    addMoreCount: 0,
    editRecordingMode: mode,
    targetAnswerId: answer.id,
    targetSequenceOrder: answer.sequence_order,
    editBaseText: target.baseText,
    existingAudioPaths: target.existingAudioPaths,
    returnQuestionIndex: progress.currentIndex,
    editReturnScene
  });

  setScene(3);
  return true;
};


const handleTranscribeForReview = async (sourceVoiceData = voiceData) => {
  setVoiceData(prev => ({
    ...prev,
    transcriptionStatus: "processing",
    transcriptionError: ""
  }));

  try {
    const currentQ = questionsDB[progress.currentIndex];
    const currentSeq = sourceVoiceData.targetSequenceOrder || currentQ?.sequence_order;


const editMode = sourceVoiceData.editRecordingMode || null;
const existingAudioPaths = sourceVoiceData.existingAudioPaths || [];

let targetAnswerId =
  sourceVoiceData.targetAnswerId ||
  sourceVoiceData.answerId ||
  crypto.randomUUID();

if (!sourceVoiceData.targetAnswerId) {
  const { data: existingAnswer } = await supabaseClient
    .from("answers")
    .select("id")
    .match({
      user_id: user.id,
      sequence_order: currentSeq
    })
    .maybeSingle();

  if (existingAnswer) targetAnswerId = existingAnswer.id;
}

let paths = [];


const audioSegments =
  sourceVoiceData.audioSegments && sourceVoiceData.audioSegments.length > 0
    ? sourceVoiceData.audioSegments
    : (
        sourceVoiceData.hasAudio && sourceVoiceData.audioBlob
          ? [{
              blob: sourceVoiceData.audioBlob,
              url: sourceVoiceData.audioUrl,
              duration: sourceVoiceData.duration || 0,
              transcript: sourceVoiceData.transcript || "",
              createdAt: Date.now()
            }]
          : []
      );

const uploadStartIndex =
  editMode === "append"
    ? existingAudioPaths.length
    : 0;

for (let i = 0; i < audioSegments.length; i++) {
      const segment = audioSegments[i];
      const blob = segment?.blob;

      if (!blob || !blob.size) continue;

      const contentType = blob.type || "audio/mp4";
      const ext = contentType.includes("mp4")
        ? "mp4"
        : contentType.includes("aac")
          ? "aac"
          : "webm";

      const segmentNo = String(uploadStartIndex + i + 1).padStart(2, "0");
      const path = `${user.id}/${targetAnswerId}/part-${segmentNo}.${ext}`;

      const { error: uploadError } = await supabaseClient.storage
        .from("audio")
        .upload(path, blob, {
          contentType,
          upsert: true
        });

      if (uploadError) {
        console.error("storage upload error", uploadError);
        throw new Error("音声の保存に失敗しました");
      }

      paths.push(path);
    }

const combinedStoragePaths =
  editMode === "append"
    ? [...existingAudioPaths, ...paths]
    : paths;

setVoiceData(prev => ({
  ...prev,
  answerId: targetAnswerId,
  storagePath: combinedStoragePaths[combinedStoragePaths.length - 1] || prev.storagePath || null,
  storagePaths: combinedStoragePaths.length > 0 ? combinedStoragePaths : prev.storagePaths
}));

    const aiResult = await transcribeAudioOnServer({
      answerId: targetAnswerId,
      audioPaths: paths,
      fallbackTranscript: sourceVoiceData.transcript,
      bookProjectId: foundation?.project?.id || currentQ?.book_project_id || null,
      questionText: currentQ?.content || "",
      previousTranscript:
        editMode === "append" ? sourceVoiceData.editBaseText || "" : ""
    });

const newTranscriptRaw =
  aiResult.transcript_raw ||
  aiResult.transcript ||
  sourceVoiceData.transcript ||
  "";

const transcriptRaw =
  editMode === "append"
    ? formatTranscriptForReading(
        [
          sourceVoiceData.editBaseText,
          newTranscriptRaw
        ].filter(Boolean).join("\n\n")
      )
    : newTranscriptRaw;

const firstData = {
  ...sourceVoiceData,
  answerId: targetAnswerId,
  storagePath: combinedStoragePaths[combinedStoragePaths.length - 1] || sourceVoiceData.storagePath || null,
  storagePaths: combinedStoragePaths.length > 0 ? combinedStoragePaths : sourceVoiceData.storagePaths,

  transcript: transcriptRaw,
  transcriptClean: transcriptRaw,
  transcriptReadable: transcriptRaw,
  transcriptEssay: "",

  selectedStyle: "readable",
  editedText: transcriptRaw,

  aiMirror: "ひとつの時間が、形になっています",
  extractedSnippet:
    transcriptRaw
      ? `「${transcriptRaw.slice(0, 45)}${transcriptRaw.length > 45 ? "…" : ""}」`
      : "「静かな時間が流れていました」",

  transcriptionStatus: "done",
  transcriptionError: "",
  polishStatus: "processing",
  polishError: ""
};

if (sourceVoiceData.storyOrigin === "photo" && sourceVoiceData.photoStoryTitleSource !== "user") {
  firstData.photoStoryTitle = derivePhotoStoryTitle(transcriptRaw);
  firstData.photoStoryTitleSource = firstData.photoStoryTitle === "この一枚のこと" ? "fallback" : "generated";
}

setVoiceData(firstData);
setScene(3.5);

try {
  const polishResult = await polishTranscriptOnServer({
    answerId: targetAnswerId,
    transcriptRaw,
    questionText: currentQ?.content || "",
    bookProjectId: foundation?.project?.id || currentQ?.book_project_id || null
  });
    setVoiceData(prev => {
     if (prev.answerId !== targetAnswerId) return prev;
      const next = {
      ...prev,
      transcriptClean:
        polishResult.transcript_clean ||
        prev.transcriptClean ||
        transcriptRaw,

      transcriptReadable:
        polishResult.transcript_readable ||
        polishResult.transcript_clean ||
        prev.transcriptReadable ||
        transcriptRaw,

      transcriptEssay:
        polishResult.transcript_essay ||
        prev.transcriptEssay ||
        "",

      aiMirror:
        polishResult.ai_mirror_text ||
        prev.aiMirror ||
        "ひとつの時間が、形になっています",

      extractedSnippet:
        polishResult.extracted_snippet ||
        prev.extractedSnippet,

      polishStatus: "done",
      polishError: ""
    };

    if (next.storyOrigin === "photo" && next.photoStoryTitleSource !== "user") {
      const titleBase = polishResult.transcript_readable || polishResult.transcript_clean || transcriptRaw;
      next.photoStoryTitle = derivePhotoStoryTitle(titleBase);
      next.photoStoryTitleSource = next.photoStoryTitle === "この一枚のこと" ? "fallback" : "generated";
    }

    return {
      ...next,
      editedText: pickTranscriptByStyle(next, next.selectedStyle || "readable")
    };
  });
} catch (polishError) {
  console.error("polish transcript error", polishError);

  setVoiceData(prev => {
    if (prev.answerId !== targetAnswerId) return prev;
    return {
      ...prev,
      polishStatus: "error",
      polishError: "文章の整形に失敗しました。文字起こし本文は利用できます。"
    };
  });
}

  } catch (error) {
    console.error(error);

  setVoiceData(prev => ({
    ...prev,
    transcriptionStatus: "error",
    transcriptionError: "文字起こしに失敗しました。音声は保存されている可能性があります。",
    editedText:
      prev.editedText ||
      prev.transcriptReadable ||
      prev.transcriptClean ||
      prev.transcript ||
      ""
  }));

    setScene(3.5);
  }
};

const getLifeOutlineSourceAnswers = async () => {
  const lifeOutlineQuestions = questionsDB
    .filter(question => question?.onboarding_group === "life_outline")
    .sort((a, b) => Number(a.sequence_order) - Number(b.sequence_order));

  const sequenceOrders = lifeOutlineQuestions
    .map(question => Number(question.sequence_order))
    .filter(Number.isFinite);

  if (!user?.id || sequenceOrders.length === 0) {
    return [];
  }

  const { data, error } = await supabaseClient
    .from("answers")
    .select(`
      id,
      sequence_order,
      transcript_raw,
      transcript_clean,
      transcript_readable,
      transcript_essay,
      transcript_edited,
      selected_style
    `)
    .eq("user_id", user.id)
    .in("sequence_order", sequenceOrders)
    .order("sequence_order", { ascending: true });

  if (error) {
    console.error("life outline source answers load error", error);
    throw new Error("人生の輪郭の語りを読み込めませんでした");
  }

  return (data || []).map(answer => {
    const question = lifeOutlineQuestions.find(
      item => Number(item.sequence_order) === Number(answer.sequence_order)
    );

    const selectedText =
      answer.transcript_edited ||
      (
        answer.selected_style === "essay"
          ? answer.transcript_essay
          : answer.transcript_readable
      ) ||
      answer.transcript_readable ||
      answer.transcript_clean ||
      answer.transcript_raw ||
      "";

    return {
      ...answer,
      questionText: question?.content || "",
      selectedText: String(selectedText || "").trim()
    };
  });
};

const loadLifeOutlineAudioItems = async (sourceAnswerIds, additions = []) => {
  const audioRows = [];

  if (sourceAnswerIds.length > 0) {
    const { data, error } = await supabaseClient
      .from("media_assets")
      .select("id, answer_id, storage_path, meta_json, created_at")
      .in("answer_id", sourceAnswerIds)
      .eq("asset_type", "audio")
      .order("created_at", { ascending: true });

    if (error) {
      console.warn("life outline audio load error", error);
    } else {
      audioRows.push(...(data || []).map(row => ({
        id: row.id,
        answerId: row.answer_id,
        storagePath: row.storage_path,
        duration: Number(row.meta_json?.duration_seconds || 0),
        createdAt: row.created_at,
        source: "answer"
      })));
    }
  }

  audioRows.push(
    ...additions
      .filter(item => item?.storage_path)
      .map(item => ({
        id: item.id || item.storage_path,
        answerId: null,
        storagePath: item.storage_path,
        duration: Number(item.duration_seconds || 0),
        createdAt: item.created_at || null,
        source: "addition"
      }))
  );

  const withUrls = await Promise.all(
    audioRows.map(async item => {
      const { data } = await supabaseClient.storage
        .from("audio")
        .createSignedUrl(item.storagePath, 60 * 60);

      return {
        ...item,
        url: data?.signedUrl || null
      };
    })
  );

  return withUrls.filter(item => item.url);
};

const normalizeLifeOutlineIntroduction = async (row, sourceAnswers = []) => {
  const meta = row?.meta_json || {};
  const additions = Array.isArray(meta.additional_audio)
    ? meta.additional_audio
    : [];

  const readable =
    String(meta.transcript_readable || row?.body_text || "").trim();

  const essay =
    String(meta.transcript_essay || readable || row?.body_text || "").trim();

  const selectedStyle =
    meta.selected_style === "essay" ? "essay" : "readable";

  const audioItems = await loadLifeOutlineAudioItems(
    sourceAnswers.map(answer => answer.id),
    additions
  );

  return {
    ...row,
    meta_json: meta,
    transcriptReadable: readable,
    transcriptEssay: essay,
    selectedStyle,
    selectedText:
      String(
        row?.body_text ||
        (selectedStyle === "essay" ? essay : readable)
      ).trim(),
    additions,
    additionCount: additions.length,
    audioItems,
    sourceAnswers
  };
};

const buildLifeOutlineRecoveryDraft = ({
  sourceAnswers = [],
  additions = [],
  editorialBase = ""
}) => {
  const currentAnswer = sourceAnswers[0] || null;
  const chronologicalAnswers = [
    ...sourceAnswers.slice(1),
    currentAnswer
  ].filter(Boolean);

  const answerParagraphs = chronologicalAnswers
    .map(answer => String(answer?.selectedText || "").trim())
    .filter(Boolean);

  const additionParagraphs = additions
    .map(item => String(item?.transcript_raw || "").trim())
    .filter(Boolean);

  const editedParagraph = String(editorialBase || "").trim();

  return [
    ...answerParagraphs,
    ...additionParagraphs,
    ...(editedParagraph ? [editedParagraph] : [])
  ].join("\n\n");
};

const generateLifeOutlineIntroduction = async ({
  existingIntroduction = null,
  additionsOverride = null,
  editorialBase = "",
  useFallbackOnly = false
} = {}) => {
  if (!user?.id || !foundation?.project?.id) {
    throw new Error("「私の歩み」の保存先が見つかりません");
  }

  setLifeOutlineStatus("generating");
  setLifeOutlineError("");

  let recoveryAnswers = [];
  let recoveryDraft = "";

  try {
    const sourceAnswers = await getLifeOutlineSourceAnswers();
    recoveryAnswers = sourceAnswers;

    if (sourceAnswers.length === 0) {
      throw new Error("人生の輪郭の回答が見つかりません");
    }

    let introduction = existingIntroduction;

    if (!introduction) {
      const { data, error } = await supabaseClient
        .from("project_introductions")
        .select("*")
        .eq("book_project_id", foundation.project.id)
        .eq("introduction_type", "life_outline")
        .maybeSingle();

      if (error) throw error;
      introduction = data || null;
    }

    const currentMeta = introduction?.meta_json || {};
    const additions = additionsOverride || (
      Array.isArray(currentMeta.additional_audio)
        ? currentMeta.additional_audio
        : []
    );

    recoveryDraft = buildLifeOutlineRecoveryDraft({
      sourceAnswers,
      additions,
      editorialBase
    });

    const sourceSections = sourceAnswers
      .filter(answer => answer.selectedText)
      .map((answer, index) => (
        `【語り ${index + 1}】\n` +
        `${answer.questionText ? `問い：${answer.questionText}\n` : ""}` +
        `答え：${answer.selectedText}`
      ));

    const additionSections = additions
      .filter(item => String(item?.transcript_raw || "").trim())
      .map((item, index) => (
        `【語り足し ${index + 1}】\n${String(item.transcript_raw).trim()}`
      ));

    const editedSection =
      String(editorialBase || "").trim()
        ? [`【現在の編集済み文章】\n${String(editorialBase).trim()}`]
        : [];

    const sourceText = [
      ...sourceSections,
      ...additionSections,
      ...editedSection
    ].join("\n\n");

    const generationId = introduction?.id || crypto.randomUUID();
    const generated = useFallbackOnly
      ? {
          transcript_clean: recoveryDraft,
          transcript_readable: recoveryDraft,
          transcript_essay: recoveryDraft
        }
      : await polishTranscriptOnServer({
          answerId: generationId,
          transcriptRaw: sourceText,
          questionText:
            "複数の語りを重複なく一つにつなぎ、後から読む人に、その人の生まれ育ち、家族、学校生活、仕事や役割、暮らしの大きな変化、現在の生活が自然に伝わる人物紹介文「私の歩み」にまとめてください。語った順番が現在から始まっていても、文章は生まれ育ちから現在へ自然に並べ替えてください。本人が話していない年代や事実は推測せず、問いや見出しは本文に残さないでください。",
          mode: "life_outline",
          bookProjectId: foundation.project.id
        });

    const readable = String(
      generated.transcript_readable ||
      generated.transcript_clean ||
      sourceText
    ).trim();

    const essay = String(
      generated.transcript_essay ||
      readable
    ).trim();

    const selectedStyle =
      currentMeta.selected_style === "essay" ? "essay" : "readable";

    const selectedBody =
      selectedStyle === "essay" ? essay : readable;

    const nextMeta = {
      ...currentMeta,
      transcript_readable: readable,
      transcript_essay: essay,
      selected_style: selectedStyle,
      additional_audio: additions,
      addition_count: additions.length,
      source_answer_ids: sourceAnswers.map(answer => answer.id)
    };

    const { data: savedIntroduction, error: saveError } = await supabaseClient
      .from("project_introductions")
      .upsert({
        id: generationId,
        book_project_id: foundation.project.id,
        person_id: foundation?.person?.id || null,
        introduction_type: "life_outline",
        title: "私の歩み",
        body_text: selectedBody,
        generation_status: "generated",
        generation_version:
          useFallbackOnly ? "recovery-draft-v1" : "polish-transcript-v1",
        is_user_edited: false,
        generated_at: new Date().toISOString(),
        edited_at: null,
        meta_json: nextMeta
      }, {
        onConflict: "book_project_id,introduction_type"
      })
      .select()
      .single();

    if (saveError) {
      console.error("life outline introduction save error", saveError);
      throw new Error("「私の歩み」を保存できませんでした");
    }

    const sourceLinks = sourceAnswers.map((answer, index) => ({
      project_introduction_id: savedIntroduction.id,
      answer_id: answer.id,
      include_in_text: true,
      include_in_audio: true,
      text_order: index + 1,
      audio_order: index + 1
    }));

    const { error: sourceError } = await supabaseClient
      .from("project_introduction_sources")
      .upsert(sourceLinks, {
        onConflict: "project_introduction_id,answer_id"
      });

    if (sourceError) {
      console.warn("life outline source link save error", sourceError);
    }

    const normalized = await normalizeLifeOutlineIntroduction(
      savedIntroduction,
      sourceAnswers
    );

    setLifeOutlineIntroduction(normalized);
    setLifeOutlineStatus("ready");
    return normalized;
  } catch (error) {
    console.error("life outline generation error", error);

    if (recoveryAnswers.length > 0) {
      setLifeOutlineIntroduction(prev => ({
        ...(prev || {}),
        transcriptReadable: recoveryDraft,
        transcriptEssay: recoveryDraft,
        selectedStyle: "readable",
        selectedText: recoveryDraft,
        sourceAnswers: recoveryAnswers,
        recoveryDraft: true
      }));
    }

    setLifeOutlineStatus("error");
    setLifeOutlineError(
      "録音が短い、音声が不鮮明、または通信が混み合っている可能性があります。"
    );
    throw error;
  }
};

const loadLifeOutlineIntroduction = async ({ generateIfMissing = true } = {}) => {
  if (!foundation?.project?.id) return null;

  setLifeOutlineStatus("loading");
  setLifeOutlineError("");

  try {
    const sourceAnswers = await getLifeOutlineSourceAnswers();

    const { data, error } = await supabaseClient
      .from("project_introductions")
      .select("*")
      .eq("book_project_id", foundation.project.id)
      .eq("introduction_type", "life_outline")
      .maybeSingle();

    if (error) throw error;

    if (!data?.body_text && generateIfMissing) {
      return await generateLifeOutlineIntroduction({
        existingIntroduction: data || null
      });
    }

    if (!data) {
      setLifeOutlineStatus("error");
      setLifeOutlineError("「私の歩み」がまだ作成されていません");
      return null;
    }

    const normalized = await normalizeLifeOutlineIntroduction(
      data,
      sourceAnswers
    );

    setLifeOutlineIntroduction(normalized);
    setLifeOutlineStatus("ready");
    return normalized;
  } catch (error) {
    console.error("life outline introduction load error", error);
    setLifeOutlineStatus("error");
    setLifeOutlineError(
      error instanceof Error
        ? error.message
        : "「私の歩み」を読み込めませんでした"
    );
    return null;
  }
};

const persistLifeOutlineText = async ({
  style,
  text,
  isUserEdited
}) => {
  if (!lifeOutlineIntroduction?.id) return;

  const selectedStyle = style === "essay" ? "essay" : "readable";
  const nextText = String(text || "").trim();
  const currentMeta = lifeOutlineIntroduction.meta_json || {};
  const nextMeta = {
    ...currentMeta,
    selected_style: selectedStyle,
    transcript_readable:
      selectedStyle === "readable"
        ? nextText
        : lifeOutlineIntroduction.transcriptReadable,
    transcript_essay:
      selectedStyle === "essay"
        ? nextText
        : lifeOutlineIntroduction.transcriptEssay
  };

  const optimistic = {
    ...lifeOutlineIntroduction,
    body_text: nextText,
    selectedStyle,
    selectedText: nextText,
    transcriptReadable: nextMeta.transcript_readable,
    transcriptEssay: nextMeta.transcript_essay,
    is_user_edited:
      isUserEdited ? true : lifeOutlineIntroduction.is_user_edited,
    meta_json: nextMeta
  };

  setLifeOutlineIntroduction(optimistic);

  const { error } = await supabaseClient
    .from("project_introductions")
    .update({
      body_text: nextText,
      is_user_edited:
        isUserEdited ? true : lifeOutlineIntroduction.is_user_edited,
      edited_at:
        isUserEdited
          ? new Date().toISOString()
          : lifeOutlineIntroduction.edited_at,
      meta_json: nextMeta
    })
    .eq("id", lifeOutlineIntroduction.id);

  if (error) {
    console.error("life outline text save error", error);
    setLifeOutlineError("文章の変更を保存できませんでした");
  }
};

const handleLifeOutlineAddRecording = async (txt, dur, _url, blob) => {
  const introduction = lifeOutlineIntroduction;
  const additions = introduction?.additions || [];

  if (!introduction?.id) {
    alert("「私の歩み」を読み込んでから、もう一度お試しください。");
    setScene("life_outline_summary");
    return;
  }

  if (additions.length >= MAX_LIFE_OUTLINE_ADDITIONS) {
    alert("語り足しはここまでです。文章の編集で仕上げられます。");
    setScene("life_outline_summary");
    return;
  }

  setScene("life_outline_summary");
  setLifeOutlineStatus("generating");
  setLifeOutlineError("");

  try {
    const additionId = crypto.randomUUID();
    let storagePath = null;

    if (blob?.size) {
      const contentType = blob.type || "audio/mp4";
      const ext = contentType.includes("mp4")
        ? "mp4"
        : contentType.includes("aac")
          ? "aac"
          : "webm";

      storagePath =
        `${user.id}/introductions/${introduction.id}/` +
        `addition-${String(additions.length + 1).padStart(2, "0")}-${additionId}.${ext}`;

      const { error: uploadError } = await supabaseClient.storage
        .from("audio")
        .upload(storagePath, blob, {
          contentType,
          upsert: false
        });

      if (uploadError) {
        console.error("life outline addition upload error", uploadError);
        throw new Error("追加の音声を保存できませんでした");
      }
    }

    let transcriptRaw = String(txt || "").trim();

    if (storagePath) {
      try {
        const transcription = await transcribeAudioOnServer({
          answerId: introduction.id,
          audioPaths: [storagePath],
          fallbackTranscript: transcriptRaw,
          bookProjectId: foundation.project.id,
          questionText: "これまでの歩みを補足してください。",
          previousTranscript:
            introduction.body_text || introduction.selectedText || ""
        });

        transcriptRaw = String(
          transcription.transcript_raw ||
          transcription.transcript ||
          transcriptRaw
        ).trim();
      } catch (error) {
        if (!transcriptRaw) throw error;
        console.warn("life outline addition transcription fallback", error);
      }
    }

    if (!transcriptRaw) {
      throw new Error("追加した語りを文字にできませんでした");
    }

    const nextAddition = {
      id: additionId,
      storage_path: storagePath,
      duration_seconds: Number(dur || 0),
      transcript_raw: transcriptRaw,
      created_at: new Date().toISOString()
    };

    const nextAdditions = [...additions, nextAddition];
    const nextMeta = {
      ...(introduction.meta_json || {}),
      additional_audio: nextAdditions,
      addition_count: nextAdditions.length
    };

    const { error: additionSaveError } = await supabaseClient
      .from("project_introductions")
      .update({ meta_json: nextMeta })
      .eq("id", introduction.id);

    if (additionSaveError) {
      throw new Error("追加した語りを保存できませんでした");
    }

    const introductionWithAddition = {
      ...introduction,
      meta_json: nextMeta,
      additions: nextAdditions,
      additionCount: nextAdditions.length
    };

    setLifeOutlineIntroduction(introductionWithAddition);

    await generateLifeOutlineIntroduction({
      existingIntroduction: introductionWithAddition,
      additionsOverride: nextAdditions,
      editorialBase:
        introduction.is_user_edited
          ? introduction.body_text
          : ""
    });
  } catch (error) {
    console.error("life outline add recording error", error);
    setLifeOutlineStatus("error");
    setLifeOutlineError(
      error instanceof Error
        ? error.message
        : "語り足した内容を反映できませんでした"
    );
  }
};

const startLifeOutlineAnswerRetake = async (answer) => {
  if (!answer?.id) return;

  try {
    const { data, error } = await supabaseClient
      .from("media_assets")
      .select("storage_path")
      .eq("answer_id", answer.id)
      .eq("asset_type", "audio")
      .order("created_at", { ascending: true });

    if (error) throw error;

    startEditRecording(
      answer,
      "replace",
      (data || []).map(item => item.storage_path).filter(Boolean),
      "life_outline_summary"
    );
  } catch (error) {
    console.error("life outline answer retake start error", error);
    alert("語り直しを始められませんでした。");
  }
};

const completeLifeOutlineReview = async () => {
  if (!foundation?.project?.id) return;

  setIsInitializing(true);

  try {
    const firstStoryIndex = getFirstMainStoryIndex(questionsDB);
    const nextIndex = firstStoryIndex >= 0
      ? firstStoryIndex
      : progress.currentIndex;
    const firstStoryQuestion = questionsDB[nextIndex] || null;

    const { data: updatedProject, error } = await supabaseClient
      .from("book_projects")
      .update({
        onboarding_status: "life_outline_completed",
        current_onboarding_user_question_id:
          firstStoryQuestion?.user_question_id || null,
        life_outline_completed_at: new Date().toISOString()
      })
      .eq("id", foundation.project.id)
      .select()
      .single();

    if (error) throw error;

    setFoundation(prev => ({
      ...prev,
      project: updatedProject
    }));

    setProgress(prev => ({
      ...prev,
      currentIndex: nextIndex
    }));

    resetVoiceData();
    setScene("life_outline_complete");
  } catch (error) {
    console.error("life outline completion error", error);
    alert("人生の輪郭を完了できませんでした。");
  } finally {
    setIsInitializing(false);
  }
};

const leaveLifeOutlineMilestone = async ({ continueNow }) => {
  if (!foundation?.project?.id) return;

  setIsInitializing(true);

  try {
    const firstStoryIndex = getFirstMainStoryIndex(questionsDB);
    const nextIndex = firstStoryIndex >= 0
      ? firstStoryIndex
      : progress.currentIndex;
    const firstStoryQuestion = questionsDB[nextIndex] || null;

    const { data: updatedProject, error } = await supabaseClient
      .from("book_projects")
      .update({
        onboarding_status: "completed",
        current_onboarding_user_question_id: null,
        onboarding_completed_at: new Date().toISOString(),
        life_outline_completed_at:
          foundation.project.life_outline_completed_at ||
          new Date().toISOString()
      })
      .eq("id", foundation.project.id)
      .select()
      .single();

    if (error) throw error;

    setFoundation(prev => ({
      ...prev,
      project: updatedProject
    }));

    setProgress(prev => ({
      ...prev,
      currentIndex: nextIndex
    }));

    if (continueNow && firstStoryQuestion) {
      await supabaseClient
        .from("profiles")
        .update({ current_sequence: firstStoryQuestion.sequence_order })
        .eq("id", user.id);

      resetVoiceData();

      if (!notificationPref) {
        setScene("notification_setup");
        return;
      }

      if (!sharingPreference?.initial_setup_completed_at) {
        setScene("sharing_setup");
        return;
      }

      setScene(1);
      return;
    }

    setScene("home");
  } catch (error) {
    console.error("life outline milestone leave error", error);
    alert("次の画面へ進めませんでした。");
  } finally {
    setIsInitializing(false);
  }
};

useEffect(() => {
  if (
    scene !== "life_outline_summary" ||
    !user?.id ||
    !foundation?.project?.id
  ) {
    return;
  }

  if (
    lifeOutlineStatus === "idle" ||
    (!lifeOutlineIntroduction && lifeOutlineStatus !== "generating")
  ) {
    loadLifeOutlineIntroduction();
  }
}, [
  scene,
  user?.id,
  foundation?.project?.id
]);

useEffect(() => {
  const checkoutReturn = getCheckoutReturnFromUrl();

  if (
    checkoutReturn.status !== "success" ||
    !checkoutReturn.sessionId ||
    !user?.id ||
    !foundation?.project?.id ||
    checkoutSyncAttemptedRef.current
  ) {
    return;
  }

  checkoutSyncAttemptedRef.current = true;

  const finishCheckoutAsPaid = project => {
    setFoundation(prev => ({ ...prev, project }));
    setPurchaseStatus("paid");
    setPurchaseError("");
    replaceCommercialEntryUrl("purchased");
    setScene("purchase_success");
  };

  const syncCheckout = async () => {
    setPurchaseStatus("checking");
    setPurchaseError("");

    try {
      // The webhook can finish before this return page is opened. In that
      // case the project already contains the authoritative paid state and
      // there is no need to depend on a second Stripe lookup.
      if (hasFullProjectAccess(foundation.project)) {
        finishCheckoutAsPaid(foundation.project);
        return;
      }

      const { data, error } = await supabaseClient.functions.invoke(
        "sync-checkout-session",
        { body: { sessionId: checkoutReturn.sessionId } }
      );

      if (error || !data?.success) {
        throw new Error(data?.error || "購入状況を確認できませんでした");
      }

      if (!data.paid || !data.project) {
        throw new Error("お支払いの完了をまだ確認できませんでした");
      }

      finishCheckoutAsPaid(data.project);
    } catch (error) {
      console.error("checkout sync error", error);

      // A successful webhook is the source of truth. If the optional return
      // page sync failed or timed out, read the project once more before
      // showing an error so a completed purchase never looks unpaid.
      const { data: refreshedProject, error: refreshError } =
        await supabaseClient
          .from("book_projects")
          .select("*")
          .eq("id", foundation.project.id)
          .maybeSingle();

      if (!refreshError && hasFullProjectAccess(refreshedProject)) {
        finishCheckoutAsPaid(refreshedProject);
        return;
      }

      if (refreshError) {
        console.error("checkout project refresh error", refreshError);
      }

      setPurchaseStatus("error");
      setPurchaseError(
        error?.message ||
          "購入状況を確認できませんでした。少し時間をおいて、もう一度お試しください。"
      );
      setScene("purchase_start");
    }
  };

  syncCheckout();
}, [
  user?.id,
  foundation?.project?.id,
  foundation?.project?.access_status
]);

const startSelfPurchase = async () => {
  if (!foundation?.project?.id) {
    setPurchaseError("物語の準備が完了していません。画面を再読み込みしてください。");
    return;
  }

  setPurchaseStatus("starting");
  setPurchaseError("");

  try {
    const { data, error } = await supabaseClient.functions.invoke(
      "create-checkout-session",
      { body: { projectId: foundation.project.id } }
    );

    if (error || !data?.success) {
      throw new Error(data?.error || "購入画面を開けませんでした");
    }

    if (data.alreadyPurchased) {
      const refreshedFoundation = await ensureUserFoundation(user.id, user);
      setFoundation(refreshedFoundation);
      setPurchaseStatus("paid");
      replaceCommercialEntryUrl("purchased");
      setScene("purchase_success");
      return;
    }

    if (!data.checkoutUrl) {
      throw new Error("購入画面を開けませんでした");
    }

    window.location.assign(data.checkoutUrl);
  } catch (error) {
    console.error("checkout start error", error);
    setPurchaseStatus("error");
    setPurchaseError(
      error?.message ||
        "購入手続きを開始できませんでした。少し時間をおいて、もう一度お試しください。"
    );
  }
};

const handleSaveAnswer = async (tag = null) => {
  setIsInitializing(true);

  try {
    const currentQ = questionsDB[progress.currentIndex];

    const currentSeq = voiceData.targetSequenceOrder || currentQ?.sequence_order;

      const editMode = voiceData.editRecordingMode || null;
      const isEditRecording = editMode === "replace" || editMode === "append";
      const ansId = voiceData.targetAnswerId || voiceData.answerId || crypto.randomUUID();

      const { data: savedAnswer, error: dbError } = await supabaseClient
        .from("answers")
        .upsert({
          id: ansId,
          user_id: user.id,
          book_project_id: foundation?.project?.id || currentQ?.book_project_id || null,
          speaker_person_id: foundation?.person?.id || null,
          subject_person_id: foundation?.project?.subject_person_id || foundation?.person?.id || null,
          user_question_id: currentQ?.user_question_id || null,
          question_id: currentQ?.question_id || currentQ?.id,
          sequence_order: currentSeq,
          transcript_raw: voiceData.transcript,
          transcript_clean: voiceData.transcriptClean || voiceData.editedText || voiceData.transcript,
          transcript_readable: voiceData.transcriptReadable || voiceData.editedText || voiceData.transcript,
          transcript_essay: voiceData.transcriptEssay || null,
          transcript_edited: voiceData.editedText,

          selected_style: voiceData.selectedStyle || "readable",

          ai_mirror: voiceData.aiMirror,

          snippet: voiceData.extractedSnippet,
          meta_json: {
            meaning_tag: tag,
            story_origin: voiceData.storyOrigin || "question",
            print_title: voiceData.storyOrigin === "photo" ? (voiceData.photoStoryTitle || "この一枚のこと") : null,
            title_source: voiceData.storyOrigin === "photo" ? (voiceData.photoStoryTitleSource || "fallback") : null,
            photo_caption: voiceData.storyOrigin === "photo" ? (voiceData.photoStoryCaption || null) : null,
            hide_prompt_in_book: voiceData.storyOrigin === "photo",

            duration_seconds: voiceData.duration,
            transcript_chars: String(voiceData.transcript || "").trim().length,

            user_question_id: currentQ?.user_question_id || null,

            prompt_style: currentQ?.prompt_style || null,
            prompt_hint: currentQ?.prompt_hint || null,
            reassurance_text: currentQ?.reassurance_text || null,
            followup_hint: currentQ?.followup_hint || null,

            min_duration_seconds: currentQ?.min_duration_seconds || 25,
            min_transcript_chars: currentQ?.min_transcript_chars || 80,

            was_short_answer:
              (
                voiceData.duration > 0 &&
                voiceData.duration < (currentQ?.min_duration_seconds || 25)
              ) ||
              String(voiceData.transcript || "").trim().length < (currentQ?.min_transcript_chars || 80),

            add_more_count: voiceData.addMoreCount || 0,
            audio_segment_count: (voiceData.audioSegments || []).length,
            audio_segment_durations: (voiceData.audioSegments || []).map(s => s.duration || 0)
          }
        }, { onConflict: "user_id,sequence_order" })
        .select("id")
        .single();

      if (dbError) {
        console.error("answers save error", dbError);
        throw new Error("回答の記録に失敗しました");
      }

      const finalAnswerId = savedAnswer?.id || ansId;

const storagePaths = voiceData.storagePaths && voiceData.storagePaths.length > 0
  ? voiceData.storagePaths
  : (voiceData.storagePath ? [voiceData.storagePath] : []);

if (editMode === "replace") {
  const { data: oldAudioRows, error: oldAudioSelectError } = await supabaseClient
    .from("media_assets")
    .select("storage_path")
    .eq("answer_id", finalAnswerId)
    .eq("user_id", user.id)
    .eq("asset_type", "audio");

  if (oldAudioSelectError) {
    console.warn("old audio media rows select error", oldAudioSelectError);
  }

  const oldAudioPaths = (oldAudioRows || [])
    .map(row => row.storage_path)
    .filter(Boolean)
    .filter(path => !storagePaths.includes(path));

  if (oldAudioPaths.length > 0) {
    const { error: oldAudioStorageError } = await supabaseClient.storage
      .from("audio")
      .remove(oldAudioPaths);

    if (oldAudioStorageError) {
      console.warn("old audio storage delete error", oldAudioStorageError);
    }
  }

  const { error: deleteAudioRowsError } = await supabaseClient
    .from("media_assets")
    .delete()
    .eq("answer_id", finalAnswerId)
    .eq("user_id", user.id)
    .eq("asset_type", "audio");

  if (deleteAudioRowsError) {
    console.warn("old audio media rows delete error", deleteAudioRowsError);
  }
}


const existingAudioPaths =
  editMode === "append"
    ? (voiceData.existingAudioPaths || [])
    : [];

const mediaStoragePaths =
  editMode === "append"
    ? storagePaths.filter(path => !existingAudioPaths.includes(path))
    : storagePaths;

if (mediaStoragePaths.length > 0) {
  const existingAudioCount = existingAudioPaths.length;

  const mediaRows = mediaStoragePaths.map((storagePath, index) => ({
    answer_id: finalAnswerId,
    user_id: user.id,
    family_id: foundation?.family?.id || null,
    book_project_id: foundation?.project?.id || currentQ?.book_project_id || null,
    person_id: foundation?.person?.id || null,
    asset_type: "audio",
    storage_path: storagePath,
    meta_json: {
      part: existingAudioCount + index + 1,
      total_parts: storagePaths.length,
      duration_seconds: voiceData.audioSegments?.[index]?.duration || null,
      transcript: voiceData.audioSegments?.[index]?.transcript || null
    }
  }));

  const { error: assetError } = await supabaseClient
    .from("media_assets")
    .upsert(mediaRows, { onConflict: "answer_id, asset_type, storage_path" });

  if (assetError) {
    console.error("media asset save error", assetError);
  }
}

      const photoItems = voiceData.photoItems || [];

      if (photoItems.length > 0) {
        const photoRows = [];

        for (let i = 0; i < photoItems.length; i++) {
          const photo = photoItems[i];
          const file = photo?.file;

          if (!file) continue;

          const contentType = file.type || "image/jpeg";
          const ext = contentType.includes("png")
            ? "png"
            : contentType.includes("webp")
              ? "webp"
              : "jpg";

          const photoNo = String(i + 1).padStart(2, "0");
          const photoPath = `${user.id}/${finalAnswerId}/photo-${photoNo}.${ext}`;

          const { error: photoUploadError } = await supabaseClient.storage
            .from("photos")
            .upload(photoPath, file, {
              contentType,
              upsert: true
            });

          if (photoUploadError) {
            console.error("photo upload error", photoUploadError);
            throw new Error("写真の保存に失敗しました");
          }

          photoRows.push({
            answer_id: finalAnswerId,
            user_id: user.id,
            family_id: foundation?.family?.id || null,
            book_project_id: foundation?.project?.id || currentQ?.book_project_id || null,
            person_id: foundation?.person?.id || null,
            asset_type: "photo",
            storage_path: photoPath,
            meta_json: {
              part: i + 1,
              total_parts: photoItems.length,
              is_primary: i === 0,
              story_origin: voiceData.storyOrigin || "question",
              caption: i === 0 ? (voiceData.photoStoryCaption || null) : null,
              file_name: photo.name || null,
              content_type: contentType
            }
          });
        }

        if (photoRows.length > 0) {
          const { error: photoAssetError } = await supabaseClient
            .from("media_assets")
            .upsert(photoRows, { onConflict: "answer_id, asset_type, storage_path" });

          if (photoAssetError) {
            console.error("photo media asset save error", photoAssetError);
          }
        }
      }

      await markUserQuestionAnswered(currentQ?.user_question_id);

      if (
  foundation?.project?.id &&
  foundation?.project?.onboarding_status !== "completed"
) {
  const nextQuestion = questionsDB[progress.currentIndex + 1] || null;

  const isCompletingLifeOutline =
    currentQ?.onboarding_group === "life_outline" &&
    (
      !nextQuestion ||
      nextQuestion?.onboarding_group !== "life_outline"
    );

  const onboardingUpdate = isCompletingLifeOutline
      ? {
          onboarding_status: "introduction_review",
          current_onboarding_user_question_id:
            nextQuestion?.user_question_id || null
        }
    : {
        onboarding_status: "in_progress",
        current_onboarding_user_question_id:
          nextQuestion?.user_question_id || null
      };

  const { data: updatedProject, error: onboardingProgressError } =
    await supabaseClient
      .from("book_projects")
      .update(onboardingUpdate)
      .eq("id", foundation.project.id)
      .select()
      .single();

  if (onboardingProgressError) {
    console.warn(
      "onboarding progress update error",
      onboardingProgressError
    );
  } else if (updatedProject) {
    setFoundation(prev => ({
      ...prev,
      project: updatedProject
    }));
  }
}

      if (isEditRecording) {
        const returnQuestionIndex =
          Number.isInteger(voiceData.returnQuestionIndex)
            ? voiceData.returnQuestionIndex
            : progress.currentIndex;
        const editReturnScene =
          voiceData.editReturnScene || "story_pages";

        resetVoiceData();

        setProgress(prev => ({
          ...prev,
          currentIndex: Math.min(
            returnQuestionIndex,
            Math.max(questionsDB.length - 1, 0)
          )
        }));

        if (editReturnScene === "life_outline_summary") {
          setScene("life_outline_summary");
          setLifeOutlineStatus("generating");

          try {
            await generateLifeOutlineIntroduction({
              existingIntroduction: lifeOutlineIntroduction,
              editorialBase:
                lifeOutlineIntroduction?.is_user_edited
                  ? lifeOutlineIntroduction.body_text
                  : ""
            });
          } catch (_error) {
            // まとめ画面側で再試行できるため、語り直しの保存は完了扱いにする。
          }
        } else {
          setScene(editReturnScene);
        }
        return;
      }

      const nextIndex = progress.currentIndex + 1;
      const nextSeq = questionsDB[nextIndex]?.sequence_order || (currentSeq + 1);

      await supabaseClient
        .from("profiles")
        .update({ current_sequence: nextSeq })
        .eq("id", user.id);

      setProgress(p => ({
        ...p,
        currentIndex: Math.min(nextIndex, questionsDB.length - 1)
      }));

localStorage.setItem("koe_last_visit", Date.now().toString());

const reachedFreeTrialLimit =
  hasRestrictedProjectAccess(foundation?.project) &&
  isLastFreeTrialQuestion(questionsDB, currentQ);

if (reachedFreeTrialLimit) {
  resetVoiceData();
  replaceCommercialEntryUrl("trial");
  setScene("trial_complete");
  return;
}

const completedLifeOutline =
  currentQ?.onboarding_group === "life_outline" &&
  (
    !questionsDB[progress.currentIndex + 1] ||
    questionsDB[progress.currentIndex + 1]?.onboarding_group !== "life_outline"
  );

const betaSurvey = isBetaMode()
  ? getBetaSurveyForSequence(currentSeq)
  : null;

if (betaSurvey && user?.id) {
  const seenKey = getBetaSurveySeenKey(user.id, betaSurvey.key);
  const hasSeenSurvey = localStorage.getItem(seenKey) === "1";

  if (!hasSeenSurvey) {
    setPendingBetaSurvey({
      ...betaSurvey,
      sequenceOrder: currentSeq,
      seenKey,
      returnScene: 6
    });
    setScene("beta_survey_prompt");
    return;
  }
}

if (completedLifeOutline) {
  resetVoiceData();
  setLifeOutlineReturnScene(null);
  setScene("life_outline_summary");
  setIsInitializing(false);

  try {
    await generateLifeOutlineIntroduction();
  } catch (_error) {
    // まとめ画面側で再試行できるため、回答の保存自体は完了扱いにする。
  }

  return;
}

const isContinuingFormalOnboarding =
  isFormalOnboardingQuestion(currentQ);

/*
 * 「人生の輪郭」の途中では完了画面を挟まず、
 * すでにcurrentIndexへ設定された次の問いへ進む。
 */
if (isContinuingFormalOnboarding) {
  resetVoiceData();
  setScene(1);
  return;
}

setScene(6);


    } catch (error) {
      console.error(error);
      alert("保存に失敗しました。");
      setScene(4);
    } finally {
      setIsInitializing(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="bg-[#0f172a] h-screen w-screen flex items-center justify-center">
        <p className="text-white/30 tracking-widest text-sm animate-pulse">
          物語を読み込んでいます...
        </p>
      </div>
    );
  }

  const currentQ = questionsDB[progress.currentIndex] || {
    chapter: "...",
    chapter_label: "...",
    chapter_description: "...",
    content: "問いを取得できませんでした"
  };
  const showGlobalHome =
    Boolean(user?.id) &&
    foundation?.project?.onboarding_status === "completed" &&
    scene !== "home" &&
    scene !== -1 &&
    scene !== "supporter_invite_received" &&
    scene !== "story_relationship_invite_received" &&
    scene !== "supporter_invite_account_mismatch";

  const returnToHome = () => {
    const hasUnsavedVoice =
      [2, 3, 4].includes(scene) &&
      (
        voiceData.hasAudio ||
        voiceData.audioBlob ||
        String(voiceData.transcript || "").trim()
      );

    if (
      hasUnsavedVoice &&
      !window.confirm("まだ保存していない録音があります。内容を破棄してホームへ戻りますか？")
    ) {
      return;
    }

    resetVoiceData();
    setSupportContext(null);
    setScene("home");
  };

  return (
    <div className="app-container">
      {showGlobalHome && (
        <button
          type="button"
          onClick={returnToHome}
          className="fixed right-[max(1rem,calc((100vw-600px)/2+1rem))] top-[calc(env(safe-area-inset-top)+0.75rem)] z-[70] w-10 h-10 rounded-full border border-white/10 bg-[#0f172a]/80 backdrop-blur-md flex items-center justify-center"
          aria-label="ホームへ戻る"
        >
          <Home size={18} className="text-white/62" strokeWidth={1.7} />
        </button>
      )}
      {scene === -1 && (
        <Scene_Login
          onLogin={async (u) => {
            setIsInitializing(true);
            try {
              setUser(u);

const foundationData = await ensureUserFoundation(u.id, u);

const questionSet = await loadUserQuestionSet(
  u.id,
  foundationData
);

const refreshedFoundationData = await ensureUserFoundation(
  u.id,
  u
);

const notificationData = await loadNotificationPreference(u.id);

setNotificationPref(notificationData || null);

setQuestionsDB(questionSet);

const currentIndex = getAuthenticatedQuestionIndex(
  questionSet,
  refreshedFoundationData?.project,
  u
);

const activeFoundationData = await ensureLifeOutlineReviewPhase({
  foundationData: refreshedFoundationData,
  questionSet,
  currentIndex
});

setFoundation(activeFoundationData);

setProgress({
  currentIndex,
  total: questionSet.length
});

let nextScene = getInitialSceneForProject({
  project: activeFoundationData?.project,
  notificationPref: notificationData || null
});

nextScene = getCommercialEntryScene({
  project: activeFoundationData?.project,
  questionSet,
  defaultScene: nextScene
});

const [supportedStoryProjects, pendingInvites, pendingRelationshipInvites] = await Promise.all([
  loadSupportedStoryProjects(),
  loadPendingSupporterInvites(),
  loadPendingStoryRelationshipInvites()
]);

const supporterInviteReference = getSupporterInviteReferenceFromUrl();
const targetedSupporterInviteId =
  supporterInviteReference && supporterInviteReference !== "1"
    ? supporterInviteReference
    : null;
const orderedPendingInvites = targetedSupporterInviteId
  ? [...pendingInvites].sort((a, b) =>
      Number(b.invite_id === targetedSupporterInviteId) -
      Number(a.invite_id === targetedSupporterInviteId)
    )
  : pendingInvites;

setSupportedProjects(supportedStoryProjects);
setPendingSupporterInvites(orderedPendingInvites);
setPendingStoryRelationshipInvites(pendingRelationshipInvites);

let sceneAfterInvite = nextScene;

            if (isBetaMode() && u?.__isNewProfile && u?.id) {
              const betaIntroSeenKey = getBetaIntroSeenKey(u.id);

              if (localStorage.getItem(betaIntroSeenKey) !== "1") {
                sceneAfterInvite = "beta_intro";
              }
            }

            if (
              targetedSupporterInviteId &&
              !orderedPendingInvites.some(
                invite => invite.invite_id === targetedSupporterInviteId
              )
            ) {
              setPostSupporterInviteScene(sceneAfterInvite);
              setScene("supporter_invite_account_mismatch");
              return;
            }

            if (pendingRelationshipInvites.length > 0) {
              setPostSupporterInviteScene(sceneAfterInvite);
              setScene("story_relationship_invite_received");
              return;
            }

            if (orderedPendingInvites.length > 0) {
              setPostSupporterInviteScene(sceneAfterInvite);
              setHasAcceptedSupporterInvite(false);
              setScene("supporter_invite_received");
              return;
            }

            setScene(sceneAfterInvite);

            } finally {
              setIsInitializing(false);
            }
          }}
        />
      )}

      {scene === "purchase_start" && (
        <Scene_PurchaseStart
          checkoutWasCancelled={getCheckoutReturnFromUrl().status === "cancelled"}
          status={purchaseStatus}
          error={purchaseError}
          onPurchase={startSelfPurchase}
          onTryFree={() => {
            setPurchaseStatus("idle");
            setPurchaseError("");
            replaceCommercialEntryUrl("trial");
            setScene(hasCompletedFreeTrial(questionsDB) ? "trial_complete" : 0);
          }}
        />
      )}

      {scene === "trial_complete" && (
        <Scene_TrialComplete
          status={purchaseStatus}
          error={purchaseError}
          onPurchase={startSelfPurchase}
          onFinish={() => window.location.assign("/")}
        />
      )}

      {scene === "purchase_success" && (
        <Scene_PurchaseSuccess
          hasTrial={hasCompletedFreeTrial(questionsDB)}
          onContinue={() => {
            setPurchaseStatus("idle");
            if (hasCompletedFreeTrial(questionsDB)) {
              setScene(1);
              return;
            }
            setScene("onboarding_overview");
          }}
        />
      )}

      {scene === "token_auth" && (
        <Scene_TokenAuthRequired
          token={deliveryToken}
          tokenData={deliveryTokenData}
          onAuthenticated={continueAfterTokenAuth}
          onInvalid={() => {
            setScene(-1);
          }}
        />
      )}

      {scene === "token_invalid" && (
        <Scene_TokenInvalid
          onBack={() => {
            setAccessMode("session");
            setDeliveryToken(null);
            setDeliveryTokenData(null);
            setScene(-1);
          }}
        />
      )}

      {scene === "beta_intro" && (
        <Scene_BetaIntro
          onNext={() => {
            if (user?.id) {
              localStorage.setItem(getBetaIntroSeenKey(user.id), "1");
            }

            setScene(getInitialSceneForProject({
              project: foundation?.project,
              notificationPref
            }));
          }}
        />
      )}

      {scene === "onboarding_overview" && (
        <Scene_OnboardingOverview
          onNext={() => setScene("onboarding_pace")}
        />
      )}

      {scene === "onboarding_pace" && (
        <Scene_OnboardingPace
          onNext={async () => {
            try {
              setIsInitializing(true);

              const { data: updatedProject, error } = await supabaseClient
                .from("book_projects")
                .update({
                  onboarding_overview_completed_at: new Date().toISOString()
                })
                .eq("id", foundation?.project?.id)
                .select()
                .single();

              if (error) throw error;

              setFoundation(prev => ({
                ...prev,
                project: updatedProject
              }));
              setScene(0);
            } catch (error) {
              console.error("onboarding overview completion error", error);
              alert("初回の準備を完了できませんでした。");
            } finally {
              setIsInitializing(false);
            }
          }}
        />
      )}

      {scene === "setup_intro" && (
        <Scene_SetupIntro
          onNext={() => setScene("story_theme_setup")}
        />
      )}

      {scene === "story_theme_setup" && (
        <Scene_StoryThemeSetup
          user={user}
          onComplete={(updatedProfile) => {
            if (updatedProfile) {
              setUser(prev => ({
                ...prev,
                ...updatedProfile,
                name: updatedProfile?.display_name || updatedProfile?.name || prev?.name || "あなた"
              }));
            }

            setScene("supporter_invite");
          }}
        />
      )}

      {scene === "supporter_invite" && (
        <Scene_SupporterInvite
          user={user}
          foundation={foundation}
          sharingPreference={sharingPreference}
          onComplete={() => setScene("notification_setup")}
        />
      )}

      {scene === "sharing_setup" && (
        <Scene_SharingSetup
          initialScope={sharingPreference?.live_scope || "family"}
          onComplete={async (liveScope) => {
            try {
              setIsInitializing(true);

              const savedPreference = await upsertStorySharingPreference({
                bookProjectId: foundation?.project?.id,
                ownerPersonId:
                  foundation?.project?.subject_person_id ||
                  foundation?.person?.id,
                liveScope
              });

              setSharingPreference(savedPreference);
              setScene("supporter_invite_initial");
            } catch (error) {
              console.error("initial sharing setup error", error);
              alert("共有範囲を保存できませんでした。");
            } finally {
              setIsInitializing(false);
            }
          }}
        />
      )}

      {scene === "supporter_invite_initial" && (
        <Scene_SupporterInvite
          user={user}
          foundation={foundation}
          sharingPreference={sharingPreference}
          isInitialSetup
          onSharingPreferenceChange={setSharingPreference}
          onComplete={async () => {
            try {
              setIsInitializing(true);

              const completedPreference = await upsertStorySharingPreference({
                bookProjectId: foundation?.project?.id,
                ownerPersonId:
                  foundation?.project?.subject_person_id ||
                  foundation?.person?.id,
                liveScope: sharingPreference?.live_scope || "family",
                markInitialSetupComplete: true
              });

              setSharingPreference(completedPreference);
              setScene(1);
            } catch (error) {
              console.error("initial supporter setup completion error", error);
              alert("設定を完了できませんでした。");
            } finally {
              setIsInitializing(false);
            }
          }}
        />
      )}

      {scene === "supporter_invite_received" && pendingSupporterInvites[0] && (
        <Scene_SupporterInviteReceived
          invite={pendingSupporterInvites[0]}
          remainingCount={pendingSupporterInvites.length}
          onAccept={() =>
            handleSupporterInviteResponse(pendingSupporterInvites[0], true)
          }
          onDecline={() =>
            handleSupporterInviteResponse(pendingSupporterInvites[0], false)
          }
        />
      )}

      {scene === "story_relationship_invite_received" && pendingStoryRelationshipInvites[0] && (
        <Scene_StoryRelationshipInviteReceived
          invite={pendingStoryRelationshipInvites[0]}
          remainingCount={pendingStoryRelationshipInvites.length}
          onAccept={() => handleStoryRelationshipInviteResponse(pendingStoryRelationshipInvites[0], true)}
          onDecline={() => handleStoryRelationshipInviteResponse(pendingStoryRelationshipInvites[0], false)}
        />
      )}

      {scene === "supporter_invite_account_mismatch" && (
        <Scene_SupporterInviteAccountMismatch
          currentEmail={user?.email}
          onSwitchAccount={handleSupporterInviteAccountSwitch}
        />
      )}

 {scene === "notification_setup" && (
  <Scene_NotificationSetup
    user={user}
    initialPreference={notificationPref}
    onPreferenceSaved={setNotificationPref}
    onBack={notificationSetupReturnScene ? () => {
      const returnScene = notificationSetupReturnScene;
      setNotificationSetupReturnScene(null);
      setScene(returnScene);
    } : null}
    onComplete={async () => {
      setIsInitializing(true);

      try {
        const foundationData =
          foundation || (await ensureUserFoundation(user.id, user));

        const questionSet = await loadUserQuestionSet(
          user.id,
          foundationData
        );

        const refreshedFoundationData =
          await ensureUserFoundation(user.id, user);

        const notificationData = await loadNotificationPreference(user.id);

        setFoundation(refreshedFoundationData);
        setNotificationPref(notificationData || null);
        setQuestionsDB(questionSet);

        const currentIndex = getProjectQuestionIndex(
          questionSet,
          refreshedFoundationData?.project,
          user
        );

        setProgress({
          currentIndex,
          total: questionSet.length
        });

        if (notificationSetupReturnScene) {
          const returnScene = notificationSetupReturnScene;
          setNotificationSetupReturnScene(null);
          setScene(returnScene);
          return;
        }

        if (
          refreshedFoundationData?.project?.onboarding_status !== "completed"
        ) {
          setScene(0);
        } else if (!sharingPreference?.initial_setup_completed_at) {
          setScene("sharing_setup");
        } else {
          setScene(1);
        }
      } finally {
        setIsInitializing(false);
      }
    }}
  />
)}

{scene === "life_outline_summary" && (
  <Scene_LifeOutlineSummary
    data={lifeOutlineIntroduction}
    status={lifeOutlineStatus}
    error={lifeOutlineError}
    isRevisit={lifeOutlineReturnScene === "story_pages"}
    onRetry={() => {
      generateLifeOutlineIntroduction({
        existingIntroduction: lifeOutlineIntroduction,
        editorialBase:
          lifeOutlineIntroduction?.is_user_edited
            ? lifeOutlineIntroduction.body_text
            : ""
      }).catch(() => {});
    }}
    onUseDraft={() => {
      generateLifeOutlineIntroduction({
        existingIntroduction: lifeOutlineIntroduction,
        editorialBase:
          lifeOutlineIntroduction?.is_user_edited
            ? lifeOutlineIntroduction.body_text
            : "",
        useFallbackOnly: true
      }).catch(() => {});
    }}
    onSelectStyle={(style) => {
      const text =
        style === "essay"
          ? lifeOutlineIntroduction?.transcriptEssay
          : lifeOutlineIntroduction?.transcriptReadable;

      persistLifeOutlineText({
        style,
        text,
        isUserEdited: false
      });
    }}
    onUpdateText={(style, text) => {
      persistLifeOutlineText({
        style,
        text,
        isUserEdited: true
      });
    }}
    onAddMore={() => {
      if (
        (lifeOutlineIntroduction?.additionCount || 0) >=
        MAX_LIFE_OUTLINE_ADDITIONS
      ) {
        alert("語り足しはここまでです。文章の編集で仕上げられます。");
        return;
      }

      setScene("life_outline_recording");
    }}
    onRetakeAnswer={startLifeOutlineAnswerRetake}
    onFinish={() => {
      if (lifeOutlineReturnScene === "story_pages") {
        setLifeOutlineReturnScene(null);
        setScene("story_pages");
        return;
      }

      completeLifeOutlineReview();
    }}
  />
)}

{scene === "life_outline_complete" && (
  <Scene_LifeOutlineComplete
    notificationLabel={formatNextNotificationLabel(notificationPref)}
    needsNotificationSetup={!notificationPref}
    needsSharingSetup={!sharingPreference?.initial_setup_completed_at}
    onContinue={() => leaveLifeOutlineMilestone({ continueNow: true })}
    onEndToday={() => leaveLifeOutlineMilestone({ continueNow: false })}
  />
)}

{scene === "life_outline_recording" && (
  <Scene_Recording
    question={{
      onboarding_group: "life_outline",
      flow_type: "onboarding",
      chapter: "人生の輪郭",
      content: "もう少し、残しておきたいことをお話しください。"
    }}
    progress={{ currentIndex: 0, total: 1 }}
    userName={user?.name || "あなた"}
    autoStart
    onComplete={handleLifeOutlineAddRecording}
  />
)}

      {scene === "home" && (
       <Scene_Home
         userName={user?.name || "あなた"}
         supportedProjects={supportedProjects}
         receivedProjects={receivedProjects}
         onStartTalking={() => {
           if (
             foundation?.project?.life_outline_completed_at &&
             !sharingPreference?.initial_setup_completed_at
           ) {
             setScene("sharing_setup");
             return;
           }

           setScene(0);
         }}
         onOpenStoryPages={() => setScene("story_pages")}
         onStartPhotoStory={() => setScene("photo_story_start")}
         onOpenBookBuilder={() => setScene("book_builder")}
         onOpenQuestionLibrary={() => setScene("question_library")}
         onOpenSettings={() => setScene("settings")}
         onOpenSupportedProject={openSupportedProject}
         onOpenReceivedProject={openReceivedProject}
         onDevLogout={isDevMode() ? handleDevLogout : null}
      />
      )}

      {scene === "connections_home" && (
        <Scene_ConnectionsHome
          userName={user?.name || "あなた"}
          receivedProjects={receivedProjects}
          supportedProjects={supportedProjects}
          onOpenReceivedProject={openReceivedProject}
          onOpenSupportedProject={openSupportedProject}
          onStartOwnStory={() => {
            if (user?.id) {
              localStorage.setItem(`tateyoko:own-story-started:${user.id}`, "1");
            }
            setScene(postSupporterInviteScene || "beta_intro");
          }}
        />
      )}

      {scene === "connection_complete" && acceptedConnection && (
        <Scene_ConnectionComplete
          connection={acceptedConnection}
          onOpen={() => {
            if (acceptedConnection.type === "supporter" && acceptedConnection.project) {
              openSupportedProject(acceptedConnection.project);
              return;
            }
            if (acceptedConnection.project) {
              openReceivedProject(acceptedConnection.project);
              return;
            }
            setScene("connections_home");
          }}
          onConnectionsHome={() => setScene("connections_home")}
        />
      )}

      {scene === "photo_story_start" && (
        <Scene_PhotoStoryStart onStart={startPhotoStory} onBack={() => setScene("home")} />
      )}

      {scene === "settings" && (
        <Scene_SettingsHome
          notificationPref={notificationPref}
          sharingPreference={sharingPreference}
          onOpenDelivery={() => {
            setNotificationSetupReturnScene("settings");
            setScene("notification_setup");
          }}
          onOpenPrivacy={() => setScene("sharing_privacy")}
          onOpenSupporters={() => setScene("supporter_management")}
          onOpenProfile={() => setScene("profile_settings")}
          onBack={() => setScene("home")}
        />
      )}

      {scene === "sharing_privacy" && (
        <Scene_SharingPrivacySettings
          foundation={foundation}
          initialPreference={sharingPreference}
          onSavePreference={async ({ familyEnabled, selectedEnabled }) => {
            try {
              const savedPreference = await upsertStorySharingPreference({
                bookProjectId: foundation?.project?.id,
                ownerPersonId:
                  foundation?.project?.subject_person_id ||
                  foundation?.person?.id,
                familyEnabled,
                selectedEnabled,
                markInitialSetupComplete: true
              });

              setSharingPreference(savedPreference);
            } catch (error) {
              console.error("sharing preference update error", error);
              alert("共有範囲を保存できませんでした。");
              throw error;
            }
          }}
          onOpenPrivateStories={() => setScene("private_story_settings")}
          onBack={() => setScene("settings")}
        />
      )}

      {scene === "private_story_settings" && (
        <Scene_PrivateStorySettings
          user={user}
          questionSet={questionsDB}
          onBack={() => setScene("sharing_privacy")}
        />
      )}

      {scene === "supporter_management" && (
        <Scene_SupporterManagement
          user={user}
          foundation={foundation}
          sharingPreference={sharingPreference}
          onSharingPreferenceChange={setSharingPreference}
          onBack={() => setScene("settings")}
        />
      )}

      {scene === "profile_settings" && (
        <Scene_ProfileSettings
          user={user}
          onSaved={(updatedUser) => {
            setUser(updatedUser);
            setScene("settings");
          }}
          onBack={() => setScene("settings")}
        />
      )}

      {scene === "question_library" && (
        <Scene_QuestionLibrary
          foundation={foundation}
          questionSet={questionsDB}
          onAdded={async () => {
            const refreshedQuestionSet = await loadUserQuestionSet(
              user.id,
              foundation
            );
            setQuestionsDB(refreshedQuestionSet);
            setProgress(prev => ({
              currentIndex: Math.min(
                getProjectQuestionIndex(
                  refreshedQuestionSet,
                  foundation?.project,
                  user
                ),
                Math.max(refreshedQuestionSet.length - 1, 0)
              ),
              total: refreshedQuestionSet.length
            }));
          }}
          onBack={() => setScene("home")}
        />
      )}

      {scene === "support_project_home" && supportContext && (
        <Scene_SupportProjectHome
          project={supportContext.project}
          onOpenQuestions={() => setScene("support_recording_assist")}
          onOpenStories={() => setScene("support_story_pages")}
          onOpenBookBuilder={() => setScene("support_book_builder")}
          onBack={() => {
            setSupportContext(null);
            setScene("home");
          }}
        />
      )}

      {scene === "received_story_pages" && receivedContext && (
        <Scene_SupportedStoryPages
          project={receivedContext.project}
          questionSet={receivedContext.questionSet}
          storyRows={receivedContext.storyRows}
          mediaByAnswerId={receivedContext.mediaByAnswerId}
          mode="received"
          onBack={() => {
            setReceivedContext(null);
            setScene("connections_home");
          }}
        />
      )}

      {scene === "support_recording_assist" && supportContext && (
        <Scene_SupportRecordingAssist
          user={user}
          project={supportContext.project}
          questionSet={supportContext.questionSet}
          onSaved={refreshSupportedProject}
          onBack={() => setScene("support_project_home")}
        />
      )}

      {scene === "support_story_pages" && supportContext && (
        <Scene_SupportedStoryPages
          project={supportContext.project}
          questionSet={supportContext.questionSet}
          storyRows={supportContext.storyRows}
          mediaByAnswerId={supportContext.mediaByAnswerId}
          onBack={() => setScene("support_project_home")}
        />
      )}

      {scene === "support_book_builder" && supportContext && (
        <Scene_BookBuilder
          user={user}
          userName={supportContext.project.subject_name || "物語の持ち主"}
          questionSet={supportContext.questionSet}
          initialBookStories={supportContext.storyRows}
          initialBookMediaByAnswerId={supportContext.mediaByAnswerId}
          onBack={() => setScene("support_project_home")}
        />
      )}

      {scene === "book_builder" && (
        <Scene_BookBuilder
          user={user}
          userName={user?.name || "あなた"}
          questionSet={questionsDB}
          onBack={() => setScene("home")}
        />
      )}
      {scene === 0 && (
        <Scene0_Door
          onNext={() => {
            if (hasRecentMicCheck()) {
              setScene(1);
            } else {
              setScene("daily_mic_check");
            }
          }}
        />
      )}

      {scene === "daily_mic_check" && (
        <Scene_DailyMicCheck
          onComplete={() => {
            markMicCheckDone();
            setScene(1);
          }}
        />
      )}

      {scene === 1 && (
        <Scene1_MyPage
          progress={progress}
          storyProgress={getMainStoryProgress(questionsDB, progress.currentIndex)}
          question={currentQ}
          userName={user?.name || "あなた"}
          onNext={() => {
            resetVoiceData();
            setScene(3);
          }}
          onSkip={handleSkipQuestion}
          onEndToday={() => {
            setEndTodayHasSavedAnswer(false);
            setScene("end_today");
          }}
        />
      )}

      {scene === 3 && (
<Scene_Recording
  question={currentQ}
  progress={progress}
  storyProgress={getMainStoryProgress(questionsDB, progress.currentIndex)}
  userName={user?.name || "あなた"}
  autoStart
onComplete={(t, d, u, b) => {
  handleRecordComplete(t, d, u, b);
}}
/>
      )}

      {scene === 3.5 && (

<Scene3_5_VoiceCheck
  data={voiceData}
  isLifeOutline={currentQ?.onboarding_group === "life_outline"}
  isLastLifeOutline={
    currentQ?.onboarding_group === "life_outline" &&
    questionsDB[progress.currentIndex + 1]?.onboarding_group !== "life_outline"
  }
  onAddMore={() => {
    const audioPartCount = (voiceData.audioSegments || []).length;
    const totalDuration = Number(voiceData.duration || 0);

    if (
      audioPartCount >= MAX_AUDIO_PARTS_PER_QUESTION ||
      totalDuration >= MAX_RECORDING_SECONDS_PER_QUESTION
    ) {
      alert("語り足しの上限に達しました。\nここからは本文の編集で整えられます。");
      return;
    }

    setVoiceData(prev => ({
      ...prev,
      appendMode: true,
      addMoreCount: (prev.addMoreCount || 0) + 1
    }));
    setScene(3);
  }}

onRetry={() => {
  if (voiceData.editRecordingMode) {
    setVoiceData(prev => ({
      ...prev,
      duration: 0,
      transcript: "",
      audioUrl: null,
      hasAudio: false,
      audioBlob: null,
      audioSegments: [],
      editedText: "",
      aiMirror: "",
      extractedSnippet: "",
      transcriptionStatus: "idle",
      transcriptionError: "",
      polishStatus: "idle",
      polishError: "",
      transcriptClean: "",
      transcriptReadable: "",
      transcriptEssay: "",
      storagePath: null,
      storagePaths: prev.editRecordingMode === "append" ? prev.existingAudioPaths : []
    }));
    setScene(3);
    return;
  }

  resetVoiceData();
  setScene(3);
}}

  onRetryTranscription={() => {
    handleTranscribeForReview(voiceData);
  }}
  onSelectStyle={(style) => {
    setVoiceData(prev => {
      const next = {
        ...prev,
        selectedStyle: style
      };

      return {
        ...next,
        editedText: pickTranscriptByStyle(next, style)
      };
    });
  }}
  onUpdateText={(style, text) => {
    setVoiceData(prev => {
      const next = {
        ...prev,
        selectedStyle: style,
        editedText: text
      };

      if (style === "clean") {
        next.transcriptClean = text;
      } else if (style === "essay") {
        next.transcriptEssay = text;
      } else {
        next.transcriptReadable = text;
      }

      return next;
    });
  }}
  onProceed={() => {
    if (currentQ?.onboarding_group === "life_outline") {
      handleSaveAnswer("人生の輪郭");
      return;
    }

    setScene(4);
  }}
/>

      )}


      {scene === 4 && (
        <Scene4_AIMirror
          data={voiceData}
          onEditedTextChange={handleEditedTextChange}
          onPhotoStoryTitleChange={title => setVoiceData(prev => ({ ...prev, photoStoryTitle: title, photoStoryTitleSource: "user" }))}
          onPhotoStoryCaptionChange={caption => setVoiceData(prev => ({ ...prev, photoStoryCaption: caption }))}
          onAddPhotos={handlePhotoSelect}
          onRemovePhoto={handleRemovePhoto}
          onNext={() => handleSaveAnswer(null)}
        />
      )}

{scene === "beta_survey_prompt" && (
  <Scene_BetaSurveyPrompt
    survey={pendingBetaSurvey}
    onOpenSurvey={() => {
      if (pendingBetaSurvey?.url) {
        window.open(pendingBetaSurvey.url, "_blank", "noopener,noreferrer");
      }

      if (pendingBetaSurvey?.seenKey) {
        localStorage.setItem(pendingBetaSurvey.seenKey, "1");
      }
    }}
    onContinue={() => {
      if (pendingBetaSurvey?.seenKey) {
        localStorage.setItem(pendingBetaSurvey.seenKey, "1");
      }

      setPendingBetaSurvey(null);
      setScene(pendingBetaSurvey?.returnScene || 6);
    }}
  />
)}

{scene === 6 && (
  <Scene6_Completion
    onTalkMore={() => {
      resetVoiceData();
      setScene(1);
    }}
    onHome={() => setScene("home")}
    onEndToday={() => {
      setEndTodayHasSavedAnswer(true);
      setScene("end_today");
    }}
  />
)}
      {scene === "token_completion" && (
        <Scene_TokenCompletion
          onLogin={() => setScene(-1)}
        />
      )}

      {scene === "end_today" && (
        <Scene_EndToday
          notificationPref={notificationPref}
          hasSavedAnswer={endTodayHasSavedAnswer}
          onOpenStoryPages={() => setScene("story_pages")}
          onResume={() => setScene(1)}
        />
      )}

      {scene === "story_pages" && (

<Scene_StoryPages
  user={user}
  foundation={foundation}
  questionSet={questionsDB}
  onOpenLifeOutline={() => {
    setLifeOutlineStatus("idle");
    setLifeOutlineReturnScene("story_pages");
    setScene("life_outline_summary");
  }}
  onTalkMore={() => {
    resetVoiceData();
    setScene(1);
  }}
  onEditRecord={startEditRecording}
  onBack={() => setScene("home")}
/>

      )}
    </div>
  );
}

function StoryThemeToggle({ label, value, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
        value
          ? "bg-white/10 border-white/15 text-white"
          : "bg-black/25 border-white/5 text-white/38 opacity-75"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-sm shrink-0 ${
            value
              ? "bg-white/20 text-white"
              : "bg-white/5 text-white/30"
          }`}
        >
          {value ? "✓" : ""}
        </div>

        <p className="text-[0.95rem] leading-loose">
          {label}
        </p>
      </div>
    </button>
  );
}

function Scene_TokenAuthRequired({ token, tokenData, onAuthenticated, onInvalid }) {
  const [step, setStep] = useState("ready");
  const [pin, setPin] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    try {
      setLoading(true);

      const result = await startTokenAuthOnServer(token);

      setMaskedEmail(result.maskedEmail || "");
      setStep("pin");
    } catch (e) {
      console.error("token auth send error", e);

      const message =
        e instanceof Error
          ? e.message
          : String(e || "unknown error");

      if (
        message.includes("otp_rate_limited") ||
        message.includes("送信回数")
      ) {
        setStep("pin");

        alert(
          "認証コードの送信回数が短時間で多くなっています。\n\nすでに届いている最新の認証コードを入力してください。届いていない場合は、少し時間を置いてから再送してください。"
        );
        return;
      }

      alert(`認証コードを送信できませんでした。\n${message}`);
    } finally {
      setLoading(false);
    }
  };



  const verifyCode = async () => {
    try {
      setLoading(true);

      const result = await verifyTokenAuthOnServer({
        token,
        pin
      });

      const session = result.session;

      await supabaseClient.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token
      });

      onAuthenticated();
    } catch (e) {
      console.error("token auth verify error", e);

      const message =
        e instanceof Error
          ? e.message
          : String(e || "unknown error");

      alert(`認証コードが正しくありません。\n${message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!token || !tokenData?.user_id) {
    return (
      <Scene_TokenInvalid onBack={onInvalid} />
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-6 text-center">
      <div className="space-y-7 mb-12 text-narrative">
        <p className="text-white/90 text-[1.08rem]">
          物語の続きを開きます
        </p>

        <p className="text-white/62 text-[0.96rem] leading-loose">
          ご本人確認のため、<br />
          登録済みのメールアドレスに<br />
          認証コードをお送りします。
        </p>

        {maskedEmail && (
          <p className="text-white/42 text-sm leading-loose">
            送信先：{maskedEmail}
          </p>
        )}
      </div>

      {step === "ready" ? (
        <button
          type="button"
          onClick={sendCode}
          disabled={loading}
          className={`btn-quiet bg-white/10 w-full max-w-[280px] py-4 rounded-full text-white ${
            loading ? "opacity-40" : ""
          }`}
        >
          {loading ? "送信中..." : "認証コードを送る"}
        </button>
      ) : (
        <div className="w-full max-w-[280px] space-y-6">
          <input
            type="text"
            className="quiet-input tracking-widest text-xl text-center"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="000000"
            maxLength="6"
          />

          <button
            type="button"
            onClick={verifyCode}
            disabled={pin.length !== 6 || loading}
            className={`btn-quiet bg-white/10 w-full py-4 rounded-full text-white ${
              pin.length !== 6 || loading ? "opacity-40" : ""
            }`}
          >
            {loading ? "確認中..." : "続きを開く"}
          </button>

          <button
            type="button"
            onClick={sendCode}
            disabled={loading}
            className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
          >
            認証コードを再送する
          </button>
        </div>
      )}
    </div>
  );
}

function Scene_TokenInvalid({ onBack }) {
  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-6 text-center">
      <div className="space-y-7 mb-12 text-narrative">
        <p className="text-white/90 text-[1.08rem]">
          このリンクは開けませんでした
        </p>

        <p className="text-white/62 text-[0.96rem] leading-loose">
          期限切れ、または無効なリンクの可能性があります。<br />
          ログインして、物語の続きを開いてください。
        </p>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="btn-quiet bg-white/10 w-full max-w-[280px] py-4 rounded-full text-white"
      >
        ログイン画面へ
      </button>
    </div>
  );
}


function Scene_Login({ onLogin }) {
  const supporterInvitationUrl = getSupporterInvitationUrlFromCurrentLocation();
  const authReturnUrl = getAuthReturnUrlFromCurrentLocation();
  const isSupporterInviteLogin = Boolean(supporterInvitationUrl);
  const isTrialEntry = getEntryModeFromUrl() === "trial";
  const [mode, setMode] = useState(
    isSupporterInviteLogin ? "supporter" : "entry"
  ); // entry | new | returning | supporter | pin
  const [authMode, setAuthMode] = useState(null); // new | returning | supporter
  const [email, setEmail] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [givenName, setGivenName] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

const checkExistingProfileByEmail = async (targetEmail) => {
  const normalizedEmail = String(targetEmail || "").trim().toLowerCase();

  if (!normalizedEmail) return false;

  const { data, error } = await supabaseClient.functions.invoke("check-existing-email", {
    body: {
      email: normalizedEmail
    }
  });

  if (error) {
    console.warn("existing profile email check function failed", error);
    return null;
  }

  return Boolean(data?.exists);
};

  const handleDevLogin = async () => {
    if (!isDevMode()) return;

    if (!DEV_LOGIN_EMAIL || !DEV_LOGIN_PASSWORD) {
      alert("開発用ログインのメールアドレスとパスワードを環境変数で設定してください。");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: DEV_LOGIN_EMAIL,
        password: DEV_LOGIN_PASSWORD
      });

      if (error) {
        console.error("dev login error", error);
        alert("開発用ログインに失敗しました。");
        return;
      }

      const {
        data: { session },
        error: sessionError
      } = await supabaseClient.auth.getSession();

      if (sessionError || !session) {
        console.error("dev session error", sessionError);
        alert("ログイン情報の取得に失敗しました。");
        return;
      }

      const profile = await ensureProfileExists(session.user, {
        email: session.user.email
      });

      onLogin({
        id: session.user.id,
        ...profile,
        email: session.user.email || profile?.email || "",
        name: profile?.display_name || profile?.name || "あなた",
        family_name: profile?.family_name || "開発",
        given_name: profile?.given_name || "太郎",
        display_name: profile?.display_name || profile?.name || "開発 太郎",
        preferred_name: profile?.preferred_name || "太郎さん"
      });
    } catch (e) {
      console.error("dev login unexpected error", e);
      alert("開発用ログインでエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  const handleSendPin = async (targetMode = mode) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const isNewMode = targetMode === "new";
    const isSupporterMode = targetMode === "supporter";
    const isReturningMode = targetMode === "returning" || isSupporterMode;

    if (!normalizedEmail) {
      alert("メールアドレスを入力してください。");
      return;
    }

    if (isNewMode && (!familyName.trim() || !givenName.trim())) {
      alert("お名前を入力してください。");
      return;
    }

    setLoading(true);

if (isNewMode) {
  const exists = await checkExistingProfileByEmail(normalizedEmail);

  if (exists === null) {
    setLoading(false);
    alert("メールアドレスの確認ができませんでした。少し時間をおいてから、もう一度お試しください。");
    return;
  }

  if (exists === true) {
    setLoading(false);
    setEmail(normalizedEmail);
    setMode("returning");
    alert("このメールアドレスは、すでに登録されています。前回の続きを開くからお進みください。");
    return;
  }
}

    const { error } = await supabaseClient.auth.signInWithOtp({
      email: normalizedEmail,
      options: isNewMode
        ? {
            emailRedirectTo: authReturnUrl,
            data: {
              family_name: familyName.trim(),
              given_name: givenName.trim(),
              display_name: `${familyName.trim()} ${givenName.trim()}`.trim(),
              preferred_name: `${givenName.trim()}さん`
            }
          }
        : isReturningMode
          ? {
            shouldCreateUser: false,
            emailRedirectTo:
              isSupporterMode && supporterInvitationUrl
                ? supporterInvitationUrl
                : authReturnUrl
            }
          : undefined
    });

    setLoading(false);

    if (error) {
      console.error(error);

      const message = String(error?.message || "").toLowerCase();

      if (
        error?.status === 429 ||
        message.includes("rate limit") ||
        message.includes("email rate limit")
      ) {
        alert("認証メールの送信回数が一時的に上限に達しました。少し時間をおいてから、もう一度お試しください。");
        return;
      }

      if (
        isReturningMode &&
        (
          message.includes("not found") ||
          message.includes("signup") ||
          message.includes("signups")
        )
      ) {
        alert("このメールアドレスの登録が見つかりませんでした。はじめて利用する方は、そちらからお進みください。");
        setMode("entry");
        return;
      }

      alert("認証メールを送れませんでした。メールアドレスをご確認のうえ、もう一度お試しください。");
      return;
    }

    setEmail(normalizedEmail);
    setAuthMode(targetMode);
    setPin("");
    setMode("pin");
  };

  const handleUseSupporterCode = () => {
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      alert("メールアドレスを入力してください。");
      return;
    }

    setEmail(normalizedEmail);
    setAuthMode("supporter");
    setPin("");
    setMode("pin");
  };

  const handleVerifyPin = async () => {
    const normalizedEmail = String(email || "").trim().toLowerCase();

    setLoading(true);

    const { data, error } = await supabaseClient.auth.verifyOtp({
      email: normalizedEmail,
      token: pin,
      type: "email"
    });

    if (error) {
      setLoading(false);
      console.error(error);
      alert("コードが正しくありません。");
      return;
    }

    const {
      data: { session },
      error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError || !session) {
      setLoading(false);
      console.error("session error", sessionError);
      alert("ログイン情報の取得に失敗しました。もう一度お試しください。");
      return;
    }

    const userId = session.user.id;
    const fullName = `${familyName} ${givenName}`.trim();
    const preferredName = givenName ? `${givenName}さん` : fullName || "あなた";

    const registrationData =
      authMode === "new"
        ? {
            email: normalizedEmail,
            familyName,
            givenName,
            fullName,
            preferredName
          }
        : {
            email: normalizedEmail
          };

    let profile;

    try {
      profile = await ensureProfileExists(session.user, registrationData);
    } catch (e) {
      setLoading(false);
      console.error(e);
      alert("プロフィールの保存に失敗しました。");
      return;
    }

    setLoading(false);

    setTimeout(() => {
      onLogin({
        id: userId,
        ...profile,
        email: session.user.email || normalizedEmail,
        name: profile?.display_name || profile?.name || fullName || "あなた",
        family_name: profile?.family_name || (authMode === "new" ? familyName : null),
        given_name: profile?.given_name || (authMode === "new" ? givenName : null),
        display_name: profile?.display_name || profile?.name || fullName || "あなた",
        preferred_name: profile?.preferred_name || (authMode === "new" ? preferredName : "あなた")
      });
    }, 100);
  };

  const goEntry = () => {
    setMode(isSupporterInviteLogin ? "supporter" : "entry");
    setAuthMode(null);
    setPin("");
  };

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-4 text-center overflow-y-auto">
      {mode === "supporter" && (
        <div className="w-full max-w-[320px] space-y-8 py-10 fade-enter">
          <div className="space-y-5 text-narrative">
            <p className="text-white/40 text-xs tracking-[0.18em]">
              お手伝いの依頼
            </p>

            <p className="text-[1.1rem] text-white/90 leading-loose">
              お手伝いの依頼を開く
            </p>

            <p className="ui-small leading-loose">
              メールを受け取ったアドレスと、<br />
              メールに記載された認証コードを使います。
            </p>
          </div>

          <div>
            <p className="ui-label mb-2">メールアドレス</p>
            <input
              type="email"
              className="quiet-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={handleUseSupporterCode}
              disabled={!email || loading}
              className={`btn-quiet w-full py-4 rounded-full text-sm ${
                !email || loading ? "opacity-40" : ""
              }`}
            >
              認証コードを入力する
            </button>

            <button
              type="button"
              onClick={() => handleSendPin("supporter")}
              disabled={!email || loading}
              className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
            >
              {loading ? "送信中..." : "認証メールを送り直す"}
            </button>
          </div>
        </div>
      )}

      {mode === "entry" && (
        <div className="w-full max-w-[320px] space-y-8 py-10">
          <div className="space-y-5 text-narrative">
            {isTrialEntry ? (
              <>
                <p className="text-white/40 text-xs tracking-[0.18em]">
                  無料体験・3つの問い
                </p>

                <p className="text-[1.1rem] text-white/90 leading-loose">
                  まず、3つの問いを<br />
                  試してみませんか
                </p>

                <p className="text-white/55 text-[0.95rem] leading-loose">
                  声で答えながら、物語づくりを体験できます。<br />
                  料金はかかりません。語った内容は、<br />
                  購入後もそのまま引き継がれます。
                </p>
              </>
            ) : (
              <>
                <p className="text-[1.1rem] text-white/90">
                  この物語を開くために
                </p>

                <p className="text-white/55 text-[0.95rem] leading-loose">
                  はじめて利用する方は、お名前とメールアドレスを登録します。<br />
                  以前に利用した方は、メールアドレスで前回の続きが開けます。
                </p>
              </>
            )}
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setMode("new")}
              disabled={loading}
              className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
            >
              {isTrialEntry ? "無料体験をはじめる" : "はじめて利用する"}
            </button>

            <button
              type="button"
              onClick={() => setMode("returning")}
              disabled={loading}
              className="w-full py-4 rounded-full border border-white/10 text-white/65 text-sm"
            >
              {isTrialEntry ? "体験の続きを開く" : "前回の続きを開く"}
            </button>

            {isDevMode() && (
              <button
                type="button"
                onClick={handleDevLogin}
                disabled={loading}
                className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
              >
                開発用ログイン
              </button>
            )}
          </div>
        </div>
      )}

      {mode === "new" && (
        <div className="w-full max-w-[320px] space-y-8 py-10 fade-enter">
          <div className="space-y-4 text-narrative">
            <p className="text-[1.1rem] text-white/90">
              {isTrialEntry ? "無料体験をはじめる" : "はじめて利用する"}
            </p>

            <p className="ui-small">
              お名前とメールアドレスを教えてください。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="ui-label mb-2">姓</p>
              <input
                type="text"
                className="quiet-input"
                value={familyName}
                onChange={e => setFamilyName(e.target.value)}
              />
            </div>

            <div>
              <p className="ui-label mb-2">名</p>
              <input
                type="text"
                className="quiet-input"
                value={givenName}
                onChange={e => setGivenName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <p className="ui-label mb-2">メールアドレス</p>
            <input
              type="email"
              className="quiet-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={() => handleSendPin("new")}
            disabled={!email || !familyName || !givenName || loading}
            className={`btn-quiet w-full py-4 rounded-full text-sm ${
              !email || !familyName || !givenName || loading ? "opacity-40" : ""
            }`}
          >
            {loading ? "送信中..." : "ログイン用メールを送る"}
          </button>

          <button
            type="button"
            onClick={goEntry}
            disabled={loading}
            className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
          >
            戻る
          </button>
        </div>
      )}

      {mode === "returning" && (
        <div className="w-full max-w-[320px] space-y-8 py-10 fade-enter">
          <div className="space-y-4 text-narrative">
            <p className="text-[1.1rem] text-white/90">
              {isTrialEntry ? "体験の続きを開く" : "前回の続きを開く"}
            </p>

            <p className="ui-small">
              登録したメールアドレスを入力してください。<br />
              同じメールアドレスで、前回の続きが開きます。
            </p>
          </div>

          <div>
            <p className="ui-label mb-2">メールアドレス</p>
            <input
              type="email"
              className="quiet-input"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={() => handleSendPin("returning")}
            disabled={!email || loading}
            className={`btn-quiet w-full py-4 rounded-full text-sm ${
              !email || loading ? "opacity-40" : ""
            }`}
          >
            {loading ? "送信中..." : "ログイン用メールを送る"}
          </button>

          <button
            type="button"
            onClick={goEntry}
            disabled={loading}
            className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
          >
            戻る
          </button>
        </div>
      )}

      {mode === "pin" && (
        <div className="w-full max-w-[280px] space-y-8 py-10 fade-enter">
          <div className="space-y-4 text-narrative">
            <p className="text-[1.1rem] text-white/90">
              認証コードを入力
            </p>

            <p className="ui-small">
              {authMode === "supporter"
                ? "お手伝いの依頼メールに記載された6桁コードを入力してください"
                : "メールのボタンを押すか、記載された6桁コードを入力してください"}
            </p>
          </div>

          <input
            type="text"
            className="quiet-input tracking-widest text-xl"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="000000"
            maxLength="6"
          />

          <button
            type="button"
            onClick={handleVerifyPin}
            disabled={pin.length !== 6 || loading}
            className={`btn-quiet w-full py-4 rounded-full text-sm ${
              pin.length !== 6 || loading ? "opacity-40" : ""
            }`}
          >
            {loading
              ? "確認中..."
              : authMode === "supporter"
                ? "依頼を確認する"
                : authMode === "returning"
                  ? isTrialEntry
                    ? "体験の続きを開く"
                    : "続きを開く"
                  : isTrialEntry
                    ? "無料体験をはじめる"
                    : "物語をはじめる"}
          </button>

          <button
            type="button"
            onClick={() =>
              setMode(
                authMode === "supporter"
                  ? "supporter"
                  : authMode === "returning"
                    ? "returning"
                    : "new"
              )
            }
            disabled={loading}
            className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
          >
            メールアドレスを修正する
          </button>

          {isDevMode() && (
            <button
              type="button"
              onClick={handleDevLogin}
              disabled={loading}
              className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
            >
              開発用ログイン
            </button>
          )}
        </div>
      )}
    </div>
  );
}


function Scene_PurchaseStart({
  checkoutWasCancelled,
  status,
  error,
  onPurchase,
  onTryFree
}) {
  const isWorking = status === "starting" || status === "checking";

  return (
    <div className="h-full overflow-y-auto fade-enter px-6 py-12 text-center">
      <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col justify-center">
        <p className="mb-5 text-[0.72rem] tracking-[0.3em] text-white/32">
          縦糸横糸ブック
        </p>
        <h1 className="text-narrative text-[1.55rem] leading-[1.9] text-white/92">
          声でたどる時間を、<br />
          一冊の物語へ
        </h1>

        <p className="mx-auto mt-7 max-w-[340px] text-[0.92rem] leading-[2] text-white/52">
          届いた問いに、ご自身のペースで語ります。<br />
          声と文章、写真を整え、本に仕上げます。
        </p>

        <div className="my-9 border-y border-white/10 py-7">
          <p className="text-[0.76rem] tracking-[0.18em] text-white/36">一冊</p>
          <p className="mt-2 text-[1.55rem] tracking-[0.08em] text-white/90">
            49,800円
          </p>
          <p className="mt-1 text-xs text-white/30">税込</p>
        </div>

        {checkoutWasCancelled && !error && (
          <p className="mb-5 text-sm leading-relaxed text-white/48">
            購入は確定していません。ここからいつでも再開できます。
          </p>
        )}

        {error && (
          <p className="mb-5 rounded-2xl border border-red-200/15 bg-red-200/[0.05] px-5 py-4 text-sm leading-relaxed text-red-100/75">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onPurchase}
          disabled={isWorking}
          className="btn-quiet w-full rounded-full bg-white py-4 text-slate-900 disabled:opacity-45"
        >
          {isWorking ? "購入画面を準備しています…" : "購入してはじめる"}
        </button>

        <button
          type="button"
          onClick={onTryFree}
          disabled={isWorking}
          className="mt-4 w-full rounded-full border border-white/12 py-4 text-white/72 disabled:opacity-45"
        >
          まず3つの問いを試す
        </button>

        <p className="mt-5 text-xs leading-relaxed text-white/28">
          お試しに料金はかかりません。<br />
          録音と文章は、購入後もそのまま引き継がれます。
        </p>
      </div>
    </div>
  );
}

function Scene_TrialComplete({ status, error, onPurchase, onFinish }) {
  const isWorking = status === "starting" || status === "checking";

  return (
    <div className="h-full overflow-y-auto fade-enter px-6 py-12 text-center">
      <div className="mx-auto flex min-h-full w-full max-w-[440px] flex-col justify-center">
        <p className="text-[0.72rem] tracking-[0.3em] text-amber-100/42">
          3つの問いを終えました
        </p>
        <h1 className="text-narrative mt-6 text-[1.55rem] leading-[1.9] text-white/92">
          声にした時間が、<br />
          物語のはじまりになりました
        </h1>

        <div className="mx-auto my-9 h-px w-14 bg-amber-100/25" />

        <p className="mx-auto max-w-[350px] text-[0.94rem] leading-[2.1] text-white/56">
          続きでは、幼少期から今までを少しずつたどります。<br />
          語った声は文章になり、写真とともに一冊へ育っていきます。
        </p>

        <div className="my-8 rounded-[1.7rem] border border-white/10 bg-white/[0.025] px-6 py-5">
          <p className="text-xs tracking-[0.16em] text-white/34">縦糸横糸ブック　一冊</p>
          <p className="mt-2 text-[1.4rem] tracking-[0.06em] text-white/86">
            49,800円 <span className="text-xs text-white/34">税込</span>
          </p>
        </div>

        {error && (
          <p className="mb-5 rounded-2xl border border-red-200/15 bg-red-200/[0.05] px-5 py-4 text-sm leading-relaxed text-red-100/75">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onPurchase}
          disabled={isWorking}
          className="btn-quiet w-full rounded-full bg-white py-4 text-slate-900 disabled:opacity-45"
        >
          {isWorking ? "購入画面を準備しています…" : "この物語を続ける"}
        </button>

        <button
          type="button"
          onClick={onFinish}
          disabled={isWorking}
          className="mt-5 text-sm text-white/38 underline decoration-white/18 underline-offset-8 disabled:opacity-45"
        >
          今日はここまで
        </button>

        <p className="mt-5 text-xs leading-relaxed text-white/26">
          ここまでの録音と文章は保存されています。
        </p>
      </div>
    </div>
  );
}

function Scene_PurchaseSuccess({ hasTrial, onContinue }) {
  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-6 text-center">
      <p className="text-[0.72rem] tracking-[0.3em] text-amber-100/42">
        お手続きが完了しました
      </p>
      <h1 className="text-narrative mt-7 text-[1.55rem] leading-[1.9] text-white/92">
        あなたの物語づくりが、<br />
        ここから始まります
      </h1>
      <p className="mt-7 text-[0.92rem] leading-[2] text-white/50">
        {hasTrial
          ? "お試しで残した声も、そのまま続きにつながっています。"
          : "問いに答えながら、声と文章を少しずつ重ねていきます。"}
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="btn-quiet mt-12 w-full max-w-[300px] rounded-full bg-white py-4 text-slate-900"
      >
        続きをはじめる
      </button>
    </div>
  );
}

function Scene_BetaIntro({ onNext }) {
  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-6 text-center">
      <div className="space-y-7 mb-12 text-narrative">
        <p className="text-white/90 text-[1.08rem]">
          β版先行体験へようこそ
        </p>

        <p className="text-white/62 text-[0.96rem] leading-loose">
          このβ版では、いくつかの問いに答えながら、<br />
          人生を少し振り返り、語った言葉が<br />
          文章として形になっていく体験をしていただきます。
        </p>

        <p className="text-white/52 text-[0.94rem] leading-loose">
          β版では、書籍の完成・製本までは行いません。<br />
          ただし、ここで語っていただいた内容は、<br />
          正式リリース版へ進む際に引き継ぐことができます。
        </p>

        <p className="text-white/45 text-[0.92rem] leading-loose">
          体験の途中で、短いアンケートへの<br />
          ご協力をお願いする場面があります。
        </p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="btn-quiet bg-white/10 w-full max-w-[280px] py-4 rounded-full text-white"
      >
        理解してはじめる
      </button>
    </div>
  );
}

function OnboardingProgress({ current = "entry", outlineComplete = false }) {
  const steps = [
    { key: "registered", label: "登録" },
    { key: "entry", label: "入口" },
    { key: "outline", label: "輪郭" },
    { key: "weekly", label: "毎週" }
  ];
  const activeIndex = steps.findIndex(step => step.key === current);

  return (
    <>
      <div className="h-[54px] shrink-0" aria-hidden="true" />
      <div
        className="fixed top-0 left-1/2 z-40 w-full max-w-[600px] -translate-x-1/2 bg-[#0f172a]/95 px-6 pb-2 pt-[calc(env(safe-area-inset-top)+0.55rem)] backdrop-blur-md"
        aria-label="初回体験の進み具合"
      >
      <div className="flex items-start opacity-75">
        {steps.map((step, index) => {
          const completed = outlineComplete
            ? index <= 2
            : index < activeIndex;
          const active = !outlineComplete && index === activeIndex;

          return (
            <React.Fragment key={step.key}>
              <div className="w-10 shrink-0 flex flex-col items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center text-[0.54rem] ${
                    completed
                      ? "bg-white/45 border-white/45 text-slate-900"
                      : active
                        ? "bg-amber-200/10 border-amber-100/45 text-amber-50"
                        : "border-white/10 text-white/18"
                  }`}
                >
                  {completed ? "✓" : active ? "●" : ""}
                </div>
                <span className={`text-[0.56rem] tracking-wider ${
                  completed || active ? "text-white/45" : "text-white/18"
                }`}>
                  {step.label}
                </span>
              </div>

              {index < steps.length - 1 && (
                <div className={`mt-2.5 h-px flex-1 ${
                  outlineComplete
                    ? index < 2 ? "bg-white/25" : "bg-white/[0.07]"
                    : index < activeIndex ? "bg-white/25" : "bg-white/[0.07]"
                }`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      </div>
    </>
  );
}

function Scene_OnboardingOverview({ onNext }) {
  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8">
      <OnboardingProgress current="entry" />
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-center mb-10">
          <p className="text-white/38 text-xs tracking-[0.22em] mb-4">
            縦糸横糸の進め方
          </p>

          <p className="text-white/90 text-[1.12rem] leading-loose text-narrative">
            声で語りながら、<br />
            あなたの物語を重ねていきます
          </p>
        </div>

        <div className="space-y-4">
          <div className="glass-card p-5 flex items-center gap-5">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-lg shrink-0">
              1
            </div>

            <div className="text-left">
              <p className="text-white/82 text-[1rem] text-narrative mb-1">
                初回の語り
              </p>

              <p className="text-white/48 text-sm leading-loose">
                目安 10〜15分<br />
                4つの問いから、人生の輪郭をまとめます
              </p>
            </div>
          </div>

          <div className="flex justify-center text-white/20 text-xl">
            ↓
          </div>

          <div className="glass-card p-5 flex items-center gap-5">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-lg shrink-0">
              2
            </div>

            <div className="text-left">
              <p className="text-white/82 text-[1rem] text-narrative mb-1">
                その後は毎週
              </p>

              <p className="text-white/48 text-sm leading-loose">
                届いた問いに、ご自身のペースで語ります
              </p>
            </div>
          </div>

          <div className="flex justify-center text-white/20 text-xl">
            ↓
          </div>

          <div className="glass-card p-5 flex items-center gap-5">
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white/70 text-lg shrink-0">
              3
            </div>

            <div className="text-left">
              <p className="text-white/82 text-[1rem] text-narrative mb-1">
                一冊の物語へ
              </p>

              <p className="text-white/48 text-sm leading-loose">
                声と文章で、家族に残る物語になります
              </p>
            </div>
          </div>
        </div>

        <p className="mt-9 text-center text-white/42 text-sm leading-loose">
          毎週の問いは全部で23問あります
        </p>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
      >
        進め方を見る
      </button>
    </div>
  );
}


function Scene_OnboardingPace({ onNext }) {
  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8">
      <OnboardingProgress current="entry" />
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-center mb-9">
          <p className="text-white/90 text-[1.1rem] text-narrative">
            ご自身のペースで進められます
          </p>
        </div>

        <div className="glass-card p-5 space-y-5 mb-6">
          {[
            "毎週、新しい問いが届きます",
            "答えにくい問いは、飛ばして大丈夫です",
            "あとから語り直したり、問いを加えたりできます"
          ].map(item => (
            <div key={item} className="flex gap-4 items-start">
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/65 shrink-0 mt-0.5">
                ✓
              </div>

              <p className="text-white/68 text-[0.94rem] leading-loose text-left">
                {item}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-7">
          <div className="glass-card p-5 text-center">
            <p className="text-white/38 text-xs tracking-widest mb-3">
              ゆっくり
            </p>

            <p className="text-white/80 text-[1rem] mb-2">
              週に2問
            </p>

            <p className="text-white/48 text-sm">
              約3か月
            </p>
          </div>

          <div className="glass-card p-5 text-center">
            <p className="text-white/38 text-xs tracking-widest mb-3">
              しっかり
            </p>

            <p className="text-white/80 text-[1rem] mb-2">
              週に6問
            </p>

            <p className="text-white/48 text-sm">
              約1か月
            </p>
          </div>
        </div>

        <div className="text-center space-y-3">
          <p className="text-white/62 text-[0.94rem] text-narrative">
            問いが届くまでの時間も、物語の一部です
          </p>

          <div className="flex justify-center gap-5 text-white/42 text-xs">
            <span>▧ 昔の写真</span>
            <span>♪ 好きだった音楽</span>
            <span>✦ ふと思い出す</span>
          </div>

          <p className="text-white/38 text-xs leading-loose">
            記憶がよみがえる瞬間も、楽しんでみてください
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
      >
        人生の輪郭を始める
      </button>
    </div>
  );
}

function Scene_LifeOutlineSummary({
  data,
  status,
  error,
  isRevisit = false,
  onRetry,
  onUseDraft,
  onSelectStyle,
  onUpdateText,
  onAddMore,
  onRetakeAnswer,
  onFinish
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const audioRefs = useRef(new Map());

  const isBusy = status === "loading" || status === "generating";
  const selectedStyle = data?.selectedStyle || "readable";
  const displayText =
    data?.selectedText ||
    (
      selectedStyle === "essay"
        ? data?.transcriptEssay
        : data?.transcriptReadable
    ) ||
    "";

  const hasReachedAdditionLimit =
    (data?.additionCount || 0) >= MAX_LIFE_OUTLINE_ADDITIONS;

  useEffect(() => {
    setIsEditing(false);
    setDraftText("");
  }, [data?.id, selectedStyle]);

  useEffect(() => {
    return () => {
      for (const audio of audioRefs.current.values()) {
        audio?.pause();
      }
    };
  }, []);

  const startEditing = () => {
    setDraftText(displayText);
    setIsEditing(true);
  };

  const saveEdit = () => {
    const nextText = String(draftText || "").trim();

    if (!nextText) {
      alert("文章が空になっています。");
      return;
    }

    onUpdateText?.(selectedStyle, nextText);
    setIsEditing(false);
    setDraftText("");
  };

  const toggleAudio = async (audioId) => {
    const target = audioRefs.current.get(audioId);
    if (!target) return;

    for (const [id, audio] of audioRefs.current.entries()) {
      if (id !== audioId && audio && !audio.paused) {
        audio.pause();
        audio.currentTime = 0;
      }
    }

    if (!target.paused) {
      target.pause();
      setPlayingAudioId(null);
      return;
    }

    try {
      await target.play();
      setPlayingAudioId(audioId);
    } catch (playError) {
      console.warn("life outline audio play failed", playError);
      setPlayingAudioId(null);
    }
  };

  const formatDuration = (seconds) => {
    const total = Math.max(0, Math.round(Number(seconds || 0)));
    const minutes = Math.floor(total / 60);
    const remaining = String(total % 60).padStart(2, "0");
    return `${minutes}:${remaining}`;
  };

  const getAnswerAudioItems = answerId =>
    (data?.audioItems || []).filter(
      item => item.source === "answer" && item.answerId === answerId
    );

  const additionalAudioItems = (data?.audioItems || []).filter(
    item => item.source === "addition"
  );

  const renderAudioButton = (item, label = "録音") => {
    const audioId = item.id || item.storagePath;
    const isPlaying = playingAudioId === audioId;

    return (
      <React.Fragment key={audioId}>
        <audio
          ref={node => {
            if (node) {
              audioRefs.current.set(audioId, node);
            } else {
              audioRefs.current.delete(audioId);
            }
          }}
          src={item.url}
          className="hidden"
          onEnded={() => setPlayingAudioId(null)}
        />
        <button
          type="button"
          onClick={() => toggleAudio(audioId)}
          className={`h-8 min-w-8 px-2 rounded-full border flex items-center justify-center gap-1.5 transition ${
            isPlaying
              ? "border-white/28 bg-white/[0.1] text-white/70"
              : "border-white/[0.08] text-white/38"
          }`}
          aria-label={isPlaying ? `${label}の再生を止める` : `${label}を再生する`}
        >
          <span className="text-[0.65rem]" aria-hidden="true">
            {isPlaying ? "Ⅱ" : "▶"}
          </span>
          {item.duration > 0 && (
            <span className="text-[0.62rem] tabular-nums">
              {formatDuration(item.duration)}
            </span>
          )}
        </button>
      </React.Fragment>
    );
  };

  return (
    <div className="h-full flex flex-col fade-enter px-4 pt-3 pb-8 overflow-hidden">
      {!isRevisit && <OnboardingProgress current="outline" />}

      <div className="text-center mb-6">
        <p className="text-white/38 text-xs tracking-[0.22em] mb-3">
          人生の輪郭
        </p>

        <h1 className="text-white/90 text-[1.15rem] text-narrative">
          {isRevisit
            ? "私の歩み"
            : "人生の輪郭がまとまりました"}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {isBusy && (
          <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center">
            <div className="w-5 h-5 rounded-full border-2 border-white/15 border-t-white/65 animate-spin mb-6"></div>
            <p className="text-white/58 text-sm tracking-widest">
              {status === "generating"
                ? "語りを、ひとつの文章にまとめています"
                : "私の歩みを読み込んでいます"}
            </p>
          </div>
        )}

        {!isBusy && status === "error" && (
          <div className="glass-card p-6 text-center">
            <p className="text-white/72 text-sm leading-loose mb-3">
              うまくまとめられませんでした
            </p>

            <p className="text-white/42 text-xs leading-loose mb-6">
              {error || "通信を確認して、もう一度お試しください。"}
            </p>

            {(data?.sourceAnswers || []).length > 0 && (
              <div className="mb-6 rounded-2xl border border-white/[0.07] px-4 text-left">
                {(data.sourceAnswers || []).map((answer, index) => (
                  <div
                    key={answer.id}
                    className={`py-4 ${
                      index > 0 ? "border-t border-white/[0.07]" : ""
                    }`}
                  >
                    <p className="text-white/55 text-xs leading-relaxed mb-3">
                      {answer.questionText}
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-white/28 text-[0.68rem]">
                        {String(answer.selectedText || "").trim().length > 20
                          ? "語りがあります"
                          : "短い、または不鮮明な可能性があります"}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRetakeAnswer?.(answer)}
                        className="shrink-0 text-white/48 text-xs underline underline-offset-4"
                      >
                        語り直す
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {String(data?.transcriptReadable || "").trim() && (
                <button
                  type="button"
                  onClick={onUseDraft}
                  className="btn-quiet bg-white/10 w-full py-3 rounded-full text-white text-sm"
                >
                  今ある内容で仮の輪郭を作る
                </button>
              )}

              <button
                type="button"
                onClick={onRetry}
                className="w-full py-3 text-white/42 text-sm underline underline-offset-4"
              >
                生成だけ、もう一度試す
              </button>
            </div>
          </div>
        )}

        {!isBusy && data && status !== "error" && (
          <>
            <div className="glass-card p-5 mb-5">
              <p className="text-white/38 text-xs tracking-widest mb-5">
                私の歩み
              </p>

              <div className="flex gap-3 mb-6">
                <button
                  type="button"
                  disabled={isEditing}
                  onClick={() => onSelectStyle?.("readable")}
                  className={`flex-1 py-2.5 rounded-full text-sm border ${
                    selectedStyle === "readable"
                      ? "bg-white/15 border-white/25 text-white"
                      : "border-white/10 text-white/45"
                  } ${isEditing ? "opacity-40" : ""}`}
                >
                  語り調
                </button>

                <button
                  type="button"
                  disabled={isEditing}
                  onClick={() => onSelectStyle?.("essay")}
                  className={`flex-1 py-2.5 rounded-full text-sm border ${
                    selectedStyle === "essay"
                      ? "bg-white/15 border-white/25 text-white"
                      : "border-white/10 text-white/45"
                  } ${isEditing ? "opacity-40" : ""}`}
                >
                  作品調
                </button>
              </div>

              {!isEditing && (
                <div>
                  <p className="text-white/80 text-[1rem] leading-[2.05] whitespace-pre-wrap text-narrative">
                    {displayText}
                  </p>

                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={startEditing}
                      className="w-8 h-8 flex items-center justify-center rounded-full opacity-80"
                      aria-label="私の歩みを修正する"
                    >
                      <Pencil
                        size={15}
                        className="text-white/32"
                        strokeWidth={1.7}
                      />
                    </button>
                  </div>
                </div>
              )}

              {isEditing && (
                <div>
                  <textarea
                    value={draftText}
                    onChange={event => setDraftText(event.target.value)}
                    className="w-full min-h-[260px] bg-transparent text-white/82 text-[1rem] leading-[2.05] outline-none resize-none text-narrative"
                    autoFocus
                  />

                  <div className="mt-5 flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                        setDraftText("");
                      }}
                      className="flex-1 py-3 rounded-full border border-white/10 text-white/45 text-sm"
                    >
                      キャンセル
                    </button>

                    <button
                      type="button"
                      onClick={saveEdit}
                      className="flex-1 btn-quiet bg-white/10 py-3 rounded-full text-white text-sm"
                    >
                      反映する
                    </button>
                  </div>
                </div>
              )}
            </div>

            {(data.sourceAnswers || []).length > 0 && (
              <div className="glass-card px-5 py-2 mb-5">
                <p className="text-white/34 text-xs tracking-widest py-3">
                  {(data.sourceAnswers || []).length}つの語りを見直す
                </p>

                {(data.sourceAnswers || []).map((answer, index) => (
                  <div
                    key={answer.id}
                    className={`py-4 ${
                      index > 0 ? "border-t border-white/[0.07]" : ""
                    }`}
                  >
                    <p className="text-white/62 text-sm leading-loose mb-3">
                      {answer.questionText}
                    </p>

                    <div className="flex items-center justify-end gap-2">
                      {getAnswerAudioItems(answer.id).map((item, audioIndex) =>
                        renderAudioButton(
                          item,
                          `${answer.questionText || "この語り"}の録音${
                            getAnswerAudioItems(answer.id).length > 1
                              ? ` ${audioIndex + 1}`
                              : ""
                          }`
                        )
                      )}
                      <button
                        type="button"
                        onClick={() => onRetakeAnswer?.(answer)}
                        className="text-white/38 text-xs underline underline-offset-4"
                      >
                        語り直す
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {additionalAudioItems.length > 0 && (
              <div className="flex items-center justify-between gap-3 px-2 mb-5">
                <span className="text-white/30 text-xs">語り足した内容</span>
                <div className="flex items-center justify-end gap-2 flex-wrap">
                  {additionalAudioItems.map((item, index) =>
                    renderAudioButton(item, `語り足した録音 ${index + 1}`)
                  )}
                </div>
              </div>
            )}

            {hasReachedAdditionLimit && (
              <p className="text-center text-white/32 text-xs py-2">
                語り足しはここまでです
              </p>
            )}
          </>
        )}
      </div>

      {!isBusy && data && status !== "error" && !isEditing && (
        <div className="pt-5 border-t border-white/10 space-y-4">
          {!hasReachedAdditionLimit && (
            <button
              type="button"
              onClick={onAddMore}
              className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
            >
              少し語り足す
            </button>
          )}

          <button
            type="button"
            onClick={onFinish}
            className="btn-quiet w-full py-4 rounded-full text-white"
          >
            {isRevisit
              ? "これまでの語りへ戻る"
              : "この内容で人生の輪郭を残す"}
          </button>

          {!isRevisit && (
            <p className="text-center text-white/28 text-xs">
              あとからいつでも見直せます
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function MemoryJourneyVisual() {
  return (
    <div
      className="relative h-44 w-full max-w-[330px] mx-auto my-7 overflow-hidden rounded-[2rem] border border-white/[0.07] bg-white/[0.025]"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_72%,rgba(251,191,36,0.10),transparent_48%)]" />

      <div className="absolute left-8 top-8 w-20 h-24 -rotate-6 rounded border border-amber-100/15 bg-amber-50/[0.035] shadow-xl">
        <div className="absolute left-3 right-3 top-3 h-12 rounded-sm bg-white/[0.04]">
          <div className="absolute left-4 right-4 bottom-2 h-5 border-l border-t border-r border-white/12" />
          <div className="absolute left-7 bottom-2 h-8 w-px bg-white/12" />
        </div>
        <div className="absolute left-3 right-6 bottom-5 h-px bg-white/10" />
        <div className="absolute left-3 right-4 bottom-3 h-px bg-white/[0.07]" />
      </div>

      <div className="absolute right-8 top-10 w-20 h-20 rotate-6 rounded-xl border border-white/10 bg-white/[0.035]">
        <div className="absolute left-5 top-4 w-10 h-10 rounded-full border border-white/10" />
        <div className="absolute left-9 top-3 w-px h-12 bg-white/10 rotate-45" />
      </div>

      <svg
        viewBox="0 0 330 176"
        className="absolute inset-0 w-full h-full"
      >
        <path
          d="M32 135 C82 118, 103 153, 150 126 S229 90, 299 120"
          fill="none"
          stroke="rgba(253,230,138,0.42)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="2 5"
        />
        <circle cx="151" cy="126" r="3" fill="rgba(253,230,138,0.75)" />
        <circle cx="299" cy="120" r="2.5" fill="rgba(253,230,138,0.55)" />
      </svg>

      <div className="absolute left-1/2 -translate-x-1/2 bottom-6 flex items-end">
        <div className="w-14 h-11 rounded-l-lg border border-r-0 border-white/15 bg-white/[0.045] -skew-y-6" />
        <div className="w-14 h-11 rounded-r-lg border border-l-0 border-white/15 bg-white/[0.045] skew-y-6" />
        <div className="absolute left-1/2 top-1 bottom-0 w-px bg-amber-100/25" />
      </div>
    </div>
  );
}

function Scene_LifeOutlineComplete({
  notificationLabel,
  needsNotificationSetup = false,
  needsSharingSetup = false,
  onContinue,
  onEndToday
}) {
  return (
    <div className="h-full flex flex-col fade-enter px-4 pt-5 pb-8 overflow-hidden">
      <OnboardingProgress current="weekly" outlineComplete />

      <div className="flex-1 overflow-y-auto pb-6 text-center">
        <p className="text-white/38 text-xs tracking-[0.22em] mb-4">
          人生の輪郭がまとまりました
        </p>

        <h1 className="text-white/92 text-[1.2rem] leading-loose text-narrative">
          物語づくりの、<br />
          最初の節目を迎えました。
        </h1>

        <p className="mt-5 text-white/52 text-sm leading-loose">
          ここまで語ってくださった時間が、<br />
          あなたの物語の土台になりました。
        </p>

        <MemoryJourneyVisual />

        <div className="glass-card px-5 py-6 text-left">
          <p className="text-center text-white/82 text-[1rem] leading-loose text-narrative mb-5">
            ここから、輪郭の内側へ
          </p>

          <p className="text-white/58 text-sm leading-[2]">
            ここまでで、人生全体の歩みが<br />
            ひとつの輪郭になりました。
          </p>

          <p className="mt-4 text-white/50 text-sm leading-[2]">
            毎週届く問いとともに、<br />
            一つひとつの出来事にある記憶や思いを、<br />
            少しずつ残していきます。
          </p>

          <p className="mt-4 text-white/36 text-xs leading-[2]">
            問いと問いの間に、昔の写真を眺めたり、<br />
            思い出の品に触れてみるのもよいかもしれません。
          </p>
        </div>
      </div>

      <div className="pt-5 border-t border-white/10 space-y-3">
        <button
          type="button"
          onClick={onContinue}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
        >
          {needsNotificationSetup || needsSharingSetup
            ? "このまま進む"
            : "最初の問いをひらく"}
        </button>

        <button
          type="button"
          onClick={onEndToday}
          className="w-full rounded-2xl border border-white/10 px-4 py-3.5 text-white/58"
        >
          <span className="block text-sm">今日はここまで</span>
          {notificationLabel && (
            <span className="block mt-1.5 text-[0.72rem] text-white/32">
              {notificationLabel}
            </span>
          )}
          {!notificationLabel && (
            <span className="block mt-1.5 text-[0.72rem] text-white/32">
              次の問いの時間は、次回決められます
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function Scene_SetupIntro({ onNext }) {
  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-4 text-center">
      <div className="space-y-7 mb-14 text-narrative">
        <p className="text-[1.1rem] text-white/90">
          物語を始める前に
        </p>

        <p className="text-white/65 text-[0.98rem] leading-loose">
          これから、語りやすくするための設定を<br />
          少しだけ整えます。
        </p>

        <p className="text-white/55 text-[0.95rem] leading-loose">
          ここで選ぶ内容は、<br />
          あとからいつでも変更できます。
        </p>
      </div>

      <button
        onClick={onNext}
        className="btn-quiet bg-white/10 w-full max-w-[280px] py-4 rounded-full text-sm text-white"
      >
        はじめる
      </button>
    </div>
  );
}

function Scene_StoryThemeSetup({ user, onComplete }) {
  const [hasSpouse, setHasSpouse] = useState(user?.has_spouse ?? true);
  const [hasChildren, setHasChildren] = useState(user?.has_children ?? true);
  const [hasGrandchildren, setHasGrandchildren] = useState(user?.has_grandchildren ?? true);
  const [canTalkAboutParents, setCanTalkAboutParents] = useState(user?.can_talk_about_parents ?? true);
  const [canTalkAboutPets, setCanTalkAboutPets] = useState(user?.can_talk_about_pets ?? true);
  const [loading, setLoading] = useState(false);

  const saveThemes = async () => {
    try {
      setLoading(true);

      const { data: updatedProfile, error } = await supabaseClient
        .from("profiles")
        .update({
          has_spouse: hasSpouse,
          has_children: hasChildren,
          has_grandchildren: hasGrandchildren,
          can_talk_about_parents: canTalkAboutParents,
          can_talk_about_pets: canTalkAboutPets
        })
        .eq("id", user.id)
        .select()
        .single();

      if (error) throw error;

      onComplete(updatedProfile);
    } catch (e) {
      console.error("theme setup save error", e);
      alert("設定の保存に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-4 text-center overflow-y-auto">
      <div className="w-full max-w-[340px] space-y-8 py-10">
        <div className="text-center space-y-4">
          <p className="text-white/75 text-base tracking-widest">
            今回の語りで
          </p>

          <p className="ui-help">
            今は話さなくてよいことや、<br />
            あてはまらないテーマがあれば<br />
            外してください。
          </p>
        </div>

        <div className="space-y-3">
          <StoryThemeToggle
            label="配偶者・パートナーのこと"
            value={hasSpouse}
            onToggle={() => setHasSpouse(prev => !prev)}
          />

          <StoryThemeToggle
            label="子どものこと"
            value={hasChildren}
            onToggle={() => setHasChildren(prev => !prev)}
          />

          <StoryThemeToggle
            label="孫のこと"
            value={hasGrandchildren}
            onToggle={() => setHasGrandchildren(prev => !prev)}
          />

          <StoryThemeToggle
            label="親や、育ててくれた人のこと"
            value={canTalkAboutParents}
            onToggle={() => setCanTalkAboutParents(prev => !prev)}
          />

          <StoryThemeToggle
            label="ペット・一緒に暮らした生きもののこと"
            value={canTalkAboutPets}
            onToggle={() => setCanTalkAboutPets(prev => !prev)}
          />
        </div>

        <button
          onClick={saveThemes}
          disabled={loading}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full text-sm text-white"
        >
          {loading ? "保存中..." : "この内容で進む"}
        </button>
      </div>
    </div>
  );
}

function Scene_SharingSetup({ initialScope = "family", onComplete }) {
  const [selectedScope, setSelectedScope] = useState(initialScope);
  const [loading, setLoading] = useState(false);

  const options = [
    {
      value: "family",
      label: "ファミリーへ共有する",
      note: "おすすめ"
    },
    {
      value: "selected",
      label: "選んだ人へ共有する"
    },
    {
      value: "private",
      label: "まずは自分だけで残す"
    }
  ];

  const proceed = async () => {
    try {
      setLoading(true);
      await onComplete(selectedScope);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-4 text-center">
      <div className="w-full max-w-[340px] space-y-9">
        <OnboardingProgress current="weekly" outlineComplete />

        <div className="space-y-5 text-narrative">
          <p className="text-[1.1rem] text-white/90 leading-loose">
            この物語を、<br />どなたと残していきますか？
          </p>

          <p className="text-white/48 text-sm leading-loose">
            共有範囲は、後からいつでも変更できます。
          </p>
        </div>

        <div className="space-y-3">
          {options.map(option => {
            const selected = selectedScope === option.value;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedScope(option.value)}
                className={`w-full rounded-2xl border px-5 py-4 text-left transition ${
                  selected
                    ? "border-white/42 bg-white/[0.12] text-white"
                    : "border-white/10 bg-white/[0.035] text-white/62"
                }`}
              >
                <span className="flex items-center justify-between gap-4">
                  <span className="text-[0.98rem]">{option.label}</span>
                  {option.note && (
                    <span className="text-[0.72rem] text-white/42">
                      {option.note}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={proceed}
          disabled={loading}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full text-sm text-white"
        >
          {loading ? "保存中..." : "この内容で進む"}
        </button>
      </div>
    </div>
  );
}

async function createAndSendSupporterInvite({
  user,
  foundation,
  inviteeEmail,
  sharingFlags
}) {
  const { data: pendingInvites, error: existingInviteError } =
    await supabaseClient
      .from("project_invites")
      .select("id, invitee_email, email_delivery_status")
      .eq("book_project_id", foundation?.project?.id || null)
      .eq("inviter_user_id", user.id)
      .eq("role", "supporter")
      .eq("status", "pending");

  if (existingInviteError) throw existingInviteError;

  const existingInvite = (pendingInvites || []).find(
    item =>
      String(item.invitee_email || "").trim().toLowerCase() === inviteeEmail
  );

  let invite = existingInvite;

  if (!invite) {
    const { data: createdInvite, error: inviteInsertError } =
      await supabaseClient
        .from("project_invites")
        .insert({
          book_project_id: foundation?.project?.id || null,
          inviter_user_id: user.id,
          invitee_email: inviteeEmail,
          role: "supporter",
          status: "pending",
          auto_share_on_accept: true
        })
        .select("id, email_delivery_status")
        .single();

    if (inviteInsertError) throw inviteInsertError;
    invite = createdInvite;
  }

  let updatedPreference = null;

  if (!sharingFlags.selectedEnabled) {
    updatedPreference = await upsertStorySharingPreference({
      bookProjectId: foundation?.project?.id,
      ownerPersonId:
        foundation?.project?.subject_person_id ||
        foundation?.person?.id,
      familyEnabled: sharingFlags.familyEnabled,
      selectedEnabled: true
    });
  }

  const { data: sendResult, error: sendError } =
    await supabaseClient.functions.invoke("send-supporter-invite", {
      body: {
        inviteId: invite.id
      }
    });

  return {
    emailDelivered: !sendError && sendResult?.success !== false,
    sendError: sendError || (sendResult?.success === false ? sendResult : null),
    updatedPreference
  };
}

function Scene_SupporterInvite({
  user,
  foundation,
  sharingPreference,
  isInitialSetup = false,
  initialEmail = "",
  onSharingPreferenceChange,
  onComplete
}) {
  const normalizedInitialEmail =
    typeof initialEmail === "string" ? initialEmail : "";
  const [supporterEmail, setSupporterEmail] = useState(normalizedInitialEmail);
  const [loading, setLoading] = useState(false);
  const [confirmPrivateChange, setConfirmPrivateChange] = useState(false);
  const sharingFlags = getStorySharingFlags(sharingPreference);
  const isPrivateSharing =
    !sharingFlags.familyEnabled && !sharingFlags.selectedEnabled;

  useEffect(() => {
    setSupporterEmail(normalizedInitialEmail);
  }, [normalizedInitialEmail]);

  const saveInvite = async () => {
    const inviteeEmail = supporterEmail.trim().toLowerCase();

    if (!inviteeEmail) {
      onComplete();
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail)) {
      alert("メールアドレスを確認してください。");
      return;
    }

    if (inviteeEmail === String(user?.email || "").trim().toLowerCase()) {
      alert("ご自身以外のメールアドレスを入力してください。");
      return;
    }

    if (
      isPrivateSharing &&
      !confirmPrivateChange
    ) {
      setConfirmPrivateChange(true);
      return;
    }

    try {
      setLoading(true);
      const result = await createAndSendSupporterInvite({
        user,
        foundation,
        inviteeEmail,
        sharingFlags
      });

      if (result.updatedPreference) {
        onSharingPreferenceChange?.(result.updatedPreference);
      }

      if (!result.emailDelivered) {
        console.error("supporter invite email send error", result.sendError);
        alert(
          "依頼は保存しましたが、メールを送信できませんでした。もう一度お試しください。"
        );
        return;
      }

      onComplete();
    } catch (e) {
      console.error("supporter invite save error", e);
      alert("お手伝いの依頼を保存できませんでした。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-4 text-center">
      <div className="w-full max-w-[320px] space-y-9">
        {isInitialSetup && (
          <OnboardingProgress current="weekly" outlineComplete />
        )}

        <div className="space-y-5 text-narrative">
          <p className="text-[1.1rem] text-white/90 leading-loose">
            物語づくりを、<br />ご家族に手伝ってもらいますか？
          </p>

          <p className="text-white/60 text-[0.98rem] leading-loose">
            録音の操作や写真の追加、<br />
            文章や本の形を整える作業をお願いできます。
          </p>
        </div>

        {confirmPrivateChange && (
          <div className="glass-card p-5 text-left space-y-3">
            <p className="text-white/82 text-sm leading-loose">
              この方にお手伝いを依頼すると、「自分だけ」の設定から「選んだ人へ共有」に変わります。よろしいですか？
            </p>

            <p className="text-white/45 text-xs leading-loose">
              「ずっと自分だけ」にした語りは表示されません。
            </p>
          </div>
        )}

        <div>
          <p className="ui-label mb-2">手伝ってもらう方のメールアドレス</p>
          <input
            type="email"
            className="quiet-input"
            value={supporterEmail}
            onChange={e => setSupporterEmail(e.target.value)}
          />
        </div>

        <div className="space-y-4">
          <button
            onClick={saveInvite}
            disabled={loading}
            className="btn-quiet bg-white/10 w-full py-4 rounded-full text-sm text-white"
          >
            {loading
              ? "依頼を送っています..."
              : confirmPrivateChange
                ? "内容を確認して依頼する"
                : "手伝ってもらう方を招待する"}
          </button>

          <button
            onClick={onComplete}
            disabled={loading}
            className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
          >
            {isInitialSetup ? "今は設定しない" : "今はひとりで始める"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Scene_SupporterInviteAccountMismatch({
  currentEmail,
  onSwitchAccount
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-4 text-center">
      <div className="w-full max-w-[340px] space-y-9">
        <div className="space-y-5 text-narrative">
          <p className="text-white/40 text-xs tracking-[0.18em]">
            お手伝いの依頼
          </p>

          <p className="text-[1.1rem] text-white/90 leading-loose">
            この依頼は、<br />
            別のメールアドレスに届いています。
          </p>

          <p className="text-white/58 text-sm leading-loose">
            メールを受け取ったアドレスで<br />
            開き直してください。
          </p>
        </div>

        {currentEmail && (
          <div className="glass-card p-5 text-left space-y-2">
            <p className="text-white/38 text-xs">現在開いているアカウント</p>
            <p className="text-white/72 text-sm break-all">{currentEmail}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onSwitchAccount}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full text-sm text-white"
        >
          別のアカウントで開く
        </button>
      </div>
    </div>
  );
}

function Scene_SupporterInviteReceived({
  invite,
  remainingCount = 1,
  onAccept,
  onDecline
}) {
  const [loadingAction, setLoadingAction] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const subjectName = withHonorific(invite?.subject_name || "ご家族");
  const inviterName = withHonorific(invite?.inviter_name || "");
  const isSelfRequest =
    !inviterName ||
    inviterName.replace(/さん$/, "") === subjectName.replace(/さん$/, "");

  const respond = async action => {
    try {
      setLoadingAction(action);
      setErrorMessage("");

      if (action === "accept") {
        await onAccept();
      } else {
        await onDecline();
      }
    } catch (error) {
      console.error("supporter invitation response error", error);
      setErrorMessage("招待への回答を保存できませんでした。もう一度お試しください。");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-4 text-center">
      <div className="w-full max-w-[340px] space-y-9">
        <div className="space-y-5 text-narrative">
          <p className="text-white/40 text-xs tracking-[0.18em]">
            お手伝いの依頼
          </p>

          <p className="text-[1.1rem] text-white/90 leading-loose">
            {subjectName}の物語づくりを、<br />
            お手伝いしませんか。
          </p>

          {!isSelfRequest && (
            <p className="text-white/48 text-xs leading-loose">
              依頼者：{inviterName}
            </p>
          )}

          <p className="text-white/58 text-sm leading-loose">
            録音の操作や写真の追加、文章や<br />
            本の形を整える作業をお手伝いできます。
          </p>
        </div>

        <div className="glass-card p-5 text-left space-y-3">
          <p className="text-white/76 text-sm leading-loose">
            共有範囲や将来の手渡し方は、物語のご本人だけが変更できます。
          </p>

          <p className="text-white/42 text-xs leading-loose">
            「ずっと自分だけ」にした語りは、お手伝いする方にも表示されません。
          </p>
        </div>

        {errorMessage && (
          <p className="text-rose-200/80 text-sm leading-relaxed">
            {errorMessage}
          </p>
        )}

        <div className="space-y-4">
          <button
            type="button"
            onClick={() => respond("accept")}
            disabled={Boolean(loadingAction)}
            className="btn-quiet bg-white/10 w-full py-4 rounded-full text-sm text-white"
          >
            {loadingAction === "accept"
              ? "承認しています..."
              : "お手伝いを引き受ける"}
          </button>

          <button
            type="button"
            onClick={() => respond("decline")}
            disabled={Boolean(loadingAction)}
            className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
          >
            {loadingAction === "decline" ? "保存しています..." : "今回は辞退する"}
          </button>
        </div>

        {remainingCount > 1 && (
          <p className="text-white/30 text-xs">
            このほかに {remainingCount - 1} 件の依頼があります
          </p>
        )}
      </div>
    </div>
  );
}

function HomeMenuButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card w-full px-5 py-5 flex items-center gap-4 text-left"
    >
      <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center shrink-0">
        <Icon size={22} className="text-white/78" strokeWidth={1.8} />
      </div>

      <p className="flex-1 text-white/88 text-[1.05rem] text-narrative">
        {label}
      </p>

      <ChevronRight size={20} className="text-white/35 shrink-0" strokeWidth={1.8} />
    </button>
  );
}

function DummyQrCode() {
  const cells = [
    1, 0, 1, 1, 0,
    0, 1, 0, 1, 1,
    1, 1, 0, 0, 1,
    1, 0, 1, 0, 0,
    0, 1, 1, 1, 0
  ];

  return (
    <div className="grid grid-cols-5 gap-[1px] w-7 h-7" aria-hidden="true">
      {cells.map((cell, index) => (
        <div
          key={index}
          className={cell ? "bg-slate-700" : "bg-slate-200"}
        />
      ))}
    </div>
  );
}

function formatBodyForPagePreview(text) {
  const raw = String(text || "").trim();

  if (!raw) return [];

  const existingParagraphs = raw
    .split(/\n+/)
    .map(item => item.trim())
    .filter(Boolean);

  if (existingParagraphs.length >= 2) {
    return existingParagraphs;
  }

  const sentences = raw
    .split(/(?<=。)/)
    .map(item => item.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return [raw];
  }

  const paragraphs = [];
  let buffer = "";

  for (const sentence of sentences) {
    const next = buffer ? `${buffer}${sentence}` : sentence;

    if (next.length >= 85) {
      paragraphs.push(next);
      buffer = "";
    } else {
      buffer = next;
    }
  }

  if (buffer) {
    paragraphs.push(buffer);
  }

  return paragraphs;
}

function BookPagePreview({
  type = "left",
  pageNumber = 1,
  sequenceOrder = "",
  questionText = "",
  bodyParagraphs = [],
  headingPhoto = null,
  photo = null,
  isPhotoStory = false,
  photoSequence = null,
  photoCaption = ""
}) {
  if (type === "right") {
    return (
      <div
        className="relative mx-auto w-full min-w-0 min-h-0 max-w-[360px] aspect-[182/257] overflow-hidden bg-[#f7f4ed] text-slate-900 shadow-2xl rounded-[2px] px-[12%] pt-[11%] pb-[6.5%]"
        aria-label={`B5 右ページ ${pageNumber}`}
      >
        <div className="h-full min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden pt-[3%]">
            {bodyParagraphs.length > 0 ? (
              bodyParagraphs.slice(0, 10).map((paragraph, index) => (
                <p
                  key={index}
                  className="text-[0.7rem] leading-[2.05] text-slate-800 mb-4 whitespace-pre-wrap"
                >
                  {paragraph}
                </p>
              ))
            ) : (
              <p className="text-[0.72rem] leading-[2.05] text-slate-400">
                文章が入ります。
              </p>
            )}
          </div>

          <p className="absolute right-[10.5%] bottom-[4.2%] text-[0.58rem] tabular-nums text-slate-500 text-right">
            {pageNumber}
          </p>
        </div>
      </div>
    );
  }

  if (type === "photo") {
    return (
      <div
        className="relative mx-auto w-full min-w-0 min-h-0 max-w-[360px] aspect-[182/257] overflow-hidden bg-[#f7f4ed] text-slate-900 shadow-2xl rounded-[2px] px-[10.5%] pt-[10%] pb-[6.5%]"
        aria-label={`B5 写真ページ ${pageNumber}`}
      >
        <div className="h-full flex flex-col">
          <div className="flex-1 min-h-0 flex items-center justify-center pb-[5%]">
            {photo?.url ? (
              <img
                src={photo.url}
                alt=""
                className="w-full h-full min-h-0 object-contain"
              />
            ) : (
              <div className="w-full h-[55%]" />
            )}
          </div>

          <p className={`absolute bottom-[4.2%] text-[0.58rem] tabular-nums text-slate-500 ${
            Number(pageNumber) % 2 === 0
              ? "left-[10.5%] text-left"
              : "right-[10.5%] text-right"
          }`}>
            {pageNumber}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative mx-auto w-full min-w-0 min-h-0 max-w-[360px] aspect-[182/257] overflow-hidden bg-[#f7f4ed] text-slate-900 shadow-2xl rounded-[2px] px-[10.5%] pt-[9.5%] pb-[6.5%]"
      aria-label={`B5 左ページ ${pageNumber}`}
    >
      <div
        className="h-full grid min-h-0"
        style={{
          gridTemplateRows: isPhotoStory
            ? "17% 19% 56% 8%"
            : "18% 26% 48% 8%"
        }}
      >
        <div className="self-end text-left">
          <p className="text-[0.62rem] leading-[1.15] tracking-[0.02em] text-slate-500">
            {isPhotoStory ? "Photo" : "Story"}<br />
            {isPhotoStory
              ? String(photoSequence || 1).padStart(2, "0")
              : (sequenceOrder || pageNumber)}
          </p>

          <div className="mt-1.5">
            <DummyQrCode />
          </div>
        </div>

        <div className="flex items-center justify-center text-center px-[5%]">
          <p className="text-[0.78rem] leading-[1.95] text-slate-700 whitespace-pre-wrap">
            {questionText || "問い"}
          </p>
        </div>

        <figure
          className="absolute left-[10.5%] right-[10.5%] bottom-[11%] min-h-0 overflow-hidden flex flex-col justify-end"
          style={{ top: isPhotoStory ? "39%" : "53%" }}
        >
          <div className="min-h-0 flex-1 flex items-end justify-center overflow-hidden">
            {headingPhoto?.url ? (
              <img
                src={headingPhoto.url}
                alt=""
                className="w-auto h-auto max-w-full max-h-full object-contain object-center"
              />
            ) : (
              <div className="w-full h-full" />
            )}
          </div>

          {photoCaption && (
            <figcaption className="mt-1.5 text-[0.48rem] leading-relaxed text-slate-500 text-left">
              {photoCaption}
            </figcaption>
          )}
        </figure>

        <p className="absolute left-[10.5%] bottom-[4.2%] text-[0.58rem] tabular-nums text-slate-500 text-left">
          {pageNumber}
        </p>
      </div>
    </div>
  );
}

function BookCoverPreview({
  title,
  subtitle,
  authorName,
  coverPhoto,
  coverColor = "#26382f",
  coverStyle = "cloth"
}) {
  const isPhoto = coverStyle === "photo";
  const isMinimal = coverStyle === "minimal";
  const usesDarkInk =
    isMinimal ||
    ["#c6d7e9", "#e7d3dc", "#d9cdbd"].includes(
      String(coverColor || "").toLowerCase()
    );
  const coverTexture = isMinimal
    ? {
        backgroundColor: "#eee8dc",
        backgroundImage:
          "radial-gradient(circle at 20% 15%, rgba(255,255,255,.7), transparent 32%), repeating-linear-gradient(0deg, rgba(82,65,45,.025) 0 1px, transparent 1px 4px)"
      }
    : {
        backgroundColor: coverColor,
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(255,255,255,.028) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(0,0,0,.035) 0 1px, transparent 1px 5px), radial-gradient(circle at 72% 18%, rgba(255,255,255,.08), transparent 35%)"
      };

  return (
    <div className="flex justify-center py-5" aria-label="表紙プレビュー">
      <div className="relative w-[254px] h-[356px] [perspective:900px]">
        <div className="absolute left-[30px] top-[33px] w-[218px] h-[310px] rounded-r-[12px] bg-black/50 blur-2xl" />

        <div className="absolute left-[215px] top-[11px] w-[24px] h-[318px] rounded-r-[9px] bg-[#f3eee3] shadow-[8px_9px_20px_rgba(0,0,0,.28)] overflow-hidden">
          <div className="absolute inset-y-3 left-[6px] w-px bg-[#cfc7b8]" />
          <div className="absolute inset-y-4 left-[11px] w-px bg-[#ddd5c7]" />
          <div className="absolute inset-y-5 left-[16px] w-px bg-[#e4ddd2]" />
        </div>

        <div
          className="absolute left-[8px] top-0 w-[216px] h-[326px] rounded-r-[10px] overflow-hidden border border-black/15 shadow-[0_24px_45px_rgba(0,0,0,.42)]"
          style={coverTexture}
        >
          <div className="absolute inset-y-0 left-0 w-[22px] bg-black/[0.13] border-r border-black/10 shadow-[inset_-4px_0_10px_rgba(0,0,0,.12)]" />
          <div className={`absolute inset-y-0 left-[31px] w-px ${isMinimal ? "bg-stone-600/12" : "bg-white/12"}`} />

          {isPhoto && (
            <div className="absolute inset-x-[38px] top-[36px] h-[126px] overflow-hidden border border-white/20 bg-black/10 shadow-[0_9px_22px_rgba(0,0,0,.16)]">
              {coverPhoto?.url ? (
                <img
                  src={coverPhoto.url}
                  alt="表紙に添えた写真"
                  className="w-full h-full object-cover saturate-[0.72] contrast-[0.92]"
                />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <ScanLine size={25} className="text-white/24" strokeWidth={1.3} />
                </div>
              )}
              <div className="absolute inset-0 bg-[#1c1a18]/10 mix-blend-multiply" />
            </div>
          )}

          {!isMinimal && !isPhoto && (
            <svg className="absolute inset-x-[35px] top-[36px] w-[146px] h-[34px] opacity-45" viewBox="0 0 146 34" aria-hidden="true">
              <path d="M2 23 C 30 8, 48 31, 74 17 S 118 7, 144 19" fill="none" stroke={usesDarkInk ? "rgba(100,76,35,.7)" : "rgba(230,207,137,.75)"} strokeWidth="1.2" strokeDasharray="3 5" />
              <circle cx="74" cy="17" r="2.4" fill={usesDarkInk ? "rgba(107,78,31,.8)" : "rgba(241,220,153,.85)"} />
            </svg>
          )}

          <div className={`absolute inset-x-[38px] ${isPhoto ? "top-[184px]" : isMinimal ? "top-[72px]" : "top-[98px]"} text-center`}>
            <p className={`${usesDarkInk ? "text-stone-800/90" : "text-white/90"} text-[1.02rem] leading-[1.8] text-narrative tracking-[0.07em] whitespace-pre-wrap`}>
              {title || "わたしの物語"}
            </p>

            <div className={`mx-auto my-5 w-9 h-px ${usesDarkInk ? "bg-stone-700/25" : "bg-white/26"}`} />

            <p className={`${usesDarkInk ? "text-stone-700/58" : "text-white/55"} text-[0.68rem] leading-loose tracking-[0.14em] whitespace-pre-wrap`}>
              {subtitle || "これまでの時間を、家族へ"}
            </p>
          </div>

          {isMinimal && (
            <div className="absolute inset-x-[44px] bottom-[62px] flex items-center gap-3 opacity-50" aria-hidden="true">
              <span className="h-px flex-1 bg-stone-600/30" />
              <span className="w-1.5 h-1.5 rounded-full border border-stone-600/40" />
              <span className="h-px flex-1 bg-stone-600/30" />
            </div>
          )}

          <p className={`absolute inset-x-[38px] bottom-8 text-center ${usesDarkInk ? "text-stone-700/48" : "text-white/48"} text-[0.65rem] tracking-[0.18em]`}>
            {authorName || ""}
          </p>
        </div>
      </div>
    </div>
  );
}

function Scene_PhotoStoryStart({ onStart, onBack }) {
  const [photo, setPhoto] = useState(null);
  const [photoCorrectionOpen, setPhotoCorrectionOpen] = useState(false);
  const choosePhoto = file => {
    if (!file?.type?.startsWith("image/")) return;
    if (photo?.url) { try { URL.revokeObjectURL(photo.url); } catch (_error) {} }
    setPhoto({ file, url: URL.createObjectURL(file), name: file.name || "photo", type: file.type || "image/jpeg", createdAt: Date.now() });
  };
  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8 overflow-y-auto">
      <PhotoCorrectionFlow
        open={photoCorrectionOpen}
        title="写真から語る"
        onClose={() => setPhotoCorrectionOpen(false)}
        onComplete={choosePhoto}
      />
      <div className="relative flex items-center justify-center h-10 mb-8 shrink-0">
        <button type="button" onClick={onBack} className="absolute left-0 w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center"><ChevronLeft size={20} className="text-white/55" /></button>
        <p className="text-white/88 text-[1.02rem] text-narrative">写真から語る</p>
      </div>
      <div className="text-center mb-7">
        <p className="text-white/72 text-sm leading-loose">残したい一枚を選んでください。</p>
        <p className="text-white/34 text-xs leading-loose mt-2">写真を見ながら、覚えていることをそのままお話しいただけます。</p>
      </div>
      <button type="button" onClick={() => setPhotoCorrectionOpen(true)} className="glass-card min-h-[310px] w-full overflow-hidden flex items-center justify-center mb-7">
        {photo?.url ? <img src={photo.url} alt="選んだ写真" className="w-full max-h-[430px] object-contain" /> : (
          <div className="text-center"><ImageIcon size={38} className="text-white/25 mx-auto mb-4" strokeWidth={1.4} /><p className="text-white/52 text-sm">写真を選ぶ</p><p className="text-white/28 text-xs mt-2">切り抜きや傾きを整えられます</p></div>
        )}
      </button>
      <button type="button" onClick={() => onStart(photo)} disabled={!photo} className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white disabled:opacity-35">この写真について語る</button>
    </div>
  );
}

function Scene_StoryRelationshipInviteReceived({ invite, remainingCount, onAccept, onDecline }) {
  const isFamily = invite?.invite_type === "family";
  const [loadingAction, setLoadingAction] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const respond = async action => {
    try {
      setLoadingAction(action);
      setErrorMessage("");
      await (action === "accept" ? onAccept() : onDecline());
    } catch (error) {
      console.error("story relationship response error", error);
      setErrorMessage("回答を保存できませんでした。通信を確認して、もう一度お試しください。");
    } finally {
      setLoadingAction(null);
    }
  };
  return (
    <div className="h-full flex flex-col justify-center fade-enter px-6 py-10 text-center">
      <p className="text-white/36 text-xs tracking-[0.2em] mb-8">
        {isFamily ? "ファミリーとしてつながる依頼" : "物語を共有する依頼"}
      </p>
      <h1 className="text-white/90 text-[1.3rem] leading-loose text-narrative mb-7">
        {invite?.owner_name || "ご家族"}の物語から、<br />依頼が届いています。
      </h1>
      <div className="glass-card p-6 text-left mb-9">
        <p className="text-white/66 text-sm leading-loose">
          {isFamily
            ? "承認すると、ファミリーとしてのつながりが確認され、共有されている物語を受け取れるようになります。"
            : "承認すると、この物語の共有相手として登録されます。"}
        </p>
        {isFamily && invite?.relationship_label && (
          <p className="text-white/36 text-xs mt-4">関係：{STORY_RELATIONSHIP_LABELS[invite.relationship_label] || "その他"}</p>
        )}
      </div>
      {errorMessage && <p className="text-rose-200/80 text-sm leading-relaxed mb-5">{errorMessage}</p>}
      <button type="button" onClick={() => respond("accept")} disabled={Boolean(loadingAction)} className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white mb-4">
        {loadingAction === "accept" ? "つないでいます..." : "依頼を受ける"}
      </button>
      <button type="button" onClick={() => respond("decline")} disabled={Boolean(loadingAction)} className="w-full py-3 text-white/38 text-sm underline underline-offset-4">
        {loadingAction === "decline" ? "保存しています..." : "今回は辞退する"}
      </button>
      {remainingCount > 1 && <p className="text-white/28 text-xs mt-5">ほかに {remainingCount - 1} 件の依頼があります</p>}
    </div>
  );
}

function Scene_ConnectionComplete({ connection, onOpen, onConnectionsHome }) {
  const ownerName = withHonorific(connection?.ownerName || "ご家族");
  const isSupporter = connection?.type === "supporter";
  const relationship = STORY_RELATIONSHIP_LABELS[connection?.relationshipLabel];

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-5 text-center">
      <div className="w-full max-w-[360px] space-y-9">
        <div className="space-y-5 text-narrative">
          <p className="text-white/38 text-xs tracking-[0.2em]">つながりました</p>
          <h1 className="text-white/92 text-[1.35rem] leading-loose">
            {ownerName}の物語に、<br />つながりました。
          </h1>
          <p className="text-white/54 text-sm leading-loose">
            {isSupporter
              ? "これから、物語づくりをお手伝いできます。"
              : "共有されている語りを、ここから受け取れます。"}
          </p>
          {relationship && <p className="text-white/34 text-xs">関係：{relationship}</p>}
        </div>

        <button type="button" onClick={onOpen} className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white">
          {isSupporter ? "お手伝いする物語を開く" : "共有された物語を見る"}
        </button>
        <button type="button" onClick={onConnectionsHome} className="w-full py-3 text-white/42 text-sm underline underline-offset-4">
          つながっている物語の一覧へ
        </button>
      </div>
    </div>
  );
}

function Scene_ConnectionsHome({
  userName,
  receivedProjects = [],
  supportedProjects = [],
  onOpenReceivedProject,
  onOpenSupportedProject,
  onStartOwnStory
}) {
  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8 overflow-y-auto">
      <div className="text-center mb-10">
        <p className="text-white/35 text-xs tracking-[0.22em] mb-3">縦糸横糸ブック</p>
        <p className="text-white/82 text-[1.05rem] text-narrative">{withHonorific(userName)}</p>
      </div>

      <div className="space-y-7">
        {receivedProjects.length > 0 && (
          <section className="space-y-3">
            <p className="text-white/38 text-xs tracking-[0.18em] px-1">受け取っている物語</p>
            {receivedProjects.map(project => (
              <HomeMenuButton
                key={`received-${project.book_project_id}`}
                icon={Files}
                label={`${project.subject_name || "ご家族"}の物語`}
                onClick={() => onOpenReceivedProject?.(project)}
              />
            ))}
          </section>
        )}

        {supportedProjects.length > 0 && (
          <section className="space-y-3">
            <p className="text-white/38 text-xs tracking-[0.18em] px-1">お手伝いしている物語</p>
            {supportedProjects.map(project => (
              <HomeMenuButton
                key={`supported-${project.supporter_id}`}
                icon={Users}
                label={`${project.subject_name || "ご家族"}の物語`}
                onClick={() => onOpenSupportedProject?.(project)}
              />
            ))}
          </section>
        )}

        <section className="pt-7 border-t border-white/[0.08] text-center space-y-4">
          <p className="text-white/38 text-xs leading-loose">ご自身の物語も、いつでも始められます。</p>
          <button type="button" onClick={onStartOwnStory} className="w-full py-3 text-white/50 text-sm underline underline-offset-4">
            自分の物語を始める
          </button>
        </section>
      </div>
    </div>
  );
}

function Scene_Home({
  userName,
  supportedProjects = [],
  receivedProjects = [],
  onStartTalking,
  onOpenStoryPages,
  onStartPhotoStory,
  onOpenBookBuilder,
  onOpenQuestionLibrary,
  onOpenSettings,
  onOpenSupportedProject,
  onOpenReceivedProject,
  onDevLogout
}) {
  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8 overflow-y-auto">
      <div className="flex-1 flex flex-col justify-center min-h-fit">
        <div className="text-center mb-12">
          <p className="text-white/35 text-xs tracking-[0.22em] mb-3">
            縦糸横糸ブック
          </p>

          <p className="text-white/82 text-[1.05rem] text-narrative">
            {withHonorific(userName)}の物語
          </p>
        </div>

        <div className="space-y-7">
          <section>
            <p className="text-white/34 text-xs tracking-[0.18em] px-1 mb-3">今日、語る</p>
            <div className="glass-card overflow-hidden">
              <button type="button" onClick={onStartTalking} className="w-full px-5 py-5 flex items-center gap-4 text-left">
                <div className="w-11 h-11 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0">
                  <Mic size={21} className="text-white/70" strokeWidth={1.7} />
                </div>
                <p className="flex-1 text-white/86 text-[1rem] text-narrative">届いた問いから語る</p>
                <ChevronRight size={19} className="text-white/25" strokeWidth={1.7} />
              </button>
              <div className="mx-5 border-t border-white/[0.08]" />
              <button type="button" onClick={onStartPhotoStory} className="w-full px-5 py-5 flex items-center gap-4 text-left">
                <div className="w-11 h-11 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0">
                  <ImageIcon size={21} className="text-white/70" strokeWidth={1.7} />
                </div>
                <p className="flex-1 text-white/86 text-[1rem] text-narrative">写真から語る</p>
                <ChevronRight size={19} className="text-white/25" strokeWidth={1.7} />
              </button>
            </div>
          </section>

          <section>
            <p className="text-white/34 text-xs tracking-[0.18em] px-1 mb-3">これまで</p>
            <HomeMenuButton
              icon={Files}
              label="語りを見る"
              onClick={onOpenStoryPages}
            />
          </section>

          <section className="pt-6 border-t border-white/[0.08]">
            <p className="text-white/34 text-xs tracking-[0.18em] px-1 mb-3">物語を一冊へ</p>
            <button type="button" onClick={onOpenBookBuilder} className="glass-card w-full px-5 py-5 flex items-center gap-4 text-left">
              <div className="w-11 h-11 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0">
                <BookOpen size={21} className="text-white/70" strokeWidth={1.7} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/86 text-[1rem] text-narrative">本に仕上げる</p>
                <p className="mt-1 text-white/32 text-xs">これまでの語りを、本の形に整えます</p>
              </div>
              <ChevronRight size={19} className="text-white/25" strokeWidth={1.7} />
            </button>
          </section>

          <div className="grid grid-cols-2 gap-3">
            <HomeUtilityButton
              icon={Plus}
              label="問いを追加"
              onClick={onOpenQuestionLibrary}
            />
            <HomeUtilityButton
              icon={Settings}
              label="設定"
              onClick={onOpenSettings}
            />
          </div>

          {supportedProjects.length > 0 && (
            <div className="pt-7 border-t border-white/10 space-y-4">
              <p className="text-white/45 text-xs tracking-[0.18em] px-1">
                お手伝いしている物語
              </p>

              {supportedProjects.map(project => (
                <HomeMenuButton
                  key={project.supporter_id}
                  icon={Users}
                  label={`${project.subject_name || "ご家族"}の物語`}
                  onClick={() => onOpenSupportedProject?.(project)}
                />
              ))}
            </div>
          )}

          {receivedProjects.length > 0 && (
            <div className="pt-7 border-t border-white/10 space-y-4">
              <p className="text-white/45 text-xs tracking-[0.18em] px-1">受け取っている物語</p>
              {receivedProjects.map(project => (
                <HomeMenuButton
                  key={`received-${project.book_project_id}`}
                  icon={Files}
                  label={`${project.subject_name || "ご家族"}の物語`}
                  onClick={() => onOpenReceivedProject?.(project)}
                />
              ))}
            </div>
          )}

          {onDevLogout && (
            <button
              type="button"
              onClick={onDevLogout}
              className="w-full py-3 text-white/35 text-sm underline underline-offset-4"
            >
              開発用ログアウト
            </button>
          )}

        </div>
      </div>
    </div>
  );
}

function HomeUtilityButton({ icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 py-4 flex items-center justify-center gap-3 text-white/58"
    >
      <Icon size={17} strokeWidth={1.7} />
      <span className="text-sm">{label}</span>
    </button>
  );
}

function SettingsMenuButton({ icon: Icon, label, detail, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card w-full px-5 py-4 flex items-center gap-4 text-left"
    >
      <div className="w-10 h-10 rounded-full bg-white/[0.07] flex items-center justify-center shrink-0">
        <Icon size={19} className="text-white/62" strokeWidth={1.7} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white/82 text-[0.98rem] text-narrative">{label}</p>
        {detail && <p className="mt-1 text-white/34 text-xs truncate">{detail}</p>}
      </div>
      <ChevronRight size={18} className="text-white/25" strokeWidth={1.7} />
    </button>
  );
}

function Scene_SettingsHome({
  notificationPref,
  sharingPreference,
  onOpenDelivery,
  onOpenPrivacy,
  onOpenSupporters,
  onOpenProfile,
  onBack
}) {
  const sharingFlags = getStorySharingFlags(sharingPreference);
  const sharingLabel = sharingFlags.familyEnabled && sharingFlags.selectedEnabled
    ? "ファミリー＋選んだ人へ共有"
    : sharingFlags.familyEnabled
      ? "ファミリーへ共有"
      : sharingFlags.selectedEnabled
        ? "選んだ人へ共有"
        : "自分だけ";

  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8 overflow-y-auto">
      <div className="relative flex items-center justify-center h-10 mb-10 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="absolute left-0 w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center"
          aria-label="ホームへ戻る"
        >
          <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
        </button>
        <p className="text-white/88 text-[1.05rem] text-narrative">設定</p>
      </div>

      <div className="space-y-4">
        <SettingsMenuButton
          icon={Bell}
          label="問いの届け方"
          detail={notificationPref ? formatNextNotificationLabel(notificationPref) : "未設定"}
          onClick={onOpenDelivery}
        />
        <SettingsMenuButton
          icon={Lock}
          label="共有とプライバシー"
          detail={sharingPreference ? sharingLabel : "未設定"}
          onClick={onOpenPrivacy}
        />
        <SettingsMenuButton
          icon={UserCog}
          label="お手伝いする人"
          detail="依頼中・お手伝い中の方を確認"
          onClick={onOpenSupporters}
        />
        <SettingsMenuButton
          icon={UserCircle}
          label="プロフィール・アカウント"
          detail="登録氏名とメールアドレス"
          onClick={onOpenProfile}
        />
      </div>
    </div>
  );
}

function Scene_SharingPrivacySettings({
  foundation,
  initialPreference,
  onSavePreference,
  onOpenPrivateStories,
  onBack
}) {
  const initialFlags = getStorySharingFlags(initialPreference, "family");
  const [familyEnabled, setFamilyEnabled] = useState(initialFlags.familyEnabled);
  const [selectedEnabled, setSelectedEnabled] = useState(initialFlags.selectedEnabled);
  const [saving, setSaving] = useState(false);
  const [relationships, setRelationships] = useState([]);
  const [supporters, setSupporters] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [addType, setAddType] = useState(null);
  const [inviteFamilyName, setInviteFamilyName] = useState("");
  const [inviteGivenName, setInviteGivenName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [relationshipLabel, setRelationshipLabel] = useState("child");
  const isPrivate = !familyEnabled && !selectedEnabled;

  useEffect(() => {
    const nextFlags = getStorySharingFlags(initialPreference, "family");
    setFamilyEnabled(nextFlags.familyEnabled);
    setSelectedEnabled(nextFlags.selectedEnabled);
  }, [
    initialPreference?.id,
    initialPreference?.family_sharing_enabled,
    initialPreference?.selected_sharing_enabled,
    initialPreference?.live_scope
  ]);

  const loadPeople = async () => {
    try {
      setLoadingPeople(true);
      const [relationshipRows, supporterResult] = await Promise.all([
        loadOwnedStoryRelationships(foundation?.project?.id),
        supabaseClient.rpc("list_owned_project_supporters", { input_book_project_id: foundation?.project?.id })
      ]);
      setRelationships(relationshipRows);
      setSupporters((supporterResult.data || []).filter(item => ["active", "pending"].includes(item.relationship_status)));
    } catch (error) {
      console.error("story relationships load error", error);
    } finally {
      setLoadingPeople(false);
    }
  };

  useEffect(() => { loadPeople(); }, [foundation?.project?.id]);

  const saveImmediately = async nextFlags => {
    const previousFlags = { familyEnabled, selectedEnabled };
    setFamilyEnabled(nextFlags.familyEnabled);
    setSelectedEnabled(nextFlags.selectedEnabled);

    try {
      setSaving(true);
      await onSavePreference(nextFlags);
    } catch (error) {
      setFamilyEnabled(previousFlags.familyEnabled);
      setSelectedEnabled(previousFlags.selectedEnabled);
    } finally {
      setSaving(false);
    }
  };

  const toggleScope = async type => {
    const turningOff = type === "family" ? familyEnabled : selectedEnabled;
    if (turningOff) {
      if (type === "selected" && supporters.length > 0) {
        const ok = window.confirm(
          "「選んだ人へ共有」を外すと、サポーターのお手伝い設定も終了します。\n\nファミリーとしてつながっている方は、ファミリー共有が有効なら引き続き物語を見られます。共有とお手伝いを終了しますか？"
        );
        if (!ok) return;
      } else if (type === "family" && relationships.some(item => item.invite_type === "family" && item.relationship_status === "accepted")) {
        const ok = window.confirm(
          "ファミリーへの共有を停止します。\nつながりの確認は残りますが、物語は表示されなくなります。よろしいですか？"
        );
        if (!ok) return;
      }
      try {
        setSaving(true);
        const { error } = await supabaseClient.rpc("disable_story_sharing_scope", {
          input_book_project_id: foundation?.project?.id,
          input_scope: type
        });
        if (error) throw error;
        await saveImmediately({
          familyEnabled: type === "family" ? false : familyEnabled,
          selectedEnabled: type === "selected" ? false : selectedEnabled
        });
        await loadPeople();
      } catch (error) {
        console.error("sharing scope disable error", error);
        alert("共有範囲を変更できませんでした。");
      } finally { setSaving(false); }
      return;
    }
    await saveImmediately({
      familyEnabled: type === "family" ? true : familyEnabled,
      selectedEnabled: type === "selected" ? true : selectedEnabled
    });
  };

  const choosePrivate = async () => {
    if (selectedEnabled && supporters.length > 0) {
      const ok = window.confirm("自分だけで残すと、サポーターのお手伝い設定も終了します。共有とお手伝いを終了しますか？");
      if (!ok) return;
    }
    if (familyEnabled && relationships.some(item => item.invite_type === "family" && item.relationship_status === "accepted")) {
      const ok = window.confirm("ファミリーとのつながりの確認は残りますが、物語は表示されなくなります。自分だけで残しますか？");
      if (!ok) return;
    }
    try {
      setSaving(true);
      if (selectedEnabled) await supabaseClient.rpc("disable_story_sharing_scope", { input_book_project_id: foundation?.project?.id, input_scope: "selected" });
      if (familyEnabled) await supabaseClient.rpc("disable_story_sharing_scope", { input_book_project_id: foundation?.project?.id, input_scope: "family" });
      await onSavePreference({ familyEnabled: false, selectedEnabled: false });
      setFamilyEnabled(false);
      setSelectedEnabled(false);
      await loadPeople();
    } catch (error) {
      console.error("private sharing selection error", error);
      alert("共有範囲を変更できませんでした。");
    } finally { setSaving(false); }
  };

  const sendRelationshipInvite = async () => {
    const normalizedFamilyName = inviteFamilyName.trim();
    const normalizedGivenName = inviteGivenName.trim();
    if (!addType || !normalizedFamilyName || !normalizedGivenName || !inviteEmail.trim()) return;
    try {
      setSaving(true);
      const { data: inviteId, error } = await supabaseClient.rpc("create_story_relationship_invite", {
        input_book_project_id: foundation?.project?.id,
        input_email: inviteEmail.trim(),
        input_invite_type: addType,
        input_invitee_name: `${normalizedFamilyName} ${normalizedGivenName}`,
        input_relationship_label: addType === "family" ? relationshipLabel : null
      });
      if (error) throw error;
      const { data: sendResult, error: sendError } = await supabaseClient.functions.invoke("send-sharing-invite", {
        body: { inviteId }
      });
      if (sendError || sendResult?.success === false) throw sendError || new Error(sendResult?.error || "send failed");
      const nextFlags = { familyEnabled: familyEnabled || addType === "family", selectedEnabled: selectedEnabled || addType === "selected" };
      setFamilyEnabled(nextFlags.familyEnabled);
      setSelectedEnabled(nextFlags.selectedEnabled);
      setInviteFamilyName(""); setInviteGivenName(""); setInviteEmail(""); setAddType(null);
      await loadPeople();
      alert("依頼メールを送りました。");
    } catch (error) {
      console.error("relationship invitation error", error);
      alert("依頼を送信できませんでした。");
    } finally { setSaving(false); }
  };

  const removeRelationship = async item => {
    if (!window.confirm(`${item.display_name || item.invitee_email}との共有を終了しますか？`)) return;
    try {
      setSaving(true);
      const { error } = await supabaseClient.rpc("revoke_story_relationship", {
        input_book_project_id: foundation?.project?.id,
        input_relationship_id: item.relationship_id
      });
      if (error) throw error;
      await loadPeople();
    } catch (error) {
      console.error("relationship revoke error", error);
      alert("共有相手を解除できませんでした。");
    } finally { setSaving(false); }
  };

  const resendRelationship = async item => {
    try {
      setSaving(true);
      const { data, error } = await supabaseClient.functions.invoke("send-sharing-invite", { body: { inviteId: item.relationship_id } });
      if (error || data?.success === false) throw error || new Error(data?.error || "send failed");
      alert("依頼メールを再送しました。");
    } catch (error) {
      console.error("relationship invitation resend error", error);
      alert("依頼メールを再送できませんでした。");
    } finally { setSaving(false); }
  };

  const toggleRelationshipPause = async item => {
    const nextPaused = item.relationship_status !== "paused";
    try {
      setSaving(true);
      const { error } = await supabaseClient.rpc("set_story_relationship_paused", {
        input_book_project_id: foundation?.project?.id,
        input_relationship_id: item.relationship_id,
        input_paused: nextPaused
      });
      if (error) throw error;
      await loadPeople();
    } catch (error) {
      console.error("relationship pause error", error);
      alert("共有状態を変更できませんでした。");
    } finally { setSaving(false); }
  };

  const options = [
    {
      value: "family",
      label: "ファミリーへ共有",
      note: "おすすめ",
      selected: familyEnabled,
      onSelect: () => toggleScope("family")
    },
    {
      value: "selected",
      label: "選んだ人へ共有",
      selected: selectedEnabled,
      onSelect: () => toggleScope("selected")
    },
    {
      value: "private",
      label: "自分だけで残す",
      selected: isPrivate,
      onSelect: choosePrivate
    }
  ];

  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8 overflow-y-auto">
      <div className="relative flex items-center justify-center h-10 mb-9 shrink-0">
        <button type="button" onClick={onBack} className="absolute left-0 w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center">
          <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
        </button>
        <p className="text-white/88 text-[1.02rem] text-narrative">共有とプライバシー</p>
      </div>

      <div className="space-y-8">
        <section>
          <p className="text-white/38 text-xs tracking-[0.18em] mb-4">物語全体</p>
          <div className="space-y-3">
            {options.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={option.onSelect}
                disabled={saving}
                className={`w-full rounded-2xl border px-5 py-4 text-left transition ${option.selected ? "border-white/35 bg-white/[0.1]" : "border-white/[0.08] bg-white/[0.025]"}`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-3 text-white/78 text-sm">
                    <span className={`w-5 text-center ${option.selected ? "text-white/82" : "text-white/18"}`} aria-hidden="true">
                      {option.selected ? "✓" : ""}
                    </span>
                    {option.label}
                  </span>
                  {option.note && <span className="text-white/32 text-xs">{option.note}</span>}
                </span>
              </button>
            ))}
          </div>
          <p className="h-5 mt-3 text-center text-white/28 text-xs">
            {saving ? "保存しています..." : "選ぶと自動で保存されます"}
          </p>
        </section>

        {[
          { type: "family", label: "ファミリー", enabled: familyEnabled },
          { type: "selected", label: "選んだ人", enabled: selectedEnabled }
        ].map(section => {
          const relationshipPeople = relationships.filter(item => item.invite_type === section.type);
          const supporterPeople = section.type === "selected"
            ? supporters
                .filter(supporter => !relationshipPeople.some(item => String(item.invitee_email).toLowerCase() === String(supporter.invitee_email).toLowerCase()))
                .map(supporter => ({
                  relationship_id: `supporter-${supporter.invite_id}`,
                  invite_type: "selected",
                  invitee_email: supporter.invitee_email,
                  display_name: supporter.display_name || supporter.invitee_email,
                  relationship_status: supporter.relationship_status === "active" ? "accepted" : "pending",
                  is_supporter: true,
                  supporter_only: true
                }))
            : [];
          const people = [...relationshipPeople, ...supporterPeople];
          const shown = people.slice(0, 2);
          return (
            <section key={section.type} className="pt-7 border-t border-white/[0.08]">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-white/70 text-sm">{section.label}</p>
                  <p className="text-white/30 text-xs mt-1">{section.enabled ? "共有中" : "共有を停止中"}・{people.length}人</p>
                </div>
                <button type="button" onClick={() => setAddType(section.type)} className="w-9 h-9 rounded-full border border-white/12 flex items-center justify-center" aria-label={`${section.label}を追加`}>
                  <Plus size={17} className="text-white/62" />
                </button>
              </div>
              {loadingPeople ? <p className="text-white/28 text-xs">読み込んでいます...</p> : (
                <div className="space-y-2">
                  {shown.map(item => (
                    <div key={item.relationship_id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white/68 text-sm truncate">{item.display_name || item.invitee_email}</p>
                        <p className="text-white/34 text-xs mt-1">
                          {item.invite_type === "family" && item.relationship_label
                            ? `${STORY_RELATIONSHIP_LABELS[item.relationship_label] || "その他"}・`
                            : ""}
                          {item.relationship_status === "accepted" ? (section.enabled ? "共有中" : "一時停止") : item.relationship_status === "paused" ? "個別に一時停止" : "依頼中"}{item.is_supporter ? "・サポーター" : ""}
                        </p>
                        <p className="text-white/24 text-[0.68rem] mt-1 truncate">{item.invitee_email}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {!item.supporter_only && item.relationship_status === "pending" && <button type="button" onClick={() => resendRelationship(item)} className="text-white/42 text-xs underline underline-offset-4">再送</button>}
                        {!item.supporter_only && ["accepted", "paused"].includes(item.relationship_status) && <button type="button" onClick={() => toggleRelationshipPause(item)} className="text-white/42 text-xs underline underline-offset-4">{item.relationship_status === "paused" ? "再開" : "一時停止"}</button>}
                        {!item.supporter_only && <button type="button" onClick={() => removeRelationship(item)} className="text-white/26 text-xs underline underline-offset-4">解除</button>}
                        {item.supporter_only && <span className="text-white/26 text-[0.65rem]">お手伝い設定で管理</span>}
                      </div>
                    </div>
                  ))}
                  {people.length > 2 && <p className="text-white/30 text-xs px-1">ほか {people.length - 2}人</p>}
                  {people.length === 0 && <p className="text-white/28 text-xs">つながっている方はまだいません。</p>}
                </div>
              )}
            </section>
          );
        })}

        {addType && (
          <section className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-white/78 text-sm">{addType === "family" ? "ファミリーを追加" : "共有する人を追加"}</p>
              <button type="button" onClick={() => setAddType(null)} className="text-white/35 text-sm">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={inviteFamilyName} onChange={event => setInviteFamilyName(event.target.value)} className="quiet-input" placeholder="姓" autoComplete="family-name" />
              <input value={inviteGivenName} onChange={event => setInviteGivenName(event.target.value)} className="quiet-input" placeholder="名" autoComplete="given-name" />
            </div>
            <input type="email" value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} className="quiet-input" placeholder="メールアドレス" />
            {addType === "family" && (
              <select value={relationshipLabel} onChange={event => setRelationshipLabel(event.target.value)} className="quiet-select">
                <option value="child">子</option><option value="parent">親</option><option value="spouse">配偶者</option>
                <option value="sibling">きょうだい</option><option value="grandchild">孫</option><option value="other">その他</option>
              </select>
            )}
            <button type="button" onClick={sendRelationshipInvite} disabled={saving || !inviteFamilyName.trim() || !inviteGivenName.trim() || !inviteEmail.trim()} className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white text-sm disabled:opacity-35">
              依頼を送る
            </button>
            <p className="text-white/28 text-xs leading-loose">承認後も、氏名・関係・メールアドレスを確認できます。</p>
          </section>
        )}

        <section className="pt-7 border-t border-white/[0.08]">
          <SettingsMenuButton
            icon={Lock}
            label="語りごとの非公開設定"
            detail="自分だけにする語りを選びます"
            onClick={onOpenPrivateStories}
          />
        </section>
      </div>
    </div>
  );
}

function Scene_PrivateStorySettings({ user, questionSet = [], onBack }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [expandedStoryIds, setExpandedStoryIds] = useState(() => new Set());

  useEffect(() => {
    const load = async () => {
      try {
        const { data, error } = await supabaseClient
          .from("answers")
          .select("id, sequence_order, transcript_edited, transcript_readable, transcript_clean, access_override, created_at")
          .eq("user_id", user.id)
          .order("sequence_order", { ascending: true });
        if (error) throw error;
        setStories(data || []);
      } catch (error) {
        console.error("private story settings load error", error);
        alert("語りの公開設定を読み込めませんでした。");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  const togglePrivate = async story => {
    const nextValue = story.access_override === "private_forever" ? "inherit" : "private_forever";
    try {
      setSavingId(story.id);
      const { error } = await supabaseClient
        .from("answers")
        .update({ access_override: nextValue })
        .eq("id", story.id)
        .eq("user_id", user.id);
      if (error) throw error;
      setStories(prev => prev.map(item => item.id === story.id ? { ...item, access_override: nextValue } : item));
    } catch (error) {
      console.error("private story setting save error", error);
      alert("非公開設定を保存できませんでした。");
    } finally {
      setSavingId(null);
    }
  };

  const visibleStories = stories.filter(story => {
    const question = (questionSet || []).find(item => Number(item.sequence_order) === Number(story.sequence_order));
    return question?.include_in_story_list !== false && question?.flow_type !== "onboarding";
  });
  const privateCount = visibleStories.filter(story => story.access_override === "private_forever").length;

  const toggleExpanded = storyId => {
    setExpandedStoryIds(previous => {
      const next = new Set(previous);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 min-h-0 flex flex-col fade-enter px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4">
      <div className="relative flex items-center justify-center h-10 mb-5 shrink-0">
        <button type="button" onClick={onBack} className="absolute left-0 w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center">
          <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
        </button>
        <p className="text-white/88 text-[1rem] text-narrative">語りごとの非公開設定</p>
      </div>
      <div className="shrink-0 glass-card px-5 py-4 mb-4 flex items-center justify-between">
        <p className="text-white/58 text-sm">非公開中</p>
        <p className="text-white/86 text-lg text-narrative">{privateCount}件</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-8">
        {loading && <p className="text-center text-white/38 text-sm py-10">読み込んでいます...</p>}
        {!loading && visibleStories.length === 0 && <p className="text-center text-white/42 text-sm py-10">設定できる語りはまだありません。</p>}
        {visibleStories.map(story => {
          const question = (questionSet || []).find(item => Number(item.sequence_order) === Number(story.sequence_order));
          const isPrivate = story.access_override === "private_forever";
          const body = story.transcript_edited || story.transcript_readable || story.transcript_clean || "";
          const isExpanded = expandedStoryIds.has(story.id);
          const canExpand = body.length > 90;
          return (
            <div key={story.id} className="glass-card p-5">
              <p className="text-white/42 text-xs leading-relaxed mb-3">{question?.content || "残された語り"}</p>
              <p className={`text-white/72 text-sm leading-loose whitespace-pre-wrap ${canExpand && !isExpanded ? "line-clamp-3" : ""} ${canExpand ? "" : "mb-4"}`}>{body}</p>
              {canExpand && (
                <button
                  type="button"
                  onClick={() => toggleExpanded(story.id)}
                  className="mt-2 mb-4 text-white/34 text-xs underline underline-offset-4"
                >
                  {isExpanded ? "閉じる" : "全文を見る"}
                </button>
              )}
              <button
                type="button"
                onClick={() => togglePrivate(story)}
                disabled={savingId === story.id}
                className="w-full flex items-center justify-between rounded-xl border border-white/[0.08] px-4 py-3"
              >
                <span className="text-white/58 text-sm">この語りは自分だけ</span>
                <span className={`relative w-11 h-6 rounded-full transition ${isPrivate ? "bg-amber-100/45" : "bg-white/10"}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition ${isPrivate ? "left-6" : "left-1"}`} />
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Scene_SupporterManagement({
  user,
  foundation,
  sharingPreference,
  onSharingPreferenceChange,
  onBack
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [confirmPrivateChange, setConfirmPrivateChange] = useState(false);
  const sharingFlags = getStorySharingFlags(sharingPreference);
  const isPrivateSharing =
    !sharingFlags.familyEnabled && !sharingFlags.selectedEnabled;

  const loadItems = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabaseClient.rpc("list_owned_project_supporters", {
        input_book_project_id: foundation?.project?.id
      });
      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error("supporter management load error", error);
      alert("お手伝いする方を読み込めませんでした。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [foundation?.project?.id]);

  const openInviteForm = (email = "") => {
    setInviteEmail(typeof email === "string" ? email : "");
    setConfirmPrivateChange(false);
    setShowInviteForm(true);
  };

  const closeInviteForm = () => {
    setShowInviteForm(false);
    setInviteEmail("");
    setConfirmPrivateChange(false);
  };

  const sendInvite = async () => {
    const inviteeEmail = inviteEmail.trim().toLowerCase();

    if (!inviteeEmail) {
      alert("メールアドレスを入力してください。");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteeEmail)) {
      alert("メールアドレスを確認してください。");
      return;
    }

    if (inviteeEmail === String(user?.email || "").trim().toLowerCase()) {
      alert("ご自身以外のメールアドレスを入力してください。");
      return;
    }

    if (isPrivateSharing && !confirmPrivateChange) {
      setConfirmPrivateChange(true);
      return;
    }

    try {
      setSendingInvite(true);
      const result = await createAndSendSupporterInvite({
        user,
        foundation,
        inviteeEmail,
        sharingFlags
      });

      if (result.updatedPreference) {
        onSharingPreferenceChange?.(result.updatedPreference);
      }

      await loadItems();

      if (!result.emailDelivered) {
        console.error("supporter invite email send error", result.sendError);
        alert(
          "依頼は保存しましたが、メールを送信できませんでした。入力欄からもう一度お試しください。"
        );
        return;
      }

      closeInviteForm();
      alert("お手伝いの依頼メールを送りました。");
    } catch (error) {
      console.error("supporter invite save error", error);
      alert("お手伝いの依頼を保存できませんでした。");
    } finally {
      setSendingInvite(false);
    }
  };

  const resendInvite = async item => {
    try {
      setBusyId(item.invite_id);
      const { data, error } = await supabaseClient.functions.invoke("send-supporter-invite", {
        body: { inviteId: item.invite_id }
      });
      if (error || data?.success === false) throw error || new Error(data?.error || "send failed");
      await loadItems();
      alert("依頼メールを再送しました。");
    } catch (error) {
      console.error("supporter invitation resend error", error);
      alert("依頼メールを再送できませんでした。");
    } finally {
      setBusyId(null);
    }
  };

  const endSupport = async item => {
    if (!window.confirm("この方のお手伝いを終了しますか？\nこれ以降、共有中の語りも開けなくなります。")) return;
    try {
      setBusyId(item.supporter_id);
      const { error } = await supabaseClient.rpc("end_project_supporter", {
        input_book_project_id: foundation?.project?.id,
        input_supporter_id: item.supporter_id
      });
      if (error) throw error;
      await loadItems();
    } catch (error) {
      console.error("supporter end error", error);
      alert("お手伝いを終了できませんでした。");
    } finally {
      setBusyId(null);
    }
  };

  const cancelInvite = async item => {
    if (!window.confirm("この依頼を取り消しますか？")) return;
    try {
      setBusyId(item.invite_id);
      const { error } = await supabaseClient.rpc("cancel_supporter_invite", {
        input_book_project_id: foundation?.project?.id,
        input_invite_id: item.invite_id
      });
      if (error) throw error;
      await loadItems();
    } catch (error) {
      console.error("supporter invite cancel error", error);
      alert("依頼を取り消せませんでした。");
    } finally {
      setBusyId(null);
    }
  };

  const statusLabel = { pending: "依頼中", active: "お手伝い中", ended: "終了" };

  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8 overflow-y-auto">
      <div className="relative flex items-center justify-center h-10 mb-8 shrink-0">
        <button type="button" onClick={onBack} className="absolute left-0 w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center">
          <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
        </button>
        <p className="text-white/88 text-[1.02rem] text-narrative">お手伝いする人</p>
      </div>

      <div className="glass-card p-5 mb-6">
        <p className="text-white/56 text-xs leading-[1.9]">
          録音の操作、写真の追加、文章の整理、本づくりをお手伝いできます。共有設定の変更や、非公開の語りの閲覧はできません。
        </p>
      </div>

      <div className="space-y-3 mb-6">
        {loading && <p className="text-center text-white/35 text-sm py-8">読み込んでいます...</p>}
        {!loading && items.length === 0 && <p className="text-center text-white/38 text-sm py-8">お手伝いを依頼した方はまだいません。</p>}
        {items.map(item => (
          <div key={item.invite_id} className="glass-card p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0">
                <p className="text-white/80 text-sm truncate">{item.display_name || item.invitee_email}</p>
                <p className="text-white/32 text-xs truncate mt-1">{item.invitee_email}</p>
              </div>
              <span className={`shrink-0 rounded-full px-3 py-1 text-[0.68rem] ${item.relationship_status === "active" ? "bg-emerald-100/10 text-emerald-100/65" : "bg-white/[0.06] text-white/42"}`}>
                {statusLabel[item.relationship_status] || item.relationship_status}
              </span>
            </div>
            {item.relationship_status === "pending" && (
              <div className="flex gap-4 pt-3 border-t border-white/[0.07]">
                <button type="button" disabled={busyId === item.invite_id} onClick={() => resendInvite(item)} className="text-white/55 text-xs underline underline-offset-4">メールを再送</button>
                <button type="button" disabled={busyId === item.invite_id} onClick={() => cancelInvite(item)} className="text-white/35 text-xs underline underline-offset-4">依頼を取り消す</button>
              </div>
            )}
            {item.relationship_status === "active" && (
              <button type="button" disabled={busyId === item.supporter_id} onClick={() => endSupport(item)} className="mt-3 pt-3 w-full text-left border-t border-white/[0.07] text-white/38 text-xs underline underline-offset-4">お手伝いを終了する</button>
            )}
            {item.relationship_status === "ended" && (
              <button type="button" onClick={() => openInviteForm(item.invitee_email)} className="mt-3 pt-3 w-full text-left border-t border-white/[0.07] text-white/52 text-xs underline underline-offset-4">もう一度依頼する</button>
            )}
          </div>
        ))}
      </div>

      {showInviteForm ? (
        <section className="glass-card p-5 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <p className="text-white/78 text-sm">お手伝いを依頼</p>
            <button
              type="button"
              onClick={closeInviteForm}
              disabled={sendingInvite}
              aria-label="入力を閉じる"
              className="w-8 h-8 rounded-full border border-white/10 text-white/45 disabled:opacity-35"
            >
              ×
            </button>
          </div>

          {confirmPrivateChange && (
            <div className="rounded-xl border border-amber-100/15 bg-amber-100/[0.04] p-4 space-y-2">
              <p className="text-white/74 text-xs leading-loose">
                この方にお手伝いを依頼すると、「自分だけ」の設定から「選んだ人へ共有」に変わります。よろしいですか？
              </p>
              <p className="text-white/38 text-[0.68rem] leading-loose">
                「ずっと自分だけ」にした語りは表示されません。
              </p>
            </div>
          )}

          <div>
            <p className="ui-label mb-2">メールアドレス</p>
            <input
              type="email"
              autoFocus
              className="quiet-input"
              value={inviteEmail}
              onChange={event => {
                setInviteEmail(event.target.value);
                setConfirmPrivateChange(false);
              }}
              onKeyDown={event => {
                if (event.key === "Enter") sendInvite();
              }}
              placeholder="example@email.com"
            />
          </div>

          <button
            type="button"
            onClick={sendInvite}
            disabled={sendingInvite}
            className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white text-sm disabled:opacity-35"
          >
            {sendingInvite
              ? "依頼を送っています..."
              : confirmPrivateChange
                ? "内容を確認して依頼する"
                : "依頼を送る"}
          </button>
        </section>
      ) : (
        <button type="button" onClick={() => openInviteForm()} className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white text-sm">
          新しくお手伝いを依頼する
        </button>
      )}
    </div>
  );
}

function Scene_ProfileSettings({ user, onSaved, onBack }) {
  const [familyName, setFamilyName] = useState(user?.family_name || "");
  const [givenName, setGivenName] = useState(user?.given_name || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const normalizedFamily = familyName.trim();
    const normalizedGiven = givenName.trim();
    if (!normalizedFamily || !normalizedGiven) return;
    try {
      setSaving(true);
      const { data, error } = await supabaseClient.rpc("update_own_profile_name", {
        input_family_name: normalizedFamily,
        input_given_name: normalizedGiven
      });
      if (error) throw error;
      const saved = Array.isArray(data) ? data[0] : data;
      onSaved?.({ ...user, ...saved, name: saved?.display_name || `${normalizedFamily} ${normalizedGiven}` });
    } catch (error) {
      console.error("profile settings save error", error);
      alert("プロフィールを保存できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8 overflow-y-auto">
      <div className="relative flex items-center justify-center h-10 mb-10 shrink-0">
        <button type="button" onClick={onBack} className="absolute left-0 w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center">
          <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
        </button>
        <p className="text-white/88 text-[1.02rem] text-narrative">プロフィール</p>
      </div>
      <div className="space-y-6">
        <div>
          <p className="ui-label mb-2">登録氏名</p>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-white/28 text-xs mb-2">姓</p><input type="text" value={familyName} onChange={event => setFamilyName(event.target.value)} className="quiet-input" /></div>
            <div><p className="text-white/28 text-xs mb-2">名</p><input type="text" value={givenName} onChange={event => setGivenName(event.target.value)} className="quiet-input" /></div>
          </div>
          <p className="text-white/28 text-xs leading-loose mt-3">本や共有の案内に使うため、正確なお名前を登録してください。</p>
        </div>
        <div>
          <p className="ui-label mb-2">メールアドレス</p>
          <div className="quiet-input text-white/42">{user?.email || ""}</div>
        </div>
        <button type="button" onClick={save} disabled={saving || !familyName.trim() || !givenName.trim()} className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white text-sm disabled:opacity-35">
          {saving ? "保存中..." : "プロフィールを保存"}
        </button>
      </div>
    </div>
  );
}

function Scene_QuestionLibrary({ foundation, questionSet = [], onAdded, onBack }) {
  const [mode, setMode] = useState("library");
  const [questionText, setQuestionText] = useState("");
  const [chapter, setChapter] = useState("追加した問い");
  const [position, setPosition] = useState("end");
  const [saving, setSaving] = useState(false);
  const [libraryQuestions, setLibraryQuestions] = useState(questionSet);
  const loadLibraryQuestions = async () => {
    if (!foundation?.project?.id) return;
    const { data, error } = await supabaseClient.from("user_questions").select(`
      id, book_project_id, participant_id, sequence_order, chapter,
      chapter_title_snapshot, chapter_subtitle_snapshot, question_text_snapshot,
      custom_question_text, question_id, is_active, status, answered_at, meta_json,
      questions (id, content, chapter, chapter_id, chapters (id, label, description, display_order))
    `).eq("book_project_id", foundation.project.id).order("sequence_order", { ascending: true });
    if (error) throw error;
    setLibraryQuestions(normalizeUserQuestions(data || []));
  };
  useEffect(() => { loadLibraryQuestions().catch(error => console.error("question library load error", error)); }, [foundation?.project?.id]);
  const visibleQuestions = (libraryQuestions || []).filter(item => item.include_in_story_list !== false);
  const groupedQuestions = visibleQuestions.reduce((groups, item) => {
    const key = item.chapter_label || item.chapter || "これからの問い";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
  const questionStatus = item => {
    if (item.status === "answered" || item.answered_at) return "回答済み";
    if (String(item.question_id || "").startsWith("CUSTOM_")) return "追加した問い";
    if (item.is_active === false) return "停止中";
    return "これから";
  };

  const addQuestion = async (textValue = questionText, chapterValue = chapter) => {
    if (String(textValue || "").trim().length < 4) return;
    try {
      setSaving(true);
      const { error } = await supabaseClient.rpc("add_custom_story_question", {
        input_book_project_id: foundation?.project?.id,
        input_question_text: String(textValue).trim(),
        input_chapter_title: chapterValue,
        input_position: position
      });
      if (error) throw error;
      await onAdded?.();
      await loadLibraryQuestions();
      setQuestionText("");
      setMode("success");
    } catch (error) {
      console.error("custom question add error", error);
      alert("問いを追加できませんでした。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8 overflow-y-auto">
      <div className="relative flex items-center justify-center h-10 mb-8 shrink-0">
        <button type="button" onClick={onBack} className="absolute left-0 w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center">
          <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
        </button>
        <p className="text-white/88 text-[1.02rem] text-narrative">問いを選ぶ・追加する</p>
      </div>

      {mode === "success" ? (
        <div className="flex-1 flex flex-col justify-center text-center space-y-7">
          <p className="text-white/88 text-[1.12rem] text-narrative">問いを追加しました</p>
          <p className="text-white/45 text-sm leading-loose">追加した問いは、これから語る問いの中に並びます。</p>
          <button type="button" onClick={() => setMode("library")} className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white">別の問いも追加する</button>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <p className="text-white/55 text-sm leading-loose mb-6">ここでは、これから届く問いも含めて確認できます。</p>
            <div className="space-y-7">
              {Object.entries(groupedQuestions).map(([chapterName, items]) => (
                <div key={chapterName}>
                  <p className="text-white/35 text-xs tracking-[0.14em] mb-3">{chapterName}</p>
                  <div className="space-y-2">
                    {items.map(item => (
                      <div key={item.user_question_id || item.id} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5">
                        <div className="flex justify-between gap-4 mb-2">
                          <span className="text-white/28 text-[0.65rem]">{questionStatus(item)}</span>
                          <span className="text-white/22 text-[0.65rem]">{item.sequence_order}</span>
                        </div>
                        <p className="text-white/72 text-sm leading-loose">{item.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="pt-7 border-t border-white/[0.08] space-y-4">
            <p className="text-white/38 text-xs tracking-[0.18em]">自分で問いを書く</p>
            <textarea value={questionText} onChange={event => setQuestionText(event.target.value)} placeholder="残しておきたい問いを書いてください" className="quiet-input !bg-white/[0.025] !text-white/80 min-h-[120px] resize-y leading-loose" />
            <input type="text" value={chapter} onChange={event => setChapter(event.target.value)} className="quiet-input" placeholder="章・テーマ" />
          </section>

          <section>
            <p className="text-white/38 text-xs tracking-[0.18em] mb-3">語る順番</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setPosition("next")} className={`rounded-xl border px-4 py-3 text-sm ${position === "next" ? "border-white/35 bg-white/[0.1] text-white/78" : "border-white/[0.08] text-white/42"}`}>次の問いにする</button>
              <button type="button" onClick={() => setPosition("end")} className={`rounded-xl border px-4 py-3 text-sm ${position === "end" ? "border-white/35 bg-white/[0.1] text-white/78" : "border-white/[0.08] text-white/42"}`}>今後に追加する</button>
            </div>
          </section>

          <button type="button" onClick={() => addQuestion()} disabled={saving || questionText.trim().length < 4} className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white disabled:opacity-35">
            {saving ? "追加しています..." : "この問いを追加する"}
          </button>
        </div>
      )}
    </div>
  );
}

function Scene_SupportProjectHome({
  project,
  onOpenQuestions,
  onOpenStories,
  onOpenBookBuilder,
  onBack
}) {
  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8">
      <div className="shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center"
          aria-label="自分のホームへ戻る"
        >
          <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="text-center mb-12 space-y-3">
          <p className="text-white/38 text-xs tracking-[0.18em]">
            物語づくりをお手伝い中
          </p>

          <p className="text-white/86 text-[1.08rem] text-narrative">
            {withHonorific(project?.subject_name || "ご家族")}の物語
          </p>
        </div>

        <div className="space-y-4">
          {project?.can_operate_recording && (
            <HomeMenuButton
              icon={Mic}
              label="問いの録音を手伝う"
              onClick={onOpenQuestions}
            />
          )}

          {(project?.can_edit_book_text || project?.can_build_book) && (
            <HomeMenuButton
              icon={Files}
              label="語りを見る"
              onClick={onOpenStories}
            />
          )}

          {project?.can_build_book && (
            <HomeMenuButton
              icon={BookOpen}
              label="本に仕上げる"
              onClick={onOpenBookBuilder}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function Scene_SupportedStoryPages({
  project,
  questionSet = [],
  storyRows = [],
  mediaByAnswerId = {},
  mode = "supporter",
  onBack
}) {
  const isReceived = mode === "received";
  const isAdmin = mode === "admin";
  const questionBySequence = new Map(
    (questionSet || []).map(question => [
      Number(question.sequence_order),
      question
    ])
  );

  const visibleStories = [...(storyRows || [])]
    .filter(story => String(story.transcript_edited || story.transcript_readable || "").trim())
    .sort((a, b) => Number(a.sequence_order || 0) - Number(b.sequence_order || 0));

  return (
    <div className="fixed inset-0 mx-auto min-h-0 max-w-[600px] bg-[#0f172a] flex flex-col fade-enter px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <div className="shrink-0 relative flex items-center justify-center h-11 mb-5">
        <button
          type="button"
          onClick={onBack}
          className="absolute left-0 w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center"
          aria-label={isAdmin ? "管理画面へ戻る" : isReceived ? "つながっている物語へ戻る" : "お手伝い中のホームへ戻る"}
        >
          <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
        </button>

        <p className="text-white/84 text-[1.02rem] text-narrative">
          語りを見る
        </p>
      </div>

      <div className="shrink-0 text-center mb-7">
        <p className="text-white/38 text-xs tracking-[0.16em] mb-2">
          {isAdmin ? "管理者プレビュー・閲覧専用" : isReceived ? "共有された物語" : "物語づくりをお手伝い中"}
        </p>
        <p className="text-white/72 text-sm">
          {isAdmin
            ? `${project?.subject_name || "名称未登録"}の物語`
            : `${withHonorific(project?.subject_name || "ご家族")}の物語`}
        </p>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-8 space-y-5">
        {visibleStories.length === 0 && (
          <div className="glass-card p-7 text-center">
            <p className="text-white/55 text-sm leading-loose">
              共有されている語りは、まだありません。
            </p>
          </div>
        )}

        {visibleStories.map(story => {
          const question = questionBySequence.get(Number(story.sequence_order));
          const photos = (mediaByAnswerId?.[story.id] || [])
            .filter(item => item.asset_type === "photo" && item.url);

          return (
            <article key={story.id} className="glass-card p-5 space-y-4">
              <div className="space-y-2">
                <p className="text-white/35 text-[0.68rem] tracking-[0.14em]">
                  {question?.chapter_label || question?.chapter || "物語"}
                </p>
                <p className="text-white/62 text-sm leading-loose">
                  {question?.content || "残された語り"}
                </p>
              </div>

              <p className="text-white/86 text-[0.98rem] leading-[2.05] whitespace-pre-wrap text-narrative">
                {story.transcript_edited || story.transcript_readable}
              </p>

              {photos.length > 0 && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {photos.map(photo => (
                    <img
                      key={photo.id}
                      src={photo.url}
                      alt="語りに添えられた写真"
                      className="w-full aspect-square rounded-xl object-cover border border-white/[0.06]"
                    />
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Scene_SupportRecordingAssist({
  user,
  project,
  questionSet = [],
  onSaved,
  onBack
}) {
  const storyQuestions = (questionSet || []).filter(question =>
    question?.flow_type === "story" ||
    question?.onboarding_group === "first_story"
  );
  const nextQuestion =
    storyQuestions.find(question => !question.answer_id && question.status !== "answered") ||
    null;
  const questionIndex = Math.max(
    storyQuestions.findIndex(question => question.user_question_id === nextQuestion?.user_question_id),
    0
  );

  const [phase, setPhase] = useState("question");
  const [recordingData, setRecordingData] = useState(null);
  const [reviewText, setReviewText] = useState("");
  const [essayText, setEssayText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const processRecording = async (transcript, duration, audioUrl, audioBlob) => {
    const answerId = crypto.randomUUID();

    setRecordingData({
      answerId,
      transcript: transcript || "",
      duration,
      audioUrl,
      audioBlob,
      storagePaths: []
    });
    setErrorMessage("");
    setPhase("processing");

    try {
      const contentType = audioBlob?.type || "audio/mp4";
      const ext = contentType.includes("mp4")
        ? "mp4"
        : contentType.includes("aac")
          ? "aac"
          : "webm";
      const storagePath = `${user.id}/${answerId}/part-01.${ext}`;

      const { error: uploadError } = await supabaseClient.storage
        .from("audio")
        .upload(storagePath, audioBlob, {
          contentType,
          upsert: true
        });

      if (uploadError) throw uploadError;

      const transcription = await transcribeAudioOnServer({
        answerId,
        audioPaths: [storagePath],
        fallbackTranscript: transcript || "",
        bookProjectId: project.book_project_id,
        questionText: nextQuestion?.content || "",
        previousTranscript: ""
      });
      const transcriptRaw = String(
        transcription?.transcript_raw || transcription?.transcript || transcript || ""
      ).trim();

      let readable = transcriptRaw;
      let essay = "";

      try {
        const polished = await polishTranscriptOnServer({
          answerId,
          transcriptRaw,
          questionText: nextQuestion?.content || "",
          bookProjectId: project.book_project_id
        });

        readable = String(
          polished?.transcript_readable || polished?.transcript_clean || transcriptRaw
        ).trim();
        essay = String(polished?.transcript_essay || "").trim();
      } catch (polishError) {
        console.warn("supporter recording polish fallback", polishError);
      }

      setRecordingData(prev => ({
        ...prev,
        transcript: transcriptRaw,
        storagePaths: [storagePath]
      }));
      setReviewText(readable);
      setEssayText(essay);
      setPhase("review");
    } catch (error) {
      console.error("supporter recording processing error", error);
      setErrorMessage("音声を保存できませんでした。通信を確認して、もう一度お試しください。");
      setPhase("error");
    }
  };

  const saveRecording = async () => {
    if (!nextQuestion?.user_question_id || !recordingData?.answerId) return;

    try {
      setPhase("saving");
      setErrorMessage("");

      const { error } = await supabaseClient.rpc("save_supporter_recording", {
        input_book_project_id: project.book_project_id,
        input_user_question_id: nextQuestion.user_question_id,
        input_answer_id: recordingData.answerId,
        input_transcript_raw: recordingData.transcript || reviewText,
        input_transcript_readable: reviewText,
        input_transcript_essay: essayText,
        input_selected_style: "readable",
        input_storage_paths: recordingData.storagePaths || [],
        input_duration_seconds: Number(recordingData.duration || 0)
      });

      if (error) throw error;

      await onSaved?.();
      setPhase("success");
    } catch (error) {
      console.error("supporter recording save error", error);
      setErrorMessage("語りを保存できませんでした。もう一度お試しください。");
      setPhase("review");
    }
  };

  if (phase === "recording" && nextQuestion) {
    return (
      <Scene_Recording
        question={nextQuestion}
        progress={{ currentIndex: questionIndex, total: storyQuestions.length }}
        userName={project?.subject_name || "ご家族"}
        onComplete={processRecording}
      />
    );
  }

  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8 overflow-y-auto">
      <div className="shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center"
          aria-label="お手伝い中のホームへ戻る"
        >
          <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center py-8">
        {phase === "question" && nextQuestion && (
          <div className="space-y-8 text-center">
            <div className="space-y-3">
              <p className="text-white/38 text-xs tracking-[0.18em]">
                問いの録音を手伝う
              </p>
              <p className="text-white/78 text-sm">
                {withHonorific(project?.subject_name || "ご家族")}の次の問い
              </p>
            </div>

            <div className="glass-card p-7 space-y-5">
              <p className="text-white/88 text-[1.08rem] leading-[2] text-narrative">
                {nextQuestion.content}
              </p>
              {nextQuestion.reassurance_text && (
                <p className="text-white/42 text-sm leading-loose">
                  {nextQuestion.reassurance_text}
                </p>
              )}
            </div>

            <p className="text-white/38 text-xs leading-loose">
              語り手ご本人のそばで、録音の開始と終了をお手伝いしてください。
            </p>

            <button
              type="button"
              onClick={() => setPhase("recording")}
              className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
            >
              録音を始める
            </button>
          </div>
        )}

        {phase === "question" && !nextQuestion && (
          <div className="glass-card p-7 text-center space-y-3">
            <p className="text-white/75 text-[1rem] text-narrative">
              すべての問いに語りがあります
            </p>
            <p className="text-white/42 text-sm leading-loose">
              語り直しは、語り手ご本人の画面から行えます。
            </p>
          </div>
        )}

        {(phase === "processing" || phase === "saving") && (
          <div className="text-center space-y-6">
            <div className="mx-auto w-8 h-8 rounded-full border-2 border-white/15 border-t-white/55 animate-spin" />
            <p className="text-white/58 text-sm tracking-wider">
              {phase === "saving" ? "語りを保存しています" : "声を文字にしています"}
            </p>
          </div>
        )}

        {phase === "review" && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-white/38 text-xs tracking-[0.18em]">語りを確認</p>
              <p className="text-white/78 text-sm leading-loose">
                語り手ご本人と一緒に、内容をご確認ください。
              </p>
            </div>

            {recordingData?.audioUrl && (
              <audio controls src={recordingData.audioUrl} className="w-full h-10 opacity-60" />
            )}

            <textarea
              value={reviewText}
              onChange={event => setReviewText(event.target.value)}
              className="quiet-input min-h-[220px] resize-y leading-[2]"
            />

            {errorMessage && (
              <p className="text-rose-200/75 text-sm leading-loose text-center">
                {errorMessage}
              </p>
            )}

            <button
              type="button"
              onClick={saveRecording}
              disabled={!reviewText.trim()}
              className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white disabled:opacity-40"
            >
              この内容で保存する
            </button>
          </div>
        )}

        {phase === "error" && (
          <div className="glass-card p-7 text-center space-y-6">
            <p className="text-white/62 text-sm leading-loose">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={() => {
                setRecordingData(null);
                setErrorMessage("");
                setPhase("recording");
              }}
              className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
            >
              もう一度録音する
            </button>
          </div>
        )}

        {phase === "success" && (
          <div className="text-center space-y-8">
            <div className="space-y-4">
              <p className="text-white/88 text-[1.12rem] text-narrative">
                声を保存しました
              </p>
              <p className="text-white/48 text-sm leading-loose">
                語り手ご本人の物語に加わりました。
              </p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
            >
              お手伝い中のホームへ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Scene_BookBuilder({
  user,
  userName,
  questionSet = [],
  initialBookStories = null,
  initialBookMediaByAnswerId = null,
  readOnly = false,
  onBack
}) {
  const steps = readOnly ? ["表紙", "収録", "紙面"] : ["表紙", "収録", "紙面", "注文", "完了"];
  const [stepIndex, setStepIndex] = useState(0);
  const [coverPhoto, setCoverPhoto] = useState(null);
  const [coverColor, setCoverColor] = useState("#1f3a36");
  const [coverStyle, setCoverStyle] = useState("cloth");
  const [bookTitle, setBookTitle] = useState("わたしの物語");
  const [bookSubtitle, setBookSubtitle] = useState("これまでの時間を、家族へ");
  const [coverPhotoCorrectionOpen, setCoverPhotoCorrectionOpen] = useState(false);

  const [bookStories, setBookStories] = useState([]);
  const [bookMediaByAnswerId, setBookMediaByAnswerId] = useState({});
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [includedStoryIds, setIncludedStoryIds] = useState([]);

  const colors = [
    { label: "深緑", value: "#1f3a36" },
    { label: "紺", value: "#0f2747" },
    { label: "水色", value: "#c6d7e9" },
    { label: "薄桃", value: "#e7d3dc" },
    { label: "生成", value: "#d9cdbd" }
  ];

  const getQuestionForAnswer = (answer) => {
    return (questionSet || []).find(q =>
      Number(q.sequence_order) === Number(answer.sequence_order)
    ) || null;
  };

  const getStoryBody = (answer) => {
    if (answer.transcript_edited) return answer.transcript_edited;

    if (answer.selected_style === "clean") {
      return answer.transcript_clean || answer.transcript_raw || "";
    }

    if (answer.selected_style === "essay") {
      return (
        answer.transcript_essay ||
        answer.transcript_readable ||
        answer.transcript_clean ||
        answer.transcript_raw ||
        ""
      );
    }

    return answer.transcript_readable || answer.transcript_clean || answer.transcript_raw || "";
  };

  useEffect(() => {
    const loadBookStories = async () => {
      if (initialBookStories) {
        setBookStories(initialBookStories);
        setIncludedStoryIds(initialBookStories.map(row => row.id));
        setBookMediaByAnswerId(initialBookMediaByAnswerId || {});
        setStoriesLoading(false);
        return;
      }

      if (!user?.id) return;

      try {
        setStoriesLoading(true);

        const { data: answerRows, error: answerError } = await supabaseClient
          .from("answers")
          .select(`
            id,
            book_project_id,
            sequence_order,
            transcript_raw,
            transcript_clean,
            transcript_readable,
            transcript_essay,
            transcript_edited,
            selected_style,
            ai_mirror,
            snippet,
            meta_json,
            created_at
          `)
          .eq("user_id", user.id)
          .order("sequence_order", { ascending: true });

        if (answerError) throw answerError;

        const rows = answerRows || [];
        setBookStories(rows);
        setIncludedStoryIds(rows.map(row => row.id));

        const answerIds = rows.map(row => row.id);

        if (answerIds.length === 0) {
          setBookMediaByAnswerId({});
          return;
        }

        const { data: mediaRows, error: mediaError } = await supabaseClient
          .from("media_assets")
          .select("id, answer_id, asset_type, storage_path, meta_json, created_at")
          .in("answer_id", answerIds)
          .order("created_at", { ascending: true });

        if (mediaError) throw mediaError;

        const grouped = {};

        for (const media of mediaRows || []) {
          if (!grouped[media.answer_id]) grouped[media.answer_id] = [];

          let url = null;

          if (media.asset_type === "photo") {
            const { data: signed } = await supabaseClient.storage
              .from("photos")
              .createSignedUrl(media.storage_path, 60 * 60);

            url = signed?.signedUrl || null;
          }

          if (media.asset_type === "audio") {
            const { data: signed } = await supabaseClient.storage
              .from("audio")
              .createSignedUrl(media.storage_path, 60 * 60);

            url = signed?.signedUrl || null;          
          }

          grouped[media.answer_id].push({ ...media, url });
        }

        setBookMediaByAnswerId(grouped);
      } catch (e) {
        console.error("book stories load error", e);
        alert("語りの読み込みに失敗しました。");
      } finally {
        setStoriesLoading(false);
      }
    };

    loadBookStories();
  }, [user?.id, initialBookStories, initialBookMediaByAnswerId]);

  const handleCoverPhotoSelect = (file) => {
    if (!file?.type?.startsWith("image/")) return;

    if (coverPhoto?.url) {
      try { URL.revokeObjectURL(coverPhoto.url); } catch (e) {}
    }

    setCoverPhoto({
      file,
      url: URL.createObjectURL(file),
      name: file.name || "cover-photo"
    });
    setCoverStyle("photo");
  };

  const includedStories = [...bookStories]
    .filter(answer => includedStoryIds.includes(answer.id))
    .sort((a, b) => Number(a.sequence_order || 0) - Number(b.sequence_order || 0));

  // 横組みの冊子では、右ページを奇数、左ページを偶数にします。
  // 扉を1ページ目とし、最初の見開きは左2・右3から始めます。
  let previewPageNumber = 2;

  let photoStoryCounter = 0;
  const previewPageGroups = includedStories.map(answer => {
    const question = getQuestionForAnswer(answer);
    const media = bookMediaByAnswerId[answer.id] || [];
    const photos = media.filter(item => item.asset_type === "photo" && item.url);
    const headingPhoto = photos[0] || null;
    const additionalPhotos = photos.slice(1);
    const body = getStoryBody(answer);
    const bodyParagraphs = formatBodyForPagePreview(body);
    const isPhotoStory = answer.meta_json?.story_origin === "photo";
    const photoSequence = isPhotoStory ? ++photoStoryCounter : null;

    const leftPageNumber = previewPageNumber;
    const rightPageNumber = previewPageNumber + 1;

    previewPageNumber += 2;

    const photoPages = additionalPhotos.map(photo => {
      const pageNumber = previewPageNumber;
      previewPageNumber += 1;

      return {
        photo,
        pageNumber
      };
    });

    // 写真ページが奇数枚増えた場合は、次の語りが左（偶数）ページから
    // 始まるよう、右ページ分を空けます。
    if (previewPageNumber % 2 !== 0) {
      previewPageNumber += 1;
    }

    return {
      answer,
      question,
      headingPhoto,
      bodyParagraphs,
      leftPageNumber,
      rightPageNumber,
      photoPages,
      isPhotoStory,
      photoSequence,
      photoTitle: answer.meta_json?.print_title || "この一枚のこと",
      photoCaption: answer.meta_json?.photo_caption || ""
    };
  });

  return (
    <div className="fixed inset-0 max-w-[760px] mx-auto min-h-0 bg-[#0f172a] flex flex-col fade-enter px-4 pt-0 pb-4 overflow-hidden">
      {!readOnly && (
        <PhotoCorrectionFlow
          open={coverPhotoCorrectionOpen}
          title="表紙の写真"
          onClose={() => setCoverPhotoCorrectionOpen(false)}
          onComplete={handleCoverPhotoSelect}
        />
      )}
      <div className="shrink-0 pb-3">
        <div className="relative flex items-center justify-center mb-3 h-10">
          <button
            type="button"
            onClick={onBack}
            className="absolute left-0 w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center"
            aria-label="戻る"
          >
            <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
          </button>

          <p className="text-white/90 text-[1.02rem] text-narrative">
            本に仕上げる
          </p>
          {readOnly && (
            <p className="absolute right-0 text-[0.65rem] tracking-wider text-white/35">
              閲覧専用
            </p>
          )}
        </div>

        <div>
          <div className={`grid ${readOnly ? "grid-cols-3" : "grid-cols-5"} gap-2 pb-2`}>
            {steps.map((step, index) => (
              <button
                key={step}
                type="button"
                onClick={() => setStepIndex(index)}
                className="min-w-0"
              >
                <p className={`text-center text-xs tracking-widest mb-2 ${
                  index === stepIndex ? "text-white/78" : "text-white/28"
                }`}>
                  {index + 1}
                </p>

                <div className={`h-1.5 rounded-full ${
                  index === stepIndex ? "bg-white/55" : "bg-white/12"
                }`} />

                <p className={`text-center text-xs mt-2 ${
                  index === stepIndex ? "text-white/78" : "text-white/28"
                }`}>
                  {step}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pb-6">
        {stepIndex === 0 && (
          <div className="space-y-7">

            <div className="relative overflow-hidden rounded-[28px] border border-white/[0.07] bg-gradient-to-b from-white/[0.045] to-transparent px-5 py-6">
              <div className="absolute inset-x-[18%] bottom-7 h-20 bg-amber-100/[0.035] blur-3xl" />
              <p className="relative text-center text-white/28 text-[0.62rem] tracking-[0.25em] mb-1">
                COVER PREVIEW
              </p>

            <BookCoverPreview
              title={bookTitle}
              subtitle={bookSubtitle}
              authorName={withHonorific(userName)}
              coverPhoto={coverPhoto}
              coverColor={coverColor}
              coverStyle={coverStyle}
            />
            </div>

            {!readOnly && <div className="glass-card p-5">
              <p className="text-white/82 text-[1.05rem] text-narrative mb-5">
                表紙デザイン
              </p>

              <div className="mb-7">
                <p className="text-white/40 text-xs tracking-widest mb-3">
                  仕立て
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "cloth", label: "布張り", detail: "静かな質感" },
                    { value: "photo", label: "写真", detail: "一枚を添える" },
                    { value: "minimal", label: "余白", detail: "生成りの紙" }
                  ].map(style => (
                    <button
                      key={style.value}
                      type="button"
                      onClick={() => setCoverStyle(style.value)}
                      className={`rounded-2xl border px-2 py-4 text-center transition ${
                        coverStyle === style.value
                          ? "border-amber-100/35 bg-amber-50/[0.08]"
                          : "border-white/[0.08] bg-white/[0.018]"
                      }`}
                    >
                      <span className="block text-white/72 text-sm mb-1">{style.label}</span>
                      <span className="block text-white/30 text-[0.62rem] leading-relaxed">{style.detail}</span>
                    </button>
                  ))}
                </div>
              </div>

              {coverStyle === "photo" && (
                <button
                  type="button"
                  onClick={() => setCoverPhotoCorrectionOpen(true)}
                  className="btn-quiet w-full py-4 rounded-full text-white/80 mb-6"
                >
                  {coverPhoto ? "表紙の写真を変える" : "表紙に写真を添える"}
                </button>
              )}

              {coverStyle !== "minimal" && (
              <div className="mb-6">
                <p className="text-white/40 text-xs tracking-widest mb-3">
                  表紙の色
                </p>

                <div className="flex gap-3">
                  {colors.map(color => (
                    <button
                      key={color.value}
                      type="button"
                      onClick={() => setCoverColor(color.value)}
                      className={`w-10 h-10 rounded-full border transition ${
                        coverColor === color.value
                          ? "border-white scale-105"
                          : "border-white/15"
                      }`}
                      style={{ backgroundColor: color.value }}
                      aria-label={color.label}
                    />
                  ))}
                </div>
              </div>
              )}

              <div className="mb-5">
                <p className="text-white/40 text-xs tracking-widest mb-2">
                  タイトル
                </p>

                <input
                  type="text"
                  value={bookTitle}
                  onChange={e => setBookTitle(e.target.value)}
                  className="quiet-input"
                />
              </div>

              <div>
                <p className="text-white/40 text-xs tracking-widest mb-2">
                  副題
                </p>

                <input
                  type="text"
                  value={bookSubtitle}
                  onChange={e => setBookSubtitle(e.target.value)}
                  className="quiet-input"
                />
              </div>
            </div>}
          </div>
        )}

        {stepIndex === 1 && (
          <div className="space-y-4">
            <div className="glass-card p-5">
              <p className="text-white/82 text-[1.05rem] text-narrative mb-2">
                語りの確認
              </p>

              <p className="text-white/40 text-xs tracking-widest">
                {includedStoryIds.length} / {bookStories.length} ページ
              </p>
            </div>

            {storiesLoading ? (
              <div className="glass-card p-6 text-center">
                <p className="text-white/35 text-sm tracking-widest animate-pulse">
                  読み込んでいます...
                </p>
              </div>
            ) : bookStories.length === 0 ? (
              <div className="glass-card p-6 text-center">
                <p className="text-white/40 text-sm">
                  まだ語りがありません
                </p>
              </div>
            ) : (
                            [...bookStories]
                .sort((a, b) => Number(a.sequence_order || 0) - Number(b.sequence_order || 0))
                .map((answer, index) => {

                  const included = includedStoryIds.includes(answer.id);
                  const question = getQuestionForAnswer(answer);
                  const body = getStoryBody(answer);
                  const media = bookMediaByAnswerId[answer.id] || [];
                  const photo = media.find(item => item.asset_type === "photo" && item.url);
                  const isShort = String(body || "").trim().length < 80;

                  return (
                    <div
                      key={answer.id}
                      className={`glass-card p-4 transition ${
                        included ? "" : "opacity-45 grayscale"
                      }`}
                    >
                      <div className="flex gap-4">
                        <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                          {photo ? (
                            <img src={photo.url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Files size={22} className="text-white/25" strokeWidth={1.7} />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <p className="text-white/78 text-[0.92rem] leading-relaxed text-narrative line-clamp-2">
                            {question?.content || answer.ai_mirror || answer.snippet || `語り ${index + 1}`}
                          </p>

                          <div className="mt-2 space-y-1">
                            {!included && (
                              <p className="text-white/35 text-xs">
                                本には入りません
                              </p>
                            )}

                            {isShort && included && (
                              <p className="text-amber-300/75 text-xs">
                                本文が短い可能性があります
                              </p>
                            )}

                          </div>
                        </div>
                      </div>

                      {!readOnly && <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3">
                        <p className={`text-sm ${included ? "text-white/65" : "text-white/35"}`}>
                          収録する
                        </p>

                        <button
                          type="button"
                          aria-pressed={included}
                          onClick={() => {
                            setIncludedStoryIds(prev =>
                              prev.includes(answer.id)
                                ? prev.filter(id => id !== answer.id)
                                : [...prev, answer.id]
                            );
                          }}
                          className={`relative w-14 h-8 rounded-full transition ${
                            included
                              ? "bg-emerald-700/85"
                              : "bg-white/12"
                          }`}
                        >
                          <span
                            className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${
                              included ? "left-7" : "left-1"
                            }`}
                          />
                        </button>
                      </div>}
                    </div>
                  );
                })
            )}
          </div>
        )}

        {stepIndex === 2 && (
          <div className="space-y-5">
            <div className="glass-card p-5 text-center">
              <p className="text-white/82 text-[1.05rem] text-narrative mb-3">
                紙面プレビュー
              </p>

              <p className="text-white/45 text-sm leading-loose">
                語った言葉が、このような紙面になります。
              </p>

              <p className="mt-4 text-white/32 text-xs leading-loose">
                ※ 実際の書籍では、読みやすさに合わせて余白や改行を整えます。
              </p>
            </div>

            {previewPageGroups.length === 0 ? (
              <div className="glass-card p-6 text-center">
                <p className="text-white/40 text-sm leading-loose">
                  収録する語りを選ぶと、紙面プレビューが表示されます。
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {previewPageGroups.map(group => (
                  <div key={group.answer.id} className="space-y-5">
                    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.018] p-3 sm:p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-1 items-start">
                        <BookPagePreview
                          type="left"
                          pageNumber={group.leftPageNumber}
                          sequenceOrder={group.answer.sequence_order}
                          questionText={group.question?.content || ""}
                          headingPhoto={group.headingPhoto}
                          isPhotoStory={group.isPhotoStory}
                          photoSequence={group.photoSequence}
                          photoCaption={group.photoCaption}
                          {...(group.isPhotoStory ? { questionText: group.photoTitle } : {})}
                        />

                        <BookPagePreview
                          type="right"
                          pageNumber={group.rightPageNumber}
                          bodyParagraphs={group.bodyParagraphs}
                        />
                      </div>
                    </div>

                    {group.photoPages.map(photoPage => (
                      <BookPagePreview
                        key={photoPage.photo.storage_path || photoPage.pageNumber}
                        type="photo"
                        pageNumber={photoPage.pageNumber}
                        photo={photoPage.photo}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {stepIndex >= 3 && (
          <div className="glass-card p-6 text-center opacity-60">
            <p className="text-white/82 text-[1.05rem] text-narrative mb-5">
              {steps[stepIndex]}
            </p>

            <p className="text-white/40 text-sm leading-loose">
              準備中
            </p>
          </div>
        )}

        <div className="pt-5 border-t border-white/10 flex gap-3">
          <button
            type="button"
            onClick={stepIndex === 0 ? onBack : () => setStepIndex(prev => Math.max(prev - 1, 0))}
            className="flex-1 py-3 rounded-full border border-white/10 text-white/45 text-sm"
          >
            戻る
          </button>

          <button
            type="button"
            onClick={() => setStepIndex(prev => Math.min(prev + 1, steps.length - 1))}
            disabled={stepIndex >= steps.length - 1}
            className={`flex-1 btn-quiet bg-white/10 py-3 rounded-full text-white text-sm ${
              stepIndex >= steps.length - 1 ? "opacity-40" : ""
            }`}
            >
              次へ
            </button>
          </div>

      </div>

    </div>
  );
}

function Scene0_Door({ onNext }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center fade-enter px-4">
      <div className="space-y-6 mb-16 text-narrative">
        <p className="text-[1.1rem] text-white/90">
          この時間は、少し落ち着いて<br/>過ごせるときに開いてみてください
        </p>
      </div>

      <button
        onClick={onNext}
        className="btn-quiet w-full max-w-[280px] py-4 rounded-full text-sm"
      >
        この時間を始める
      </button>
    </div>
  );
}

function Scene1_MyPage({
  progress,
  storyProgress = progress,
  question,
  userName,
  onNext,
  onSkip,
  onEndToday
}) {
  const isFormalOnboarding = isFormalOnboardingQuestion(question);
  const isFirstStory = isFirstStoryQuestion(question);
  const isOnboardingQuestion = isFormalOnboarding;

  const sectionLabel = isFormalOnboarding
    ? question.onboarding_group === "voice_intro"
      ? "物語の入口"
      : "人生の輪郭"
    : question.chapter_description || question.chapter || question.chapter_label;

  return (
    <div className="h-full flex flex-col fade-enter">
      <header className="mb-8 pt-2">
        {isFormalOnboarding && (
          <OnboardingProgress
            current={
              question.onboarding_group === "voice_intro"
                ? "entry"
                : "outline"
            }
          />
        )}

        {isFirstStory && !isFormalOnboarding && (
          <OnboardingProgress current="weekly" />
        )}

        <h1 className="text-white/70 text-sm tracking-widest mb-6">
          {withHonorific(userName)}の物語
        </h1>

        <div className="space-y-2">
          <p className="text-white/60 text-sm tracking-widest">
            {sectionLabel}
          </p>

          {!isOnboardingQuestion && (
            <>
              <div className="w-full h-[2px] bg-white/10 rounded-full">
                <div
                  className="h-full bg-white/40"
                  style={{
                    width: `${((storyProgress.currentIndex + 1) / Math.max(storyProgress.total, 1)) * 100}%`
                  }}
                />
              </div>
            </>
          )}

          {isFormalOnboarding && question.progress_label && (
            <p className="text-white/55 text-sm tracking-widest mt-2">
              {question.progress_label}
            </p>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center">
        <div className="glass-card p-6 text-center space-y-6">
          <p className="text-[1.1rem] text-narrative text-white/90 whitespace-pre-wrap">
            {question.content}
          </p>

          {(question.prompt_hint || question.reassurance_text) && (
            <div className="pt-1 space-y-2">
              {question.prompt_hint && (
                <p className="text-white/55 text-sm leading-loose">
                  {question.prompt_hint}
                </p>
              )}

              {question.reassurance_text && (
                <p className="text-white/38 text-xs leading-loose">
                  {question.reassurance_text}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-4 mt-8 pb-8">
        <button
          onClick={onNext}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full tracking-widest text-white"
        >
          録音を始める
        </button>

        {!isTokenMode() && !isOnboardingQuestion && (
          <button
            onClick={onSkip}
            className="w-full py-3 text-white/40 text-sm underline underline-offset-4"
          >
            スキップ
          </button>
        )}

        {!isTokenMode() && (
          <button
            onClick={onEndToday}
            className="w-full py-3 text-white/40 text-sm underline underline-offset-4"
          >
            今日はここまで
          </button>
        )}
      </div>
    </div>
  );
}

function VoiceWave({ level = 0 }) {
  const bars = [0.24, 0.38, 0.56, 0.78, 0.62, 0.44, 0.3, 0.5, 0.72, 0.54, 0.34, 0.26];

  const noiseFloor = 0.08;
  const activeLevel = level > noiseFloor
    ? Math.min(1, (level - noiseFloor) * 2.2)
    : 0;

  return (
    <div className="voice-wave" aria-hidden="true">
      {bars.map((base, index) => {
        const height = Math.max(
          8,
          Math.min(52, 8 + base * 10 + activeLevel * base * 46)
        );

        return (
          <div
            key={index}
            className="voice-wave-bar"
            style={{
              height: `${height}px`,
              opacity: 0.5
            }}
          />
        );
      })}
    </div>
  );
}

function QuietRecordingCircle({ seconds = 0, isPaused = false }) {
  const cycleSeconds = 180;
  const progress = ((Number(seconds || 0) % cycleSeconds) / cycleSeconds) * 100;

  return (
    <div
      className="relative w-24 h-24 mx-auto"
      role="status"
      aria-label={isPaused ? "一時停止中" : "録音中"}
    >
      <div
        className={`absolute inset-0 rounded-full quiet-recording-progress ${isPaused ? "opacity-35" : ""}`}
        style={{
          background: `conic-gradient(rgba(184,95,58,0.52) ${progress}%, rgba(255,255,255,0.075) ${progress}% 100%)`
        }}
      />

      <div className="absolute inset-[3px] rounded-full bg-[#0f172a]" />

      <div className="absolute inset-[15px] rounded-full border border-white/[0.045] bg-white/[0.012]" />

      {isPaused && (
        <span className="absolute inset-0 flex items-center justify-center text-white/62 text-[0.68rem] tracking-[0.08em]">
          一時停止中
        </span>
      )}
    </div>
  );
}

function Scene_DailyMicCheck({ onComplete }) {
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [micStatus, setMicStatus] = useState("checking");

  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const waveTimerRef = useRef(null);

  useEffect(() => {
    startCheck();

    return () => {
      stopCheck();
    };
  }, []);

  const stopCheck = () => {
    if (waveTimerRef.current) {
      clearInterval(waveTimerRef.current);
      waveTimerRef.current = null;
    }

    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (e) {}
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const startCheck = async () => {
    setShowHelp(false);
    setVoiceLevel(0);
    setMicStatus("checking");
    stopCheck();
 
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      streamRef.current = stream;
      setMicStatus("ready");

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();

      analyser.fftSize = 256;
      source.connect(analyser);

      audioContextRef.current = ctx;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      waveTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const value = (dataArray[i] - 128) / 128;
          sum += value * value;
        }

        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(1, rms * 5);

        setVoiceLevel(level > 0.08 ? level : 0);
      }, 120);
    } catch (e) {
      console.error(e);
      setMicStatus("error");
      setShowHelp(true);
    }
  };

  const proceed = () => {
    stopCheck();
    onComplete();
  };

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-6 text-center">
      <div className="space-y-6 mb-10 text-narrative">
        <p className="text-white/90 text-[1.08rem]">
          声の届き方を確認します
        </p>

        <p className="text-white/60 text-[0.98rem] leading-loose">
          ひとこと、声を出してみてください。<br />
          波形が動けば準備できています。
        </p>
      </div>

      <div className="glass-card py-8 px-5 w-full max-w-[320px] mb-8">
      <p className="text-white/45 text-sm leading-loose mb-6">
        {micStatus === "checking"
          ? "マイクを確認しています。"
          : micStatus === "ready"
            ? "声を出すと、波形が少し動きます。"
            : "マイクを確認できませんでした。"}
      </p>

        <VoiceWave level={voiceLevel} />
      </div>

      {showHelp && (
        <div className="glass-card p-5 w-full max-w-[320px] mb-8">
          <p className="text-white/75 text-sm leading-loose mb-3">
            {micStatus === "error"
              ? "マイクを確認できませんでした。"
              : "波形が動かない場合"}
          </p>

          <p className="text-white/48 text-sm leading-loose">
            {micStatus === "error"
              ? "ブラウザのマイク許可を確認して、もう一度試してください。"
              : "少し大きめの声で話してみてください。端末のマイク部分を手でふさいでいないかも確認してください。"}
          </p>

          <button
            type="button"
            onClick={startCheck}
            className="mt-5 btn-quiet bg-white/10 w-full py-3 rounded-full text-white"
          >
            もう一度試す
          </button>
        </div>
      )}

      {!showHelp && (
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="mb-8 text-white/40 text-sm underline underline-offset-4 leading-loose"
        >
          波形が動かない場合は、こちらをクリック
        </button>
      )}

      <button
        type="button"
        onClick={proceed}
        disabled={micStatus === "checking"}
        className={`btn-quiet bg-white/10 w-full max-w-[280px] py-4 rounded-full text-white ${
          micStatus === "checking" ? "opacity-40" : ""
        }`}
      >
        {micStatus === "checking" ? "確認中..." : "問いに進む"}
      </button>
    </div>
  );
}

function Scene_Recording({
  question,
  progress,
  storyProgress = progress,
  userName,
  autoStart = false,
  onComplete
}) {
  const [step, setStep] = useState(autoStart ? "checking_mic" : 0);
  const [time, setTime] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const hasStartedRecordingRef = useRef(false);
  const autoStartRequestedRef = useRef(false);
  const timeRef = useRef(0);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [waveTick, setWaveTick] = useState(0);


  const mediaRef = useRef(null);
  const suppressCompleteRef = useRef(false);
  const chunksRef = useRef([]);
  const speechRef = useRef(null);
  const mimeTypeRef = useRef("");
  const streamRef = useRef(null);
  const recordingTimerRef = useRef(null);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const waveTimerRef = useRef(null);

  const transcriptRef = useRef("");
  const interimRef = useRef("");

  const isFormalOnboarding = isFormalOnboardingQuestion(question);
  const isFirstStory = isFirstStoryQuestion(question);
  const isOnboardingQuestion = isFormalOnboarding;

  const sectionLabel = isFormalOnboarding
    ? question.onboarding_group === "voice_intro"
      ? "物語の入口"
      : "人生の輪郭"
    : question.chapter_description || question.chapter || question.chapter_label;

  const isIOSLikeBrowser = () => {
    const ua = navigator.userAgent || "";

    return (
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  };

  const debugRunIdRef = useRef(
    `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  const getStreamDebug = (stream = streamRef.current) => ({
    exists: !!stream,
    active: stream?.active || false,
    tracks: stream?.getTracks?.().map(track => ({
      kind: track.kind,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      label: track.label
    })) || []
  });

  const getChunksDebug = () => ({
    count: chunksRef.current.length,
    totalSize: chunksRef.current.reduce((sum, chunk) => sum + (chunk?.size || 0), 0),
    items: chunksRef.current.map((chunk, index) => ({
      index,
      size: chunk?.size || 0,
      type: chunk?.type || ""
    }))
  });

  const logRecordingDebug = (label, extra = {}) => {
    console.log(`[recording-debug] ${label}`, {
      runId: debugRunIdRef.current,
      step,
      time: timeRef.current,
      mediaState: mediaRef.current?.state || null,
      mimeType: mimeTypeRef.current || "",
      stream: getStreamDebug(),
      chunks: getChunksDebug(),
      ...extra
    });
  };

useEffect(() => {
  if (recordingTimerRef.current) {
    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

  if (step === 1 && !isPaused) {
    recordingTimerRef.current = setInterval(() => {
      setTime(t => {
        const next = t + 1;
        timeRef.current = next;
        return next;
      });
    }, 1000);

    document.body.classList.add("is-recording");
  } else {
    document.body.classList.remove("is-recording");
  }

  return () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    document.body.classList.remove("is-recording");
  };
}, [step, isPaused]);

useEffect(() => {
    console.log("[recording-debug] mounted", {
    runId: debugRunIdRef.current
    });

  return () => {
    console.log("[recording-debug] unmount cleanup", {
      runId: debugRunIdRef.current,
      mediaState: mediaRef.current?.state || null,
      stream: getStreamDebug(),
      chunks: getChunksDebug(),
      suppressComplete: suppressCompleteRef.current
    });

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (speechRef.current) {
      try { speechRef.current.stop(); } catch (e) {}
      speechRef.current = null;
    }

    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      suppressCompleteRef.current = true;
      try { mediaRef.current.stop(); } catch (e) {}
    }

    stopWaveMonitor();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      streamRef.current = null;
    }

    document.body.classList.remove("is-recording");
  };
}, []);


useEffect(() => {
  if (step !== "countdown") return;

  setCountdown(3);
  hasStartedRecordingRef.current = false;

  const timer = setInterval(() => {
    setCountdown(current => {
      const next = current - 1;

      if (next === 1 && !hasStartedRecordingRef.current) {
        hasStartedRecordingRef.current = true;
        startActualRecording();
      }

      if (next <= 0) {
        clearInterval(timer);
        setStep(1);
        return 1;
      }

      return next;
    });
  }, 1000);

  return () => clearInterval(timer);
}, [step, isPaused]);

  const startWaveMonitor = async (stream) => {
    if (isIOSLikeBrowser()) {
      console.log("[recording-debug] wave monitor skipped on iOS", {
        runId: debugRunIdRef.current,
        stream: getStreamDebug(stream)
      });

      return;
    }

    try {
      stopWaveMonitor();

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();

      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch (e) {
          console.warn("audio context resume failed", e);
        }
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();

      analyser.fftSize = 256;
      source.connect(analyser);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      waveTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(dataArray);

        let sum = 0;

        for (let i = 0; i < dataArray.length; i++) {
          const value = (dataArray[i] - 128) / 128;
          sum += value * value;
        }

        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(1, rms * 5);

        setVoiceLevel(level > 0.08 ? level : 0);
        setWaveTick(t => t + 1);
      }, 120);
    } catch (e) {
      console.warn("wave monitor failed", e);
    }
  };



  const stopWaveMonitor = () => {
    if (waveTimerRef.current) {
      clearInterval(waveTimerRef.current);
      waveTimerRef.current = null;
    }

    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch (e) {}
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setVoiceLevel(0);
  };

  const getSupportedMimeType = () => {
    const types = [
      "audio/mp4",
      "audio/aac",
      "audio/webm;codecs=opus",
      "audio/webm"
    ];

    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";

    return types.find(type => MediaRecorder.isTypeSupported(type)) || "";
  };

const start = async () => {
  setStep("checking_mic");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    streamRef.current = stream;

    console.log("[recording-debug] recorder-first: wave monitor not started before recorder", {
      runId: debugRunIdRef.current,
      stream: getStreamDebug(stream)
    });

    setCountdown(3);
    hasStartedRecordingRef.current = false;
    setStep("countdown");

  } catch (e) {
    console.error(e);
    setStep("mic_error");
  }
};

useEffect(() => {
  if (!autoStart || autoStartRequestedRef.current) return;

  autoStartRequestedRef.current = true;
  start();
}, [autoStart]);


const startActualRecording = async (preparedStream = null) => {
  logRecordingDebug("startActualRecording called", {
    preparedStreamExists: !!preparedStream,
    hasAnalyser: !!analyserRef.current
  });

  suppressCompleteRef.current = false;

  setTime(0);
  timeRef.current = 0;
  setIsPaused(false);
  setVoiceLevel(0);

    transcriptRef.current = "";
    interimRef.current = "";
    chunksRef.current = [];

    try {
    let stream = streamRef.current;

    if (!stream) {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });

      streamRef.current = stream;
    }

      const mimeType = getSupportedMimeType();

      mimeTypeRef.current = mimeType;

      console.log("[recording-debug] before MediaRecorder create", {
        runId: debugRunIdRef.current,
        selectedMimeType: mimeType,
        stream: getStreamDebug(stream),
        mediaRecorderSupported: !!window.MediaRecorder
      });

      mediaRef.current = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      console.log("[recording-debug] MediaRecorder created", {
        runId: debugRunIdRef.current,
        recorderState: mediaRef.current?.state || null,
        recorderMimeType: mediaRef.current?.mimeType || null
      });

      mediaRef.current.ondataavailable = e => {
        console.log("[recording-debug] dataavailable", {
          runId: debugRunIdRef.current,
          size: e.data?.size || 0,
          type: e.data?.type || "",
          recorderState: mediaRef.current?.state || null,
          chunksBefore: chunksRef.current.length
        });

        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRef.current.onerror = e => {
        console.error("[recording-debug] MediaRecorder error", {
          runId: debugRunIdRef.current,
          error: e
        });
      };

mediaRef.current.onstop = () => {
  console.log("[recording-debug] MediaRecorder onstop", {
    runId: debugRunIdRef.current,
    suppressComplete: suppressCompleteRef.current,
    mediaState: mediaRef.current?.state || null,
    finalMimeType: mimeTypeRef.current || mediaRef.current?.mimeType || "",
    chunks: getChunksDebug(),
    stream: getStreamDebug(),
    duration: timeRef.current,
    transcriptRef: transcriptRef.current,
    interimRef: interimRef.current
  });

  if (suppressCompleteRef.current) {
    stopWaveMonitor();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }

    mediaRef.current = null;
    return;
  }

  const finalMimeType =
    mimeTypeRef.current ||
    mediaRef.current?.mimeType ||
    "audio/mp4";

        const blob = new Blob(chunksRef.current, {
          type: finalMimeType
        });

        console.log("[recording-debug] blob created", {
          runId: debugRunIdRef.current,
          blobType: blob.type,
          blobSize: blob.size,
          chunks: getChunksDebug(),
          duration: timeRef.current
        });

        if (!blob.size) {
          console.warn("[recording-debug] empty blob detected", {
            runId: debugRunIdRef.current,
            duration: timeRef.current,
            chunks: getChunksDebug(),
            stream: getStreamDebug()
          });

          stopWaveMonitor();

          if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
          }

          mediaRef.current = null;

          alert("音声をうまく取得できませんでした。もう一度、録音をお試しください。");
          setStep(0);
          return;
        }

        const url = URL.createObjectURL(blob);

        const finalTranscript = formatTranscriptForReading([
          transcriptRef.current,
          interimRef.current
        ].filter(Boolean).join(" "));

        onComplete(
          finalTranscript,
          timeRef.current,
          url,
          blob
        );

        stopWaveMonitor();

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }

        mediaRef.current = null;

      };

mediaRef.current.start(1000);

console.log("[recording-debug] MediaRecorder started with timeslice", {
  runId: debugRunIdRef.current,
  recorderState: mediaRef.current.state,
  recorderMimeType: mediaRef.current.mimeType,
  timesliceMs: 1000
});

console.log("[recording-debug] recorder-only: wave monitor not used while recording", {
  runId: debugRunIdRef.current,
  stream: getStreamDebug(stream),
  isIOSLikeBrowser: isIOSLikeBrowser()
});

      // This is only a fallback transcript for now.
      // It is not shown during recording, to keep the user immersed in speaking.
      const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

      if (SpeechRec) {
        speechRef.current = new SpeechRec();
        speechRef.current.lang = "ja-JP";
        speechRef.current.continuous = true;
        speechRef.current.interimResults = true;

        speechRef.current.onresult = e => {
          let finalText = "";
          let interimText = "";

          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              finalText += e.results[i][0].transcript;
            } else {
              interimText += e.results[i][0].transcript;
            }
          }

          if (finalText) {
            transcriptRef.current = `${transcriptRef.current} ${finalText}`.trim();
          }

          interimRef.current = interimText;
        };

        try {
          speechRef.current.start();
        } catch (e) {
          console.warn("speech recognition start failed", e);
        }
      }
    } catch (e) {
      console.error(e);
      stopWaveMonitor();
      alert("マイクが使えません: " + e.message);
      setStep(0);
    }
  };

const pauseRecording = () => {
  setIsPaused(true);

  if (recordingTimerRef.current) {
    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

    if (mediaRef.current && mediaRef.current.state === "recording") {
      try {
        mediaRef.current.pause();
      } catch (e) {
        console.warn("media recorder pause failed", e);
      }
    }

    if (speechRef.current) {
      try { speechRef.current.stop(); } catch (e) {}
    }

  };

  const resumeRecording = async () => {
    setIsPaused(false);

    if (mediaRef.current && mediaRef.current.state === "paused") {
      try {
        mediaRef.current.resume();
      } catch (e) {
        console.warn("media recorder resume failed", e);
      }
    }

    if (speechRef.current) {
      try {
        speechRef.current.start();
      } catch (e) {
        console.warn("speech recognition resume failed", e);
      }
    }
  };

const stop = () => {
  logRecordingDebug("stop clicked", {
    speechExists: !!speechRef.current,
    suppressComplete: suppressCompleteRef.current
  });

  setIsPaused(false);

  if (recordingTimerRef.current) {
    clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = null;
  }

  setStep(2);

  if (speechRef.current) {
    try { speechRef.current.stop(); } catch (e) {}
  }

  setTimeout(() => {
    logRecordingDebug("stop timeout fired");

    if (mediaRef.current && mediaRef.current.state !== "inactive") {
      console.log("[recording-debug] calling mediaRecorder.stop", {
        runId: debugRunIdRef.current,
        mediaState: mediaRef.current.state
      });

      try {
        mediaRef.current.requestData?.();
      } catch (e) {
        console.warn("media recorder requestData failed", e);
      }

      mediaRef.current.stop();

    } else {
      console.warn("[recording-debug] mediaRecorder not stoppable, fallback null audio", {
        runId: debugRunIdRef.current,
        mediaExists: !!mediaRef.current,
        mediaState: mediaRef.current?.state || null,
        chunks: getChunksDebug(),
        stream: getStreamDebug()
      });

      stopWaveMonitor();

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      mediaRef.current = null;

      alert("録音をうまく終了できませんでした。もう一度、録音をお試しください。");
      setStep(0);

    }
  }, 1200);
};

return (
<div className="h-full flex flex-col text-center pt-2 overflow-y-auto">
  <header className="mb-6 text-left">
    {isFormalOnboarding && (
      <OnboardingProgress
        current={
          question.onboarding_group === "voice_intro"
            ? "entry"
            : "outline"
        }
      />
    )}

    {isFirstStory && !isFormalOnboarding && (
      <OnboardingProgress current="weekly" />
    )}

    <h1 className="text-white/70 text-sm tracking-widest mb-5">
      {withHonorific(userName)}の物語
    </h1>

    <div className="space-y-2">
      <p className="text-white/60 text-sm tracking-widest">
        {sectionLabel}
      </p>

      {!isOnboardingQuestion && (
        <>
          <div className="w-full h-[2px] bg-white/10 rounded-full">
            <div
              className="h-full bg-white/40"
              style={{
                width: `${((storyProgress.currentIndex + 1) / Math.max(storyProgress.total, 1)) * 100}%`
              }}
            />
          </div>
        </>
      )}

      {isFormalOnboarding && question.progress_label && (
        <p className="text-white/55 text-sm tracking-widest mt-2">
          {question.progress_label}
        </p>
      )}
    </div>
  </header>

  <div className="flex-1 flex flex-col justify-center">
    <div className="glass-card p-6 text-center space-y-6">
      <p className="text-[1.1rem] text-narrative text-white/90 whitespace-pre-wrap">
        {question.content}
      </p>

      {(question.prompt_hint || question.reassurance_text) && (
        <div className="pt-1 space-y-2">
          {question.prompt_hint && (
            <p className="text-white/55 text-sm leading-loose">
              {question.prompt_hint}
            </p>
          )}

          {question.reassurance_text && (
            <p className="text-white/38 text-xs leading-loose">
              {question.reassurance_text}
            </p>
          )}
        </div>
      )}
    </div>
  </div>

{step === 0 && (
  <div className="pb-12 pt-10">
    <button
      onClick={start}
      className="btn-quiet bg-white/10 w-full py-5 rounded-full text-white"
    >
      録音をはじめる
    </button>
  </div>
)}

      {step === "checking_mic" && (
        <div className="pb-16 text-center fade-enter">
          <p className="text-white/70 text-[1.05rem] text-narrative">
            マイクを確認しています
          </p>
        </div>
      )}

      {step === "mic_error" && (
        <div className="pb-12 text-center fade-enter">
          <div className="glass-card p-6 mb-8">
            <p className="text-white/85 text-[1.05rem] text-narrative mb-4">
              マイクが使えませんでした
            </p>

            <p className="text-white/55 text-sm leading-loose">
              ブラウザの設定で、マイクの使用を許可してください。
            </p>
          </div>

          <button
            onClick={start}
            className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
          >
            もう一度試す
          </button>
        </div>
      )}

      {step === "countdown" && (
        <div className="pb-10 pt-12 text-center fade-enter">
          <p className="text-white/82 text-[4.2rem] leading-none font-light">
            {countdown}
          </p>
         </div>
      )}

{step === 1 && (
  <div className="space-y-6 pb-8 pt-3">

<div className="py-5 px-4">
  <QuietRecordingCircle seconds={time} isPaused={isPaused} />

  <p className="mt-5 text-white/42 text-[0.82rem] tracking-[0.18em]">
    {Math.floor(time / 60)}:{String(time % 60).padStart(2, "0")}
  </p>
</div>

          <div className="flex items-center justify-center gap-10">
          <button
            type="button"
            onClick={isPaused ? resumeRecording : pauseRecording}
            className="w-20 h-20 rounded-full border border-white/16 bg-white/[0.09] text-white/88 shadow-lg flex items-center justify-center"
            aria-label={isPaused ? "録音を再開" : "録音を一時停止"}
          >
            {isPaused ? (
              <Play size={29} strokeWidth={1.5} fill="currentColor" aria-hidden="true" />
            ) : (
              <Pause size={29} strokeWidth={1.5} fill="currentColor" aria-hidden="true" />
            )}
          </button>

<button
  type="button"
  onClick={stop}
  className="w-16 h-16 rounded-full border border-white/12 bg-white/[0.035] text-white/55 shadow-lg flex items-center justify-center"
  aria-label="録音を終了"
>
  <Square size={21} strokeWidth={1.5} fill="currentColor" aria-hidden="true" />
</button>
          </div>

        </div>
      )}

{step === 2 && (
  <div className="pb-10 pt-12">
    <p className="text-white/38 text-sm tracking-widest">
      声を、言葉にしています...
    </p>
  </div>
)}
    </div>
  );
}

function Scene3_5_VoiceCheck({
  data,
  isLifeOutline = false,
  isLastLifeOutline = false,
  onAddMore,
  onRetry,
  onRetryTranscription,
  onSelectStyle,
  onUpdateText,
  onProceed
}) {
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [draftTranscript, setDraftTranscript] = useState("");
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const audioPreviewRef = useRef(null);

  const isShortAnswer = isRecordingTooShort(data.duration);
  const hasAlreadyAddedMore = (data.addMoreCount || 0) > 0;
  const shouldSuggestAddMore = isShortAnswer && !hasAlreadyAddedMore;

  const audioPartCount = (data.audioSegments || []).length;
  const totalDuration = Number(data.duration || 0);

  const hasReachedAudioPartLimit =
    audioPartCount >= MAX_AUDIO_PARTS_PER_QUESTION;

  const hasReachedDurationLimit =
    totalDuration >= MAX_RECORDING_SECONDS_PER_QUESTION;

  const canAddMore =
    !data.editRecordingMode &&
    !hasReachedAudioPartLimit &&
    !hasReachedDurationLimit;

  const hasReachedAddMoreLimit =
    hasReachedAudioPartLimit || hasReachedDurationLimit;

  const displayText =
    data.editedText ||
    data.transcriptReadable ||
    data.transcriptClean ||
    data.transcript ||
    "";

  const hasTranscriptionError = data.transcriptionStatus === "error";
  const isProcessing = data.transcriptionStatus === "processing";
  const isPolishing = data.polishStatus === "processing";
  const canUseStyles = !isProcessing && !isPolishing && !!displayText;

  const toggleAudioPreview = async () => {
    const audio = audioPreviewRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      setIsAudioPlaying(false);
      return;
    }

    try {
      await audio.play();
      setIsAudioPlaying(true);
    } catch (error) {
      console.warn("audio preview play failed", error);
      setIsAudioPlaying(false);
    }
  };

  useEffect(() => {
    const audio = audioPreviewRef.current;

    return () => {
      if (audio) {
        audio.pause();
      }
    };
  }, []);

  const startTranscriptEdit = () => {
    setDraftTranscript(displayText);
    setIsEditingTranscript(true);
  };

  const cancelTranscriptEdit = () => {
    setDraftTranscript("");
    setIsEditingTranscript(false);
  };

  const applyTranscriptEdit = () => {
    const nextText = String(draftTranscript || "").trim();

    if (!nextText) {
      alert("本文が空になっています。");
      return;
    }

    onUpdateText?.(data.selectedStyle || "readable", nextText);
    setIsEditingTranscript(false);
    setDraftTranscript("");
  };

  const showAddMoreSuggestion =
    shouldSuggestAddMore &&
    !isProcessing &&
    canAddMore;

  const showSubtleAddMore =
    !showAddMoreSuggestion &&
    !isProcessing &&
    canAddMore;

return (
  <div className="h-full flex flex-col fade-enter px-4 pt-2 pb-8 overflow-hidden">

    <div className="text-center mb-4">
      <p className="text-white/86 text-[1.02rem] text-narrative">
        {isLifeOutline ? "声が届きました" : "語りを確認します"}
      </p>
    </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {hasTranscriptionError && (
          <div className="glass-card p-5 mb-6">
            <p className="text-white/75 text-sm leading-loose mb-3">
              文字起こしに時間がかかっています。
            </p>

            <p className="text-white/48 text-sm leading-loose mb-5">
              音声は保存されています。通信が安定してから、もう一度試せます。
            </p>

            <button
              type="button"
              onClick={onRetryTranscription}
              className="btn-quiet bg-white/10 w-full py-3 rounded-full text-white"
            >
              文字起こしをもう一度試す
            </button>
          </div>
        )}

        <div className="glass-card p-5 mb-6">

        {/* 音声確認は文字起こしの補助操作として、控えめに表示する。 */}
        {data.audioUrl && (
          <audio
            ref={audioPreviewRef}
            src={data.audioUrl}
            className="hidden"
            onEnded={() => setIsAudioPlaying(false)}
          />
        )}

        {!isLifeOutline && (
        <div className="flex gap-2 mb-5">
          <button
            type="button"
            disabled={!canUseStyles || isEditingTranscript}
            onClick={() => onSelectStyle("clean")}
            className={`flex-1 py-2 rounded-full text-xs border ${
              data.selectedStyle === "clean"
                ? "bg-white/15 border-white/25 text-white"
                : "border-white/10 text-white/45"
            } ${!canUseStyles || isEditingTranscript ? "opacity-40" : ""}`}
          >
            そのまま
          </button>

          <button
            type="button"
            disabled={!canUseStyles || isEditingTranscript}
            onClick={() => onSelectStyle("readable")}
            className={`flex-1 py-2 rounded-full text-xs border ${
              data.selectedStyle === "readable"
                ? "bg-white/15 border-white/25 text-white"
                : "border-white/10 text-white/45"
            } ${!canUseStyles || isEditingTranscript ? "opacity-40" : ""}`}
          >
            語り調
          </button>

          <button
            type="button"
            disabled={!canUseStyles || isEditingTranscript}
            onClick={() => onSelectStyle("essay")}
            className={`flex-1 py-2 rounded-full text-xs border ${
              data.selectedStyle === "essay"
               ? "bg-white/15 border-white/25 text-white"
                : "border-white/10 text-white/45"
            } ${!canUseStyles ? "opacity-40" : ""}`}
          >
            作品調
          </button>
        </div>
        )}

         {isProcessing ? (
           <div className="flex items-center gap-3 text-white/45 text-sm leading-loose">
             <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white/70 animate-spin shrink-0"></div>
             <p>文字起こし中です</p>
           </div>
         ) : displayText ? (
          <>
            {!isEditingTranscript && (
<div>
  <p className="text-white/78 text-[1rem] leading-[2.05] whitespace-pre-wrap text-narrative">
    {displayText}
  </p>

  <div className={`mt-3 flex items-center ${
    data.audioUrl ? "justify-between" : "justify-end"
  }`}>
    {data.audioUrl && (
      <button
        type="button"
        onClick={toggleAudioPreview}
        className="w-8 h-8 flex items-center justify-center rounded-full opacity-70"
        aria-label={isAudioPlaying ? "録音の再生を止める" : "録音を再生する"}
        title={isAudioPlaying ? "停止" : "録音を再生"}
      >
        <span
          className="text-white/32 text-xs"
          aria-hidden="true"
        >
          {isAudioPlaying ? "Ⅱ" : "▶"}
        </span>
      </button>
    )}

    <button
      type="button"
      onClick={startTranscriptEdit}
      disabled={isPolishing}
      className={`w-8 h-8 flex items-center justify-center rounded-full ${
        isPolishing ? "opacity-30" : "opacity-80"
      }`}
      aria-label="本文を修正する"
    >
      <Pencil size={15} className="text-white/32" strokeWidth={1.7} />
    </button>
  </div>
</div>
            )}

            {isEditingTranscript && (
              <div>
                <textarea
                  value={draftTranscript}
                  onChange={e => setDraftTranscript(e.target.value)}
                  className="w-full min-h-[220px] bg-transparent text-white/82 text-[1rem] leading-[2.05] outline-none resize-none text-narrative"
                  autoFocus
                />

                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={cancelTranscriptEdit}
                    className="flex-1 py-3 rounded-full border border-white/10 text-white/45 text-sm"
                  >
                    キャンセル
                  </button>

                  <button
                    type="button"
                    onClick={applyTranscriptEdit}
                    className="flex-1 btn-quiet bg-white/10 py-3 rounded-full text-white text-sm"
                  >
                    反映する
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-white/45 text-sm leading-loose">
            文字起こしを取得できませんでした。
          </p>
        )}

        {isPolishing && !isProcessing && (
          <div className="mt-4 flex items-center gap-3 text-white/35 text-xs leading-loose">
            <div className="w-3 h-3 rounded-full border-2 border-white/15 border-t-white/50 animate-spin shrink-0"></div>
            <p>文章を整えています</p>
          </div>
        )}

        </div>

        {hasReachedAddMoreLimit && !data.editRecordingMode && (
          <div className="glass-card p-5 mb-6">
            <p className="text-white/70 text-sm leading-loose mb-3">
              語り足しの上限に達しました
            </p>

            <p className="text-white/48 text-sm leading-loose">
              ここからは本文の編集で整えられます。
            </p>
          </div>
        )}


      </div>

      <div className="pt-5 border-t border-white/10 space-y-4">

       {showAddMoreSuggestion && (
         <button
           onClick={onAddMore}
           className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
         >
           少し話し足す
         </button>
       )}

       {showSubtleAddMore && (
         <button
           onClick={onAddMore}
           className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
         >
           少し話し足す
         </button>
       )}

        <button
          onClick={onProceed}
          disabled={isProcessing || !displayText}
          className={`btn-quiet w-full py-4 rounded-full text-white ${
            isProcessing || !displayText ? "opacity-40" : ""
          }`}
        >
          {isLifeOutline
            ? isLastLifeOutline
              ? "人生の輪郭をまとめる"
              : "次の問いへ"
            : "この内容で進む"}
        </button>

        <button
          onClick={onRetry}
          disabled={isProcessing || isPolishing}
          className={`w-full py-3 text-white/45 text-sm underline underline-offset-4 ${
            isProcessing || isPolishing ? "opacity-40" : ""
          }`}
        >
          もう一度話す
        </button>
      </div>
    </div>
  );
}


function Scene4_AIMirror({ data, onEditedTextChange, onPhotoStoryTitleChange, onPhotoStoryCaptionChange, onAddPhotos, onRemovePhoto, onNext }) {
  const [isEditingText, setIsEditingText] = useState(false);
  const [draftText, setDraftText] = useState(data.editedText || "");
  const [photoCorrectionOpen, setPhotoCorrectionOpen] = useState(false);

  useEffect(() => {
    setDraftText(data.editedText || "");
  }, [data.editedText]);

  const saveDraftText = () => {
    onEditedTextChange(draftText);
    setIsEditingText(false);
  };

  return (
    <div className="h-full flex flex-col fade-enter">
      <PhotoCorrectionFlow
        open={photoCorrectionOpen}
        onClose={() => setPhotoCorrectionOpen(false)}
        onComplete={(file) => onAddPhotos([file])}
      />
      <div className="flex-1 overflow-y-auto pb-10">
        {data.storyOrigin === "photo" && (
          <div className="glass-card p-5 mb-8 space-y-5">
            <div>
              <p className="text-white/38 text-xs tracking-widest mb-2">本に載せるタイトル</p>
              <input value={data.photoStoryTitle || "この一枚のこと"} onChange={event => onPhotoStoryTitleChange?.(event.target.value)} className="quiet-input" maxLength={40} />
              <p className="text-white/27 text-xs leading-loose mt-2">語りから仮のタイトルをつけました。変更しなくても進めます。</p>
            </div>
            <div>
              <p className="text-white/38 text-xs tracking-widest mb-2">日付・場所など（任意）</p>
              <input value={data.photoStoryCaption || ""} onChange={event => onPhotoStoryCaptionChange?.(event.target.value)} className="quiet-input" placeholder="例：1998年ごろ・鎌倉" maxLength={60} />
            </div>
          </div>
        )}
            <div className="mb-8 p-4 bg-white/5 border-l-2 border-amber-600/50 rounded-r-lg">
          <p className="text-amber-50/90 text-[0.95rem] tracking-widest leading-loose">
            {data.aiMirror}
          </p>
        </div>

        {isEditingText ? (
          <div className="glass-card p-5">

            <textarea
              value={draftText}
              onChange={e => setDraftText(e.target.value)}
              className="w-full min-h-[220px] bg-transparent text-white/85 text-[1.02rem] leading-[2.05] outline-none resize-none text-narrative"
              autoFocus
            />

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  setDraftText(data.editedText || "");
                  setIsEditingText(false);
                }}
                className="flex-1 py-3 rounded-full border border-white/10 text-white/45 text-sm"
              >
                キャンセル
              </button>

              <button
                onClick={saveDraftText}
                className="flex-1 btn-quiet bg-white/10 py-3 rounded-full text-white text-sm"
              >
                修正を保存する
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-white/80 text-[1.05rem] text-narrative whitespace-pre-wrap">
              {data.editedText}
            </div>

            <button
              type="button"
              onClick={() => setIsEditingText(true)}
              className="mt-6 text-white/45 text-sm underline underline-offset-4"
            >
              本文を修正する
            </button>
          </>
        )}
        <div className="glass-card p-5 mt-10">
          {data.photoItems && data.photoItems.length > 0 && (

            <div className={`${data.storyOrigin === "photo" ? "grid grid-cols-1" : "grid grid-cols-2"} gap-3 mb-5`}>
              {data.photoItems.map((photo, index) => (
                <div
                  key={photo.createdAt || index}
                  className="relative rounded-2xl overflow-hidden bg-white/5 border border-white/10"
                >
                  <img src={photo.url} alt={`写真 ${index + 1}`} className={`w-full ${data.storyOrigin === "photo" ? "max-h-[420px] object-contain" : "aspect-square object-cover"}`} />

                  <button
                    type="button"
                    onClick={() => onRemovePhoto(photo.createdAt)}
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 text-white/80 text-sm"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

           {data.storyOrigin !== "photo" && <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPhotoCorrectionOpen(true)}
              className="btn-quiet flex-1 py-4 rounded-full text-white/80"
            >
              写真を添える
            </button>

            <p className="text-white/32 text-xs whitespace-nowrap">
              後でもできます
            </p>
          </div>}
        </div>

        {data.audioSegments && data.audioSegments.length > 0 && (
          <div className="glass-card p-5 mt-10">

            <div className="space-y-4">
              {data.audioSegments.map((segment, index) => (
                <div key={segment.createdAt || index}>
                  {data.audioSegments.length > 1 && (
                    <p className="text-white/35 text-xs mb-2">
                      音声 {index + 1}
                    </p>
                  )}

                  <audio src={segment.url} controls className="w-full" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-6 border-t border-white/10">
        <button onClick={onNext} className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white">
          次へ進む
        </button>
      </div>
    </div>
  );
}

function Scene_BetaSurveyPrompt({ survey, onOpenSurvey, onContinue }) {
  const sequenceOrder = Number(survey?.sequenceOrder || 0);

  const message =
    sequenceOrder === 5
      ? {
          main: (
            <>
              まずは初めての問いに語ってみていただき、ありがとうございます。<br />
              完璧な答えは要りません。<br />
              なかなか思い出せない間も楽しみながら進めてみてください。
            </>
          ),
          time: "所要時間30秒〜1分"
        }
      : sequenceOrder === 11
        ? {
            main: (
              <>
                ここまで語っていただき、ありがとうございます。<br />
                少しずつ、あなたの物語が形になり始めています。
              </>
            ),
            time: "所要時間1分程度"
          }
        : {
            main: (
              <>
                ここまで語っていただき、本当にありがとうございました。<br />
                最後のアンケートです。<br />
                今回の体験について、率直な感想をお聞かせください。
              </>
            ),
            time: "所要時間2〜3分"
          };

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-6 text-center">
      <div className="space-y-6 mb-12 text-narrative">
        <p className="text-white/90 text-[1.08rem] leading-loose">
          {message.main}
        </p>

        <p className="text-white/62 text-[0.96rem] leading-loose">
          tateito yokoito をより良い体験にするために、<br />
          短いアンケートへのご協力をお願いします。<br />
          （{message.time}）
        </p>

        <p className="text-white/42 text-sm leading-loose">
          {survey?.title || "アンケート"}
        </p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-[280px]">
        <button
          type="button"
          onClick={onOpenSurvey}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
        >
          アンケートに答える
        </button>

        <button
          type="button"
          onClick={onContinue}
          className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
        >
          あとで答える
        </button>
      </div>
    </div>
  );
}

function BookPageAddedVisual() {
  return (
    <div className="my-10 flex items-center justify-center gap-5" aria-hidden="true">
      <div className="relative w-12 h-16 rounded-sm border border-white/22 bg-white/[0.035] shadow-lg">
        <div className="absolute inset-x-3 top-4 h-px bg-white/18" />
        <div className="absolute inset-x-3 top-7 h-px bg-white/12" />
        <div className="absolute inset-x-3 top-10 h-px bg-white/10" />
      </div>

      <div className="text-white/28 text-xl">
        →
      </div>

      <div className="relative w-14 h-[4.25rem]">
        <div className="absolute left-0 top-1 w-12 h-16 rounded-sm border border-white/24 bg-white/[0.045] shadow-xl" />
        <div className="absolute left-2 top-0 w-12 h-16 rounded-sm border border-white/18 bg-white/[0.032]" />
        <div className="absolute right-0 top-2 h-14 w-2 rounded-r-sm bg-white/[0.12]" />
        <div className="absolute right-1 top-3 h-12 w-px bg-white/16" />
        <div className="absolute right-3 top-4 h-10 w-px bg-white/10" />
      </div>
    </div>
  );
}

function Scene6_Completion({ onTalkMore, onHome, onEndToday }) {
  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter text-center">
      <p className="text-white/90 text-[1.05rem] mb-2">
        あなたの物語に、<br/>ひとつのページが加わりました
      </p>

      <BookPageAddedVisual />

      <div className="flex flex-col gap-4 w-full max-w-[280px]">
        <button
          onClick={onTalkMore}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
        >
          次の問いに進む
        </button>

        <button
          onClick={onHome}
          className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
        >
          ホームへ
        </button>

        <button
          onClick={onEndToday}
          className="w-full py-3 text-white/40 text-sm underline underline-offset-4"
        >
          今日はここまで
        </button>

      </div>
    </div>
  );
}

function Scene_TokenCompletion({ onLogin }) {
  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter text-center px-6">
      <div className="space-y-7 mb-12 text-narrative">
        <p className="text-white/90 text-[1.08rem]">
          語りを保存しました
        </p>

        <p className="text-white/60 text-[0.96rem] leading-loose">
          今日の問いへの語りは、<br />
          ちゃんと残っています。
        </p>

        <p className="text-white/42 text-sm leading-loose">
          続けて語る場合や、これまでの語りを見る場合は、<br />
          本人確認をお願いします。
        </p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-[280px]">
        <button
          type="button"
          onClick={onLogin}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
        >
          本人確認して続ける
        </button>

        <p className="text-white/35 text-xs leading-loose">
          この画面は、そのまま閉じて大丈夫です。
        </p>
      </div>
    </div>
  );
}

function Scene_EndToday({
  notificationPref,
  hasSavedAnswer,
  onOpenStoryPages,
  onResume
}) {
  const nextDeliveryText = getNextDeliveryText(notificationPref);

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-6 text-center">
      <div className="space-y-7 mb-12 text-narrative">
        <p className="text-white/90 text-[1.08rem]">
          今日はここまでにしましょう
        </p>

        <p className="text-white/65 text-[0.98rem] leading-loose">
          {hasSavedAnswer ? (
            <>
              今日の語りは、<br />
              ちゃんと残っています。
            </>
          ) : (
            <>
              今の問いは、そのまま残っています。<br />
              答えたり、飛ばしたことにはなりません。
            </>
          )}
        </p>

        <p className="text-white/55 text-[0.95rem] leading-loose">
          {hasSavedAnswer
            ? nextDeliveryText
            : "次に開いたとき、同じ問いから再開できます。"}
        </p>

        <p className="text-white/45 text-[0.92rem] leading-loose">
          この画面は、そのまま閉じて大丈夫です。
        </p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-[280px]">
        <button
          onClick={onOpenStoryPages}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
        >
          これまでの語りを見る
        </button>

        {!hasSavedAnswer && (
          <button
            onClick={onResume}
            className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
          >
            問いに戻る
          </button>
        )}
      </div>
    </div>
  );
}

function CropPreview({ scanPreview, setScanPreview, updateScanPreview }) {
  const imageRef = useRef(null);
  const dragRef = useRef(null);

  const rect = scanPreview.cropRect || {
    left: 0,
    top: 0,
    right: 1,
    bottom: 1
  };

  const perspectiveEnabled = !!scanPreview.perspectiveEnabled;

  const perspectivePoints = scanPreview.perspectivePoints || {
    topLeft: { x: rect.left, y: rect.top },
    topRight: { x: rect.right, y: rect.top },
    bottomRight: { x: rect.right, y: rect.bottom },
    bottomLeft: { x: rect.left, y: rect.bottom }
  };

const [coachSeen, setCoachSeen] = useState(() => ({
  crop: localStorage.getItem("tateyoko_scan_crop_coach_seen") === "1",
  perspective: localStorage.getItem("tateyoko_scan_perspective_coach_seen") === "1"
}));

const activeCoachKey = perspectiveEnabled ? "perspective" : "crop";
const showCoachMark = !coachSeen[activeCoachKey];

const dismissCoachMark = () => {
  const storageKey = perspectiveEnabled
    ? "tateyoko_scan_perspective_coach_seen"
    : "tateyoko_scan_crop_coach_seen";

  localStorage.setItem(storageKey, "1");

  setCoachSeen(prev => ({
    ...prev,
    [activeCoachKey]: true
  }));
};

useEffect(() => {
  if (!showCoachMark) return;

  const timer = setTimeout(() => {
    const storageKey = activeCoachKey === "perspective"
      ? "tateyoko_scan_perspective_coach_seen"
      : "tateyoko_scan_crop_coach_seen";

    localStorage.setItem(storageKey, "1");

    setCoachSeen(prev => ({
      ...prev,
      [activeCoachKey]: true
    }));
  }, 5000);

  return () => clearTimeout(timer);
}, [showCoachMark, activeCoachKey]);

  const clampCropRect = (nextRect) => {
    const minSize = 0.05;

    let left = Math.max(0, Math.min(0.95, Number(nextRect.left) || 0));
    let top = Math.max(0, Math.min(0.95, Number(nextRect.top) || 0));
    let right = Math.max(0.05, Math.min(1, Number(nextRect.right) || 1));
    let bottom = Math.max(0.05, Math.min(1, Number(nextRect.bottom) || 1));

    if (right - left < minSize) {
      if (dragRef.current?.handle?.includes("left")) left = right - minSize;
      else right = left + minSize;
    }

    if (bottom - top < minSize) {
      if (dragRef.current?.handle?.includes("top")) top = bottom - minSize;
      else bottom = top + minSize;
    }

    return {
      left: Math.max(0, Math.min(0.95, left)),
      top: Math.max(0, Math.min(0.95, top)),
      right: Math.max(0.05, Math.min(1, right)),
      bottom: Math.max(0.05, Math.min(1, bottom))
    };
  };

  const updateLocalCropRect = (nextRect) => {
    const safeRect = clampCropRect(nextRect);

    setScanPreview(prev =>
      prev ? { ...prev, cropRect: safeRect } : prev
    );

    return safeRect;
  };

  const updateLocalPerspectivePoint = (handle, point) => {
    const safePoint = {
      x: Math.max(0, Math.min(1, point.x)),
      y: Math.max(0, Math.min(1, point.y))
    };

    const nextPoints = {
      ...perspectivePoints,
      [handle]: safePoint
    };

    setScanPreview(prev =>
      prev ? { ...prev, perspectivePoints: nextPoints } : prev
    );

    return nextPoints;
  };

const getPointInImage = (event, options = {}) => {
  const box = imageRef.current?.getBoundingClientRect();
  if (!box) return null;

  const offsetY = options.offsetY || 0;

  return {
    x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
    y: Math.max(0, Math.min(1, (event.clientY - offsetY - box.top) / box.height))
  };
};

const getRectHandlePoint = (handle) => ({
  x: handle.includes("left")
    ? rect.left
    : handle.includes("right")
      ? rect.right
      : (rect.left + rect.right) / 2,
  y: handle.includes("top")
    ? rect.top
    : handle.includes("bottom")
      ? rect.bottom
      : (rect.top + rect.bottom) / 2
});


const startDrag = (handle, event) => {
  event.preventDefault();
  event.stopPropagation();

  dismissCoachMark();

const touchPoint = getPointInImage(event);
const handlePoint = perspectiveEnabled
  ? perspectivePoints[handle]
  : getRectHandlePoint(handle);

  dragRef.current = {
    handle,
    mode: perspectiveEnabled ? "perspective" : "rect",
    lastRect: rect,
    lastPoints: perspectivePoints,
grabOffset:
  touchPoint && handlePoint
    ? {
        x: handlePoint.x - touchPoint.x,
        y: handlePoint.y - touchPoint.y
      }
    : { x: 0, y: 0 }

  };

  event.currentTarget.setPointerCapture?.(event.pointerId);
};

  const moveDrag = (event) => {
    if (!dragRef.current) return;

    event.preventDefault();

    const point = getPointInImage(event);
    if (!point) return;

    const handle = dragRef.current.handle;

if (dragRef.current.mode === "perspective") {
  const grabOffset = dragRef.current.grabOffset || { x: 0, y: 0 };

  dragRef.current.lastPoints = updateLocalPerspectivePoint(handle, {
    x: point.x + grabOffset.x,
    y: point.y + grabOffset.y
  });

  return;
}

const grabOffset = dragRef.current.grabOffset || { x: 0, y: 0 };
const adjustedPoint = {
  x: point.x + grabOffset.x,
  y: point.y + grabOffset.y
};

const nextRect = { ...(dragRef.current.lastRect || rect) };

if (handle.includes("left")) nextRect.left = adjustedPoint.x;
if (handle.includes("right")) nextRect.right = adjustedPoint.x;
if (handle.includes("top")) nextRect.top = adjustedPoint.y;
if (handle.includes("bottom")) nextRect.bottom = adjustedPoint.y;

dragRef.current.lastRect = updateLocalCropRect(nextRect);

  };

  const endDrag = () => {
    if (!dragRef.current) return;

    const currentDrag = dragRef.current;
    dragRef.current = null;

    if (currentDrag.mode === "perspective") {
      updateScanPreview({ perspectivePoints: currentDrag.lastPoints });
      return;
    }

    updateScanPreview({ cropRect: currentDrag.lastRect });
  };

  const cropStyle = {
    left: `${rect.left * 100}%`,
    top: `${rect.top * 100}%`,
    width: `${(rect.right - rect.left) * 100}%`,
    height: `${(rect.bottom - rect.top) * 100}%`
  };

const handles = [
  {
    key: "top-left",
    className: "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize"
  },
  {
    key: "top-right",
    className: "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize"
  },
  {
    key: "bottom-left",
    className: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize"
  },
  {
    key: "bottom-right",
    className: "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize"
  },
  {
    key: "top",
    className: "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize"
  },
  {
    key: "bottom",
    className: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize"
  },
  {
    key: "left",
    className: "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize"
  },
  {
    key: "right",
    className: "top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-ew-resize"
  }
];

  const perspectiveHandles = ["topLeft", "topRight", "bottomRight", "bottomLeft"];

return (
  <div
    className="rounded-2xl overflow-visible border border-white/10 bg-black/25 mb-4 shrink min-h-0"
    onContextMenu={(event) => event.preventDefault()}
    style={{
      userSelect: "none",
      WebkitUserSelect: "none",
      WebkitTouchCallout: "none"
    }}
  >
    <div className="relative mx-auto w-full max-h-[62dvh] flex items-center justify-center touch-none overflow-visible px-4 py-4">
        <div className="relative inline-block">
<img
  ref={imageRef}
  src={scanPreview.cropPreviewUrl || scanPreview.originalUrl || scanPreview.url}
  alt="スキャン写真のプレビュー"
  className="block max-w-full max-h-[58dvh] object-contain select-none"
  draggable="false"
  onContextMenu={(event) => event.preventDefault()}
/>

          {!perspectiveEnabled && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute bg-black/55" style={{ left: 0, top: 0, right: 0, height: `${rect.top * 100}%` }} />
              <div className="absolute bg-black/55" style={{ left: 0, top: `${rect.bottom * 100}%`, right: 0, bottom: 0 }} />
              <div className="absolute bg-black/55" style={{ left: 0, top: `${rect.top * 100}%`, width: `${rect.left * 100}%`, height: `${(rect.bottom - rect.top) * 100}%` }} />
              <div className="absolute bg-black/55" style={{ left: `${rect.right * 100}%`, top: `${rect.top * 100}%`, right: 0, height: `${(rect.bottom - rect.top) * 100}%` }} />
            </div>
          )}

          <div
            className={`absolute touch-none ${
              perspectiveEnabled
                ? "inset-0"
                : "border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
            }`}
            style={perspectiveEnabled ? undefined : cropStyle}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {!perspectiveEnabled && (
              <>
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/55" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/55" />
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/55" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/55" />
              </>
            )}


            {perspectiveEnabled ? (
              <>
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <polygon
                    points={`
                      ${perspectivePoints.topLeft.x * 100},${perspectivePoints.topLeft.y * 100}
                      ${perspectivePoints.topRight.x * 100},${perspectivePoints.topRight.y * 100}
                      ${perspectivePoints.bottomRight.x * 100},${perspectivePoints.bottomRight.y * 100}
                      ${perspectivePoints.bottomLeft.x * 100},${perspectivePoints.bottomLeft.y * 100}
                    `}
                    fill="rgba(255,255,255,0.04)"
                    stroke="rgba(255,255,255,0.9)"
                    strokeWidth="0.6"
                  />
                </svg>

                {perspectiveHandles.map(key => {
                  const point = perspectivePoints[key];

                  return (
  
                <button
                  key={key}
                  type="button"
                  aria-label={`台形補正 ${key}`}
                  disabled={scanPreview.processing}
                  onPointerDown={(event) => startDrag(key, event)}
                  className="absolute w-28 h-28 rounded-full bg-white/15 border border-white/60 touch-none -translate-x-1/2 -translate-y-1/2 shadow-lg flex items-center justify-center"
                  style={{
                    left: `${point.x * 100}%`,
                    top: `${point.y * 100}%`
                  }}
                >
                  <span className="w-3 h-3 rounded-full bg-white border border-slate-950 shadow" />
                </button>
                  );
                })}
              </>
            ) : (
handles.map(handle => (
  <button
    key={handle.key}
    type="button"
    aria-label={`切り抜き ${handle.key}`}
    disabled={scanPreview.processing}
    onPointerDown={(event) => startDrag(handle.key, event)}
    onContextMenu={(event) => event.preventDefault()}
    className={`absolute w-12 h-12 rounded-full bg-white/12 border border-white/55 touch-none shadow-lg flex items-center justify-center ${handle.className}`}
  >
    <span className="w-3 h-3 rounded-full bg-white border border-slate-950 shadow" />
  </button>
))

            )}
          </div>

          {showCoachMark && (
            <div className="absolute left-1/2 bottom-5 z-20 -translate-x-1/2 rounded-full bg-black/60 border border-white/10 px-4 py-2 pointer-events-none">
              <p className="text-white/70 text-xs whitespace-nowrap">
                {perspectiveEnabled
                  ? "四隅を写真の角に合わせると、傾きを補正できます"
                  : "白い角を動かして、残したい範囲に合わせます"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function PhotoCorrectionFlow({
  open,
  title = "写真を添える",
  initialFile = null,
  onClose,
  onComplete
}) {
  const libraryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const initializedFileRef = useRef(null);
  const [scanPreview, setScanPreview] = useState(null);

  const isDesktopBrowser =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const releasePreviewUrls = (preview) => {
    if (preview?.url) {
      try { URL.revokeObjectURL(preview.url); } catch (e) {}
    }

    if (preview?.originalUrl) {
      try { URL.revokeObjectURL(preview.originalUrl); } catch (e) {}
    }

    if (preview?.cropPreviewUrl) {
      try { URL.revokeObjectURL(preview.cropPreviewUrl); } catch (e) {}
    }
  };

  const closeFlow = () => {
    releasePreviewUrls(scanPreview);
    setScanPreview(null);
    onClose?.();
  };

  useEffect(() => {
    if (!open) {
      initializedFileRef.current = null;
      setScanPreview(prev => {
        releasePreviewUrls(prev);
        return null;
      });
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [open]);

  const handleSourceSelect = async (files, inputRef) => {
    const originalFile = Array.from(files || []).find(file =>
      file && file.type && file.type.startsWith("image/")
    );

    if (!originalFile) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    try {
      const brightness = 8;
      const contrast = 1.1;
      const rotationDegrees = 0;
      const cropMode = "original";

      const cropPreviewFile = await processScannedPhotoFile(originalFile, {
        brightness: 0,
        contrast: 1,
        maxWidth: 2200,
        cropMode,
        rotationDegrees
      });

      const cropPreviewUrl = URL.createObjectURL(cropPreviewFile);
      const originalUrl = URL.createObjectURL(originalFile);

      setScanPreview(prev => {
        releasePreviewUrls(prev);

        return {
          originalFile,
          file: null,
          url: null,
          originalUrl,
          cropPreviewUrl,
          brightness,
          contrast,
          cropMode: "original",
          cropRect: {
            left: 0,
            top: 0,
            right: 1,
            bottom: 1
          },
          perspectiveEnabled: false,
          perspectivePoints: {
            topLeft: { x: 0, y: 0 },
            topRight: { x: 1, y: 0 },
            bottomRight: { x: 1, y: 1 },
            bottomLeft: { x: 0, y: 1 }
          },
          rotationDegrees,
          step: "crop",
          processing: false
        };
      });
    } catch (e) {
      console.error(e);
      alert(e.message || "写真の読み込みに失敗しました。");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!open || !initialFile || initializedFileRef.current === initialFile) return;

    initializedFileRef.current = initialFile;
    handleSourceSelect([initialFile], { current: null });
  }, [open, initialFile]);

  const updateScanPreview = async (nextValues = {}) => {
    const current = scanPreview;
    if (!current?.originalFile) return;

    const nextBrightness =
      nextValues.brightness !== undefined
        ? nextValues.brightness
        : current.brightness;

    const nextContrast =
      nextValues.contrast !== undefined
        ? nextValues.contrast
        : current.contrast;

    const nextCropMode =
      nextValues.cropMode !== undefined
        ? nextValues.cropMode
        : current.cropMode || "original";

    const nextRotationDegrees =
      nextValues.rotationDegrees !== undefined
        ? nextValues.rotationDegrees
        : current.rotationDegrees || 0;

    const nextCropRect = {
      left: current.cropRect?.left ?? 0,
      top: current.cropRect?.top ?? 0,
      right: current.cropRect?.right ?? 1,
      bottom: current.cropRect?.bottom ?? 1,
      ...(nextValues.cropRect || {})
    };

    const nextPerspectivePoints =
      nextValues.perspectivePoints !== undefined
        ? nextValues.perspectivePoints
        : current.perspectivePoints || null;

    const shouldBuildProcessedFile =
      nextValues.buildProcessedFile === true || current.step === "adjust";

    setScanPreview(prev =>
      prev
        ? {
            ...prev,
            brightness: nextBrightness,
            contrast: nextContrast,
            cropMode: nextCropMode,
            cropRect: nextCropRect,
            rotationDegrees: nextRotationDegrees,
            processing: true,
            perspectivePoints: nextPerspectivePoints
          }
        : prev
    );

    try {
      let cropPreviewUrl = current.cropPreviewUrl || null;

      if (!cropPreviewUrl || nextValues.rotationDegrees !== undefined) {
        const cropPreviewFile = await processScannedPhotoFile(current.originalFile, {
          brightness: 0,
          contrast: 1,
          maxWidth: 2200,
          cropMode: "original",
          rotationDegrees: nextRotationDegrees
        });

        cropPreviewUrl = URL.createObjectURL(cropPreviewFile);
      }

      let processedFile = current.file || null;
      let previewUrl = current.url || null;

      if (shouldBuildProcessedFile) {
        processedFile = await processScannedPhotoFile(current.originalFile, {
          brightness: nextBrightness,
          contrast: nextContrast,
          maxWidth: 2200,
          cropMode: nextCropMode,
          cropRect: current.perspectiveEnabled ? null : nextCropRect,
          perspectivePoints: current.perspectiveEnabled ? nextPerspectivePoints : null,
          rotationDegrees: nextRotationDegrees
        });

        previewUrl = URL.createObjectURL(processedFile);
      }

      setScanPreview(prev => {
        if (cropPreviewUrl !== prev?.cropPreviewUrl && prev?.cropPreviewUrl) {
          try { URL.revokeObjectURL(prev.cropPreviewUrl); } catch (e) {}
        }

        if (shouldBuildProcessedFile && prev?.url && prev.url !== previewUrl) {
          try { URL.revokeObjectURL(prev.url); } catch (e) {}
        }

        return prev
          ? {
              ...prev,
              file: processedFile,
              url: previewUrl,
              cropPreviewUrl,
              brightness: nextBrightness,
              contrast: nextContrast,
              cropMode: nextCropMode,
              cropRect: nextCropRect,
              perspectivePoints: nextPerspectivePoints,
              rotationDegrees: nextRotationDegrees,
              processing: false,
              step: nextValues.nextStep || prev.step
            }
          : prev;
      });
    } catch (e) {
      console.error(e);
      alert(e.message || "補正に失敗しました。");

      setScanPreview(prev =>
        prev
          ? {
              ...prev,
              processing: false
            }
          : prev
      );
    }
  };

  const rotateScanPreview = async () => {
    if (!scanPreview) return;

    await updateScanPreview({
      rotationDegrees: ((scanPreview.rotationDegrees || 0) + 90) % 360,
      cropRect: {
        left: 0,
        top: 0,
        right: 1,
        bottom: 1
      },
      perspectivePoints: {
        topLeft: { x: 0, y: 0 },
        topRight: { x: 1, y: 0 },
        bottomRight: { x: 1, y: 1 },
        bottomLeft: { x: 0, y: 1 }
      }
    });
  };

  const completeCropStep = async () => {
    if (!scanPreview) return;

    await updateScanPreview({
      cropRect: scanPreview.cropRect,
      perspectivePoints: scanPreview.perspectivePoints || null,
      rotationDegrees: scanPreview.rotationDegrees || 0,
      buildProcessedFile: true,
      nextStep: "adjust"
    });
  };

  const confirmPhoto = () => {
    if (!scanPreview?.file) return;

    const file = scanPreview.file;
    releasePreviewUrls(scanPreview);
    setScanPreview(null);
    onClose?.();
    onComplete?.(file);
  };

  if (!open) return null;

  return createPortal((
    <>
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleSourceSelect(event.target.files, libraryInputRef)}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => handleSourceSelect(event.target.files, cameraInputRef)}
      />

      {!scanPreview ? (
        <div className="fixed inset-0 z-[9998] bg-black/45 flex items-end px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="w-full rounded-3xl border border-white/10 bg-slate-950 p-5 shadow-2xl fade-enter">
            <p className="text-white/72 text-center text-narrative mb-5">
              {title}
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => libraryInputRef.current?.click()}
                className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
              >
                画像を選んで補正する
              </button>

              {!isDesktopBrowser && (
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
                >
                  その場で撮る
                </button>
              )}

              <button
                type="button"
                onClick={closeFlow}
                className="w-full py-3 text-white/42 text-sm underline underline-offset-4"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="fixed inset-0 z-[9999] w-[100dvw] h-[100dvh] max-w-none bg-slate-950 px-4 pt-0 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col fade-enter overflow-hidden overscroll-none">
          {scanPreview.step === "crop" ? (
            <>
              <CropPreview
                scanPreview={scanPreview}
                setScanPreview={setScanPreview}
                updateScanPreview={updateScanPreview}
              />

              {scanPreview.processing && (
                <p className="text-white/35 text-xs text-center animate-pulse mb-4">
                  補正しています...
                </p>
              )}

              <div className="mt-5 flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={closeFlow}
                  disabled={scanPreview.processing}
                  className="flex-1 py-3 rounded-full border border-white/10 text-white/55 text-sm"
                >
                  戻る
                </button>

                <button
                  type="button"
                  onClick={rotateScanPreview}
                  disabled={scanPreview.processing}
                  aria-label="右に回転"
                  title="右に回転"
                  className="w-12 h-12 rounded-full border border-white/10 text-white/70 flex items-center justify-center"
                >
                  <RotateCw size={20} strokeWidth={1.8} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setScanPreview(prev =>
                      prev
                        ? {
                            ...prev,
                            perspectiveEnabled: !prev.perspectiveEnabled
                          }
                        : prev
                    );
                  }}
                  disabled={scanPreview.processing}
                  aria-label="台形補正"
                  aria-pressed={!!scanPreview.perspectiveEnabled}
                  className={`h-12 px-4 rounded-full border flex items-center justify-center gap-2 shrink-0 ${
                    scanPreview.perspectiveEnabled
                      ? "bg-white/15 border-white/30 text-white"
                      : "border-white/10 text-white/55"
                  }`}
                >
                  <ScanLine size={18} strokeWidth={1.8} />
                  <span className="text-xs tracking-widest">台形補正</span>
                </button>
              </div>

              <button
                type="button"
                onClick={completeCropStep}
                disabled={scanPreview.processing}
                className={`mt-4 btn-quiet bg-white/10 w-full py-3 rounded-full text-white text-sm ${
                  scanPreview.processing ? "opacity-40" : ""
                }`}
              >
                切り抜きを完了
              </button>
            </>
          ) : (
            <>
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/25 mb-4 shrink min-h-0 flex items-center justify-center">
                <img
                  src={scanPreview.url}
                  alt="補正後のプレビュー"
                  className="w-full max-h-[38dvh] object-contain"
                />
              </div>

              <div className="glass-card p-5 space-y-5 shrink-0">
                <div>
                  <div className="flex justify-between mb-2">
                    <p className="text-white/45 text-xs tracking-widest">明るさ</p>
                    <p className="text-white/35 text-xs">{scanPreview.brightness}</p>
                  </div>

                  <input
                    type="range"
                    min="-24"
                    max="32"
                    step="4"
                    value={scanPreview.brightness}
                    disabled={scanPreview.processing}
                    onChange={(event) => {
                      const brightness = Number(event.target.value);
                      setScanPreview(prev => prev ? { ...prev, brightness } : prev);
                    }}
                    onPointerUp={(event) => {
                      updateScanPreview({ brightness: Number(event.currentTarget.value) });
                    }}
                    className="w-full"
                  />

                  <div className="mt-2 flex justify-between text-[10px] text-white/25">
                    <span>暗め</span>
                    <span>標準</span>
                    <span>明るめ</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <p className="text-white/45 text-xs tracking-widest">コントラスト</p>
                    <p className="text-white/35 text-xs">{scanPreview.contrast.toFixed(1)}</p>
                  </div>

                  <input
                    type="range"
                    min="0.9"
                    max="1.3"
                    step="0.05"
                    value={scanPreview.contrast}
                    disabled={scanPreview.processing}
                    onChange={(event) => {
                      const contrast = Number(event.target.value);
                      setScanPreview(prev => prev ? { ...prev, contrast } : prev);
                    }}
                    onPointerUp={(event) => {
                      updateScanPreview({ contrast: Number(event.currentTarget.value) });
                    }}
                    className="w-full"
                  />

                  <div className="mt-2 flex justify-between text-[10px] text-white/25">
                    <span>淡め</span>
                    <span>標準</span>
                    <span>濃いめ</span>
                  </div>
                </div>

                {scanPreview.processing && (
                  <p className="text-white/35 text-xs text-center animate-pulse">
                    補正しています...
                  </p>
                )}
              </div>

              <div className="mt-5 flex gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setScanPreview(prev => prev ? { ...prev, step: "crop" } : prev)}
                  disabled={scanPreview.processing}
                  className="flex-1 py-3 rounded-full border border-white/10 text-white/55 text-sm"
                >
                  切り抜きに戻る
                </button>

                <button
                  type="button"
                  onClick={confirmPhoto}
                  disabled={scanPreview.processing}
                  className={`flex-1 btn-quiet bg-white/10 py-3 rounded-full text-white text-sm ${
                    scanPreview.processing ? "opacity-40" : ""
                  }`}
                >
                  この写真を使う
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </>
  ), document.body);
}


function Scene_StoryPages({
  user,
  foundation,
  questionSet = [],
  onOpenLifeOutline,
  onTalkMore,
  onEditRecord,
  onBack
}) {

  const getStoryBody = (answer) => {
    const selectedStyle = answer?.selected_style || "";

    if (answer.transcript_edited) {
      return answer.transcript_edited;
    }

    if (selectedStyle === "clean" || selectedStyle === "transcript_clean") {
      return (
        answer.transcript_clean ||
        answer.transcript_raw ||
        answer.snippet ||
        "（本文を読み込めませんでした）"
      );
    }

    if (selectedStyle === "essay" || selectedStyle === "transcript_essay") {
      return (
        answer.transcript_essay ||
        answer.transcript_readable ||
        answer.transcript_clean ||
        answer.transcript_raw ||
        answer.snippet ||
        "（本文を読み込めませんでした）"
      );
    }

    return (
      answer.transcript_readable ||
      answer.transcript_clean ||
      answer.transcript_raw ||
      answer.snippet ||
      "（本文を読み込めませんでした）"
    );
  };

  const getQuestionForAnswer = (answer) => {
    return (questionSet || []).find(q =>
      Number(q.sequence_order) === Number(answer.sequence_order)
    ) || null;
  };

  const getChapterTitleForAnswer = (answer) => {
    const question = getQuestionForAnswer(answer);

    return (
      question?.chapter_label ||
      question?.chapter_description ||
      question?.chapter ||
      "その他"
    );
  };

  const getQuestionTextForAnswer = (answer) => {
    const question = getQuestionForAnswer(answer);
    return question?.content || "";
  };

  const buildChapterSections = (answerRows) => {
    const sections = [];

    const storyQuestions = (questionSet || []).filter(
      question => question?.include_in_story_list !== false
    );

    for (const question of storyQuestions) {
      const chapterTitle =
        question.chapter_label ||
        question.chapter_description ||
        question.chapter ||
        "その他";

      if (!sections.find(s => s.chapterTitle === chapterTitle)) {
        sections.push({
          chapterTitle,
          answers: []
        });
      }
    }

    for (const answer of answerRows || []) {
      const question = getQuestionForAnswer(answer);

      if (question?.include_in_story_list === false) {
        continue;
      }

      const chapterTitle = getChapterTitleForAnswer(answer);
      let section = sections.find(s => s.chapterTitle === chapterTitle);

      if (!section) {
        section = {
          chapterTitle,
          answers: []
        };
        sections.push(section);
      }

      section.answers.push(answer);
    }

    return sections;
  };

  const [answers, setAnswers] = useState([]);
  const [mediaByAnswerId, setMediaByAnswerId] = useState({});
  const [hasLifeOutline, setHasLifeOutline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deletingPhotoPath, setDeletingPhotoPath] = useState(null);
  const [uploadingPhotoAnswerId, setUploadingPhotoAnswerId] = useState(null);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const [editingAnswer, setEditingAnswer] = useState(null);
  const [photoActionAnswerId, setPhotoActionAnswerId] = useState(null);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [preparingPhotoPath, setPreparingPhotoPath] = useState(null);
  const [replacingPhotoPath, setReplacingPhotoPath] = useState(null);

  const [editSelectedStyle, setEditSelectedStyle] = useState("readable");
  const [editDraftText, setEditDraftText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!editingAnswer) return;

  const previousBodyOverflow = document.body.style.overflow;
  const previousHtmlOverflow = document.documentElement.style.overflow;

  document.body.style.overflow = "hidden";
  document.documentElement.style.overflow = "hidden";

  return () => {
    document.body.style.overflow = previousBodyOverflow;
    document.documentElement.style.overflow = previousHtmlOverflow;
  };
}, [editingAnswer]);

const loadAnswers = async (options = {}) => {
  const { showLoading = true } = options;
    if (!user?.id) {
      setAnswers([]);
      setMediaByAnswerId({});
      setLoading(false);
      return;
    }

    try {
     if (showLoading) setLoading(true);

      const { data, error } = await supabaseClient
        .from("answers")
        .select(`
          id,
          book_project_id,
          sequence_order,
          transcript_raw,
          transcript_clean,
          transcript_readable,
          transcript_essay,
          transcript_edited,
          selected_style,
          ai_mirror,
          snippet,
          created_at
        `)
        .eq("user_id", user.id)
        .order("sequence_order", { ascending: true });

      if (error) throw error;

      const answerRows = data || [];
      setAnswers(answerRows);

      if (foundation?.project?.id) {
        const { data: introductionRow, error: introductionError } =
          await supabaseClient
            .from("project_introductions")
            .select("id")
            .eq("book_project_id", foundation.project.id)
            .eq("introduction_type", "life_outline")
            .maybeSingle();

        if (introductionError) {
          console.warn("life outline presence load error", introductionError);
        }

        setHasLifeOutline(!!introductionRow?.id);
      } else {
        setHasLifeOutline(false);
      }

      const answerIds = answerRows.map(a => a.id);

      if (answerIds.length > 0) {
        const { data: mediaRows, error: mediaError } = await supabaseClient
          .from("media_assets")
          .select("id, answer_id, asset_type, storage_path, meta_json, created_at")
          .in("answer_id", answerIds)
          .order("created_at", { ascending: true });

        if (mediaError) console.error("media load error", mediaError);

        const grouped = {};

        for (const media of mediaRows || []) {
          if (!grouped[media.answer_id]) grouped[media.answer_id] = [];

          let url = null;

          if (media.asset_type === "photo") {
            const { data: signed } = await supabaseClient.storage
              .from("photos")
              .createSignedUrl(media.storage_path, 60 * 60);
            url = signed?.signedUrl || null;
          }

          if (media.asset_type === "audio") {
            const { data: signed } = await supabaseClient.storage
              .from("audio")
              .createSignedUrl(media.storage_path, 60 * 60);
            url = signed?.signedUrl || null;
          }

          grouped[media.answer_id].push({ ...media, url });
        }

        setMediaByAnswerId(grouped);
      } else {
        setMediaByAnswerId({});
      }
    } catch (e) {
      console.error("story pages load error", e);
      alert("これまでの語りの読み込みに失敗しました。");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadAnswers();
  }, [user?.id]);


const pickAnswerTextByStyle = (answer, style) => {
  if (!answer) return "";

  if (style === "clean") {
    return answer.transcript_clean || answer.transcript_readable || answer.transcript_raw || answer.snippet || "";
  }

  if (style === "essay") {
    return answer.transcript_essay || answer.transcript_readable || answer.transcript_clean || answer.transcript_raw || answer.snippet || "";
  }

  return answer.transcript_readable || answer.transcript_clean || answer.transcript_raw || answer.snippet || "";
};

const openAnswerEditor = (answer) => {
  const style =
    answer?.selected_style === "clean" || answer?.selected_style === "essay"
      ? answer.selected_style
      : "readable";

  setEditingAnswer(answer);
  setEditSelectedStyle(style);
  setEditDraftText(answer?.transcript_edited || pickAnswerTextByStyle(answer, style));
};

const closeAnswerEditor = () => {
  setEditingAnswer(null);
  setEditDraftText("");
  setEditSelectedStyle("readable");
};

const changeEditStyle = (style) => {
  setEditSelectedStyle(style);
  setEditDraftText(pickAnswerTextByStyle(editingAnswer, style));
};

const saveAnswerEdit = async () => {
  if (!editingAnswer?.id || !user?.id) return;

  try {
    setSavingEdit(true);

    const { error } = await supabaseClient
      .from("answers")
      .update({
        selected_style: editSelectedStyle,
        transcript_edited: editDraftText
      })
      .eq("id", editingAnswer.id)
      .eq("user_id", user.id);

    if (error) throw error;

    await loadAnswers({ showLoading: false });
    closeAnswerEditor();
  } catch (e) {
    console.error("answer edit save error", e);
    alert("本文の保存に失敗しました。");
  } finally {
    setSavingEdit(false);
  }
};

const getAudioPathsForAnswer = (answerId) => {
  return (mediaByAnswerId[answerId] || [])
    .filter(item => item.asset_type === "audio" && item.storage_path)
    .map(item => item.storage_path);
};

const startEditRecordFromModal = (mode) => {
  if (!editingAnswer || !onEditRecord) return;

  const answer = editingAnswer;
  const audioPaths = getAudioPathsForAnswer(answer.id);

  const started = onEditRecord(answer, mode, audioPaths);

  if (started === false) return;

  closeAnswerEditor();
};

  const deletePhoto = async (photo) => {
    if (!photo?.storage_path) return;

    const ok = window.confirm("この写真をページから削除しますか？");
    if (!ok) return;

    try {
      setDeletingPhotoPath(photo.storage_path);

      const { error: storageError } = await supabaseClient.storage
        .from("photos")
        .remove([photo.storage_path]);

      if (storageError) {
        console.error("photo storage delete error", storageError);
        throw new Error("写真ファイルの削除に失敗しました");
      }

      if (photo.id) {
        const { error: dbError } = await supabaseClient
          .from("media_assets")
          .delete()
          .eq("id", photo.id)
          .eq("user_id", user.id);

        if (dbError) {
          console.error("photo media row delete error", dbError);
          throw new Error("写真情報の削除に失敗しました");
        }
      }

      await loadAnswers({ showLoading: false });
    } catch (e) {
      console.error(e);
      alert(e.message || "写真の削除に失敗しました。");
    } finally {
      setDeletingPhotoPath(null);
    }
  };

const openPhotoActionSheet = (answerId) => {
  setPhotoActionAnswerId(answerId);
};

const openExistingPhotoEditor = async (photo, answerId) => {
  if (!photo?.url || !photo?.storage_path) return;

  try {
    setPreparingPhotoPath(photo.storage_path);

    const response = await fetch(photo.url);
    if (!response.ok) throw new Error("写真を読み込めませんでした");

    const blob = await response.blob();
    const contentType = blob.type || photo.meta_json?.content_type || "image/jpeg";
    const fallbackName = photo.storage_path.split("/").pop() || "photo.jpg";
    const sourceFile = new File(
      [blob],
      photo.meta_json?.file_name || fallbackName,
      { type: contentType }
    );

    setEditingPhoto({ photo, answerId, sourceFile });
  } catch (e) {
    console.error("existing photo load error", e);
    alert(e.message || "写真の読み込みに失敗しました。");
  } finally {
    setPreparingPhotoPath(null);
  }
};

const replaceStoryPhoto = async (file, target) => {
  const photo = target?.photo;

  if (!file?.type?.startsWith("image/") || !photo?.id || !user?.id) return;

  const contentType = file.type || "image/jpeg";
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  const pathWithoutExtension = photo.storage_path.replace(/\.[^/.]+$/, "");
  const nextPath = `${pathWithoutExtension}-edit-${Date.now()}.${ext}`;

  try {
    setReplacingPhotoPath(photo.storage_path);

    const { error: uploadError } = await supabaseClient.storage
      .from("photos")
      .upload(nextPath, file, {
        contentType,
        upsert: false
      });

    if (uploadError) throw new Error("補正した写真の保存に失敗しました");

    const { error: updateError } = await supabaseClient
      .from("media_assets")
      .update({
        storage_path: nextPath,
        meta_json: {
          ...(photo.meta_json || {}),
          file_name: file.name || photo.meta_json?.file_name || null,
          content_type: contentType,
          corrected_at: new Date().toISOString()
        }
      })
      .eq("id", photo.id)
      .eq("user_id", user.id);

    if (updateError) {
      await supabaseClient.storage.from("photos").remove([nextPath]);
      throw new Error("補正した写真の情報を保存できませんでした");
    }

    const { error: removeError } = await supabaseClient.storage
      .from("photos")
      .remove([photo.storage_path]);

    if (removeError) {
      console.warn("old photo cleanup error", removeError);
    }

    await loadAnswers({ showLoading: false });
  } catch (e) {
    console.error("story photo replace error", e);
    alert(e.message || "写真の差し替えに失敗しました。");
  } finally {
    setReplacingPhotoPath(null);
  }
};

const handleStoryPhotoSelect = async (file, answerId) => {
    const selectedFiles = file?.type?.startsWith("image/") ? [file] : [];

    if (!answerId || selectedFiles.length === 0 || !user?.id) {
      return;
    }

    try {
      setUploadingPhotoAnswerId(answerId);

      const targetAnswer = answers.find(a => a.id === answerId);
      const existingMedia = mediaByAnswerId[answerId] || [];
      const existingPhotoCount = existingMedia.filter(m => m.asset_type === "photo").length;

      const photoRows = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        const contentType = file.type || "image/jpeg";

        const ext = contentType.includes("png")
            ? "png"
            : contentType.includes("webp")
              ? "webp"
              : "jpg";

        const photoNo = String(existingPhotoCount + i + 1).padStart(2, "0");
        const photoPath = `${user.id}/${answerId}/photo-${photoNo}.${ext}`;

        const { error: uploadError } = await supabaseClient.storage
          .from("photos")
          .upload(photoPath, file, {
            contentType,
            upsert: true
          });

        if (uploadError) {
          console.error("story photo upload error", uploadError);
          throw new Error("写真の保存に失敗しました");
        }

        photoRows.push({
          answer_id: answerId,
          user_id: user.id,
          family_id: foundation?.family?.id || null,
          book_project_id: targetAnswer?.book_project_id || foundation?.project?.id || null,
          person_id: foundation?.person?.id || null,
          asset_type: "photo",
          storage_path: photoPath,
          meta_json: {
            part: existingPhotoCount + i + 1,
            total_parts: existingPhotoCount + selectedFiles.length,
            file_name: file.name || null,
            content_type: contentType
          }
        });
      }

      if (photoRows.length > 0) {
        const { error: assetError } = await supabaseClient
          .from("media_assets")
          .upsert(photoRows, { onConflict: "answer_id, asset_type, storage_path" });

        if (assetError) {
          console.error("story photo media asset error", assetError);
          throw new Error("写真情報の保存に失敗しました");
        }
      }

      await loadAnswers({ showLoading: false });
    } catch (e) {
      console.error(e);
      alert(e.message || "写真の追加に失敗しました。");
    } finally {
      setUploadingPhotoAnswerId(null);
    }
  };

useEffect(() => {
  const sections = buildChapterSections(answers);

  if (sections.length === 0) return;

  const currentSection = sections[selectedChapterIndex];

  if (currentSection?.answers?.length > 0) return;

  const firstAnsweredIndex = sections.findIndex(section =>
    section.answers.length > 0
  );

  if (firstAnsweredIndex >= 0) {
    setSelectedChapterIndex(firstAnsweredIndex);
  }
}, [answers, questionSet, selectedChapterIndex]);

  const chapterSections = buildChapterSections(answers);
  const safeChapterIndex = Math.min(
    selectedChapterIndex,
    Math.max(chapterSections.length - 1, 0)
  );
  const selectedChapter = chapterSections[safeChapterIndex] || null;
  const visibleAnswers = selectedChapter?.answers || [];

return (
  <div className="h-full flex flex-col fade-enter px-4 pt-0 pb-4 -mt-8 overflow-hidden">
    <PhotoCorrectionFlow
      open={!!photoActionAnswerId}
      onClose={() => setPhotoActionAnswerId(null)}
      onComplete={(file) => {
        const answerId = photoActionAnswerId;
        setPhotoActionAnswerId(null);
        handleStoryPhotoSelect(file, answerId);
      }}
    />
    <PhotoCorrectionFlow
      open={!!editingPhoto}
      title="写真を切り抜き・補正"
      initialFile={editingPhoto?.sourceFile || null}
      onClose={() => setEditingPhoto(null)}
      onComplete={(file) => {
        const target = editingPhoto;
        setEditingPhoto(null);
        replaceStoryPhoto(file, target);
      }}
    />

{(uploadingPhotoAnswerId || preparingPhotoPath || replacingPhotoPath) && (
  <div className="fixed left-4 right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-white/10 bg-slate-950/92 px-5 py-4 shadow-2xl flex items-center gap-3">
    <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/75 animate-spin shrink-0" />

    <p className="text-white/70 text-sm tracking-widest">
      {preparingPhotoPath
        ? "写真を読み込んでいます..."
        : replacingPhotoPath
          ? "補正した写真を保存しています..."
          : "写真を保存しています..."}
    </p>
  </div>
)}
{editingAnswer && createPortal((
  <div className="fixed inset-0 z-[9999] w-[100dvw] h-[100dvh] bg-slate-950 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col fade-enter overflow-hidden">
    <div className="shrink-0 text-center mb-4">
      <p className="text-white/82 text-[1rem] text-narrative">
        文章を整える
      </p>
    </div>

    <div className="flex gap-2 mb-4 shrink-0">
      {[
        { key: "clean", label: "そのまま" },
        { key: "readable", label: "語り調" },
        { key: "essay", label: "作品調" }
      ].map(style => (
        <button
          key={style.key}
          type="button"
          onClick={() => changeEditStyle(style.key)}
          className={`flex-1 py-2 rounded-full text-xs border ${
            editSelectedStyle === style.key
              ? "bg-white/15 border-white/25 text-white"
              : "border-white/10 text-white/45"
          }`}
        >
          {style.label}
        </button>
      ))}
    </div>

    <div className="flex-1 min-h-0 glass-card p-5 overflow-hidden">
      <textarea
        value={editDraftText}
        onChange={(e) => setEditDraftText(e.target.value)}
        className="w-full h-full bg-transparent text-white/82 text-[1rem] leading-[2.05] outline-none resize-none text-narrative"
      />
    </div>

    <div className="mt-4 grid grid-cols-2 gap-3 shrink-0">
      <button
        type="button"
        onClick={() => startEditRecordFromModal("replace")}
        disabled={savingEdit}
        className="py-3 rounded-full border border-white/10 text-white/45 text-sm"
      >
        語り直す
      </button>

      <button
        type="button"
        onClick={() => startEditRecordFromModal("append")}
        disabled={savingEdit || getAudioPathsForAnswer(editingAnswer.id).length >= MAX_AUDIO_PARTS_PER_QUESTION}
        className={`py-3 rounded-full border border-white/10 text-sm ${
          getAudioPathsForAnswer(editingAnswer.id).length >= MAX_AUDIO_PARTS_PER_QUESTION
            ? "text-white/20 opacity-50"
            : "text-white/45"
        }`}
      >
        語り足す
      </button>
    </div>

    {getAudioPathsForAnswer(editingAnswer.id).length >= MAX_AUDIO_PARTS_PER_QUESTION && (
      <p className="mt-2 text-center text-white/28 text-xs leading-loose">
        語り足しの上限に達しました<br />
        ここからは本文の編集で整えられます。
      </p>
    )}

    <div className="mt-5 flex gap-3 shrink-0">
      <button
        type="button"
        onClick={closeAnswerEditor}
        disabled={savingEdit}
        className="flex-1 py-3 rounded-full border border-white/10 text-white/55 text-sm"
      >
        戻る
      </button>

      <button
        type="button"
        onClick={saveAnswerEdit}
        disabled={savingEdit}
        className={`flex-1 btn-quiet bg-white/10 py-3 rounded-full text-white text-sm ${
          savingEdit ? "opacity-40" : ""
        }`}
      >
        {savingEdit ? "保存中..." : "保存する"}
      </button>
    </div>
  </div>
), document.body)}



<div className="relative flex items-center justify-center mb-3 h-10">
  <button
    type="button"
    onClick={onBack}
    className="absolute left-0 w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center"
    aria-label="戻る"
  >
    <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
  </button>

  <p className="text-white/85 text-[0.95rem] text-narrative">
    これまでの語り
  </p>
</div>

{hasLifeOutline && onOpenLifeOutline && (
  <button
    type="button"
    onClick={onOpenLifeOutline}
    className="glass-card mb-3 px-5 py-4 flex items-center justify-between text-left"
  >
    <div>
      <p className="text-white/35 text-[0.68rem] tracking-[0.18em] mb-1">
        人生の輪郭
      </p>
      <p className="text-white/78 text-[0.95rem] text-narrative">
        私の歩み
      </p>
    </div>

    <ChevronRight
      size={18}
      className="text-white/30"
      strokeWidth={1.7}
    />
  </button>
)}

{chapterSections.length > 0 && (
  <div className="mb-3">
    <div className="flex gap-2 overflow-x-auto pb-1">
      {chapterSections.map((section, index) => {
        const hasAnswers = section.answers.length > 0;
        const isSelected = index === safeChapterIndex;

        return (
          <button
            key={section.chapterTitle}
            type="button"
            disabled={!hasAnswers}
            onClick={() => {
              if (!hasAnswers) return;
              setSelectedChapterIndex(index);
            }}
            className={`w-9 h-9 rounded-full shrink-0 border text-xs transition ${
              isSelected
                ? "bg-white text-slate-900 border-white"
                : hasAnswers
                  ? "bg-white/[0.07] text-white/55 border-white/[0.12]"
                  : "bg-transparent text-white/18 border-white/[0.06] opacity-45"
            }`}
            aria-label={`章 ${index + 1}${hasAnswers ? "" : " 未回答"}`}
          >
            {index + 1}
          </button>
        );
      })}
    </div>

    {selectedChapter && (
      <p className="text-center text-white/48 text-xs text-narrative">
        {selectedChapter.chapterTitle}
      </p>
    )}
  </div>
)}


      <div className="flex-1 overflow-y-auto space-y-5 pb-6">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <p className="text-white/35 text-sm tracking-widest animate-pulse">読み込んでいます...</p>
          </div>
        ) : visibleAnswers.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center">
          <p className="text-white/35 text-sm leading-loose">
            まだ語られていません
          </p>
          </div>
        ) : (
          visibleAnswers.map((answer) => {
            const body = getStoryBody(answer);
            const questionText = getQuestionTextForAnswer(answer);

            const media = mediaByAnswerId[answer.id] || [];
            const photos = media.filter(m => m.asset_type === "photo" && m.url);
            const audios = media.filter(m => m.asset_type === "audio" && m.url);

            return (
              <article key={answer.id} className="glass-card p-5 text-left">
                {questionText && (
                  <div className="border-l-2 border-amber-400/60 pl-4 mb-5">
                    <p className="text-white/58 text-[0.92rem] leading-loose text-narrative">
                      {questionText}
                    </p>
                  </div>
                )}

<div className="mb-5 space-y-3">
  {photos.length > 0 && (
    <div className="space-y-3">
      {photos.map((photo, photoIndex) => (
        <div
          key={photo.storage_path || photoIndex}
          className="relative w-full rounded-2xl overflow-hidden border border-white/10 bg-white/5"
        >
          <img
            src={photo.url}
            alt={`写真 ${photoIndex + 1}`}
            className="w-full h-auto object-contain bg-black/20"
          />

          <button
            type="button"
            onClick={() => deletePhoto(photo)}
            disabled={deletingPhotoPath === photo.storage_path || replacingPhotoPath === photo.storage_path}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white/85 text-sm"
            aria-label="写真を削除"
          >
            {deletingPhotoPath === photo.storage_path ? "…" : "×"}
          </button>

          <button
            type="button"
            onClick={() => openExistingPhotoEditor(photo, answer.id)}
            disabled={preparingPhotoPath === photo.storage_path || replacingPhotoPath === photo.storage_path}
            className="absolute z-10 left-3 bottom-3 rounded-full border border-white/30 bg-slate-950/95 px-3 py-2 text-white text-xs flex items-center gap-2 shadow-xl backdrop-blur"
          >
            <Pencil size={13} strokeWidth={1.8} />
            {preparingPhotoPath === photo.storage_path ? "読み込み中" : "切り抜き・補正"}
          </button>
        </div>
      ))}
    </div>
  )}
  <button
    type="button"
    onClick={() => openPhotoActionSheet(answer.id)}
    className="w-full rounded-2xl border border-dashed border-white/10 bg-white/[0.03] h-14 flex items-center justify-center"
  >
    <span className="text-white/42 text-sm tracking-widest">
      ＋ 写真を添える
    </span>
  </button>


</div>

                <p className="text-white/75 text-[0.98rem] leading-[2.15] whitespace-pre-wrap text-narrative">{body}</p>

        <button
          type="button"
  onClick={() => openAnswerEditor(answer)}
  className="mt-5 text-white/35 text-sm underline underline-offset-4"
>
  文章を整える
</button>

              {audios.length > 0 && (
                <div className="mt-5 space-y-4">
                  {audios.map((audio, audioIndex) => {
                    const recordedAt = formatRecordedAt(audio.created_at);
                    const audioLabel = audios.length > 1 ? `音声 ${audioIndex + 1}` : "音声";

                    return (
                      <div key={audio.storage_path || audioIndex}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <p className="text-white/28 text-xs">
                            {audioLabel}
                          </p>

                          {recordedAt && (
                            <p className="text-white/22 text-[0.68rem] tracking-widest">
                              {recordedAt}
                            </p>
                          )}
                        </div>

                        <audio src={audio.url} controls className="w-full" />
                      </div>
                    );
                  })}
                </div>
              )}

              </article>
            );
          })
        )}
      </div>

      <div className="pt-5 border-t border-white/10 space-y-4">
        <button onClick={onTalkMore} className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white">
          もう1ページ進める
        </button>
        <button onClick={onBack} className="w-full py-3 text-white/40 text-sm underline underline-offset-4">
          戻る
        </button>
      </div>
    </div>
  );
}
function Scene_NotificationSetup({
  user,
  initialPreference,
  onPreferenceSaved,
  onBack,
  onComplete
}) {
  const weekdayOptions = [
    "日曜日",
    "月曜日",
    "火曜日",
    "水曜日",
    "木曜日",
    "金曜日",
    "土曜日"
  ];
  const hourOptions = Array.from({ length: 24 }, (_, index) => index);
  const minuteOptions = [0, 15, 30, 45];
  const initialSchedules = getNotificationSchedules(initialPreference);
  const [schedules, setSchedules] = useState(() => (
    initialSchedules.length > 0
      ? initialSchedules.map((schedule, index) => ({ ...schedule, localId: schedule.id || `schedule-${index}` }))
      : [{ localId: "schedule-initial", weekday: 0, hour: 20, minute: 0, sort_order: 1, is_active: true }]
  ));
  const [saveState, setSaveState] = useState("idle");
  const [removedSchedule, setRemovedSchedule] = useState(null);
  const saveQueueRef = useRef(Promise.resolve());
  const latestSaveRef = useRef(Promise.resolve());
  const saveRequestIdRef = useRef(0);
  const initialSaveStartedRef = useRef(false);
  const savedTimerRef = useRef(null);
  const undoTimerRef = useRef(null);

  const hasDuplicateSchedule = nextSchedules => {
    const keys = nextSchedules.map(schedule => String(schedule.weekday));
    return new Set(keys).size !== keys.length;
  };

  const persistSchedules = nextSchedules => {
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    setSaveState("saving");
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);

    const payload = nextSchedules.map(schedule => ({
      weekday: Number(schedule.weekday),
      hour: Number(schedule.hour),
      minute: Number(schedule.minute || 0)
    }));

    const request = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const { data, error } = await supabaseClient.rpc("save_own_notification_schedules", {
          input_schedules: payload
        });
        if (error) throw error;

        const savedSchedules = (data || payload).map((schedule, index) => ({
          ...schedule,
          weekday: Number(schedule.weekday),
          hour: Number(schedule.hour),
          minute: Number(schedule.minute || 0),
          sort_order: Number(schedule.sort_order || index + 1),
          is_active: schedule.is_active !== false
        }));
        const first = savedSchedules[0];
        onPreferenceSaved?.({
          ...(initialPreference || {}),
          user_id: user?.id,
          weekday: first.weekday,
          hour: first.hour,
          minute: first.minute,
          timezone: "Asia/Tokyo",
          delivery_channel: "email",
          is_active: true,
          schedules: savedSchedules
        });
        return savedSchedules;
      });

    saveQueueRef.current = request;
    latestSaveRef.current = request;
    request
      .then(() => {
        if (saveRequestIdRef.current !== requestId) return;
        setSaveState("saved");
        savedTimerRef.current = window.setTimeout(() => setSaveState("idle"), 2200);
      })
      .catch(error => {
        console.error("notification schedules save error", error);
        if (saveRequestIdRef.current === requestId) setSaveState("error");
      });
    return request;
  };

  useEffect(() => {
    if (initialSaveStartedRef.current) return;
    initialSaveStartedRef.current = true;
    persistSchedules(schedules);
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
      if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    };
  }, []);

  const applySchedules = nextSchedules => {
    if (hasDuplicateSchedule(nextSchedules)) {
      alert("同じ曜日は1件だけ登録できます。");
      return;
    }
    const ordered = nextSchedules.map((schedule, index) => ({ ...schedule, sort_order: index + 1 }));
    setSchedules(ordered);
    persistSchedules(ordered);
  };

  const updateSchedule = (index, patch) => {
    applySchedules(schedules.map((schedule, scheduleIndex) => (
      scheduleIndex === index ? { ...schedule, ...patch } : schedule
    )));
  };

  const addSchedule = () => {
    if (schedules.length >= 3) return;
    const last = schedules[schedules.length - 1];
    let weekday = (Number(last.weekday) + 3) % 7;
    for (let offset = 0; offset < 7; offset += 1) {
      const candidate = (weekday + offset) % 7;
      const duplicated = schedules.some(schedule => Number(schedule.weekday) === candidate);
      if (!duplicated) { weekday = candidate; break; }
    }
    applySchedules([...schedules, {
      localId: `schedule-${Date.now()}`,
      weekday,
      hour: Number(last.hour),
      minute: Number(last.minute),
      is_active: true
    }]);
  };

  const removeSchedule = index => {
    if (index === 0 || schedules.length <= 1) return;
    const removed = { schedule: schedules[index], index };
    applySchedules(schedules.filter((_, scheduleIndex) => scheduleIndex !== index));
    setRemovedSchedule(removed);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => setRemovedSchedule(null), 5000);
  };

  const undoRemove = () => {
    if (!removedSchedule) return;
    const next = [...schedules];
    next.splice(Math.min(removedSchedule.index, next.length), 0, removedSchedule.schedule);
    setRemovedSchedule(null);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    applySchedules(next);
  };

  const finishAndContinue = async () => {
    try {
      await latestSaveRef.current;
      await onComplete?.();
    } catch (_error) {
      alert("配信日時を保存できませんでした。もう一度お試しください。");
    }
  };

  const returnAfterSave = async () => {
    try {
      await latestSaveRef.current;
      onBack?.();
    } catch (_error) {
      alert("配信日時を保存できませんでした。もう一度お試しください。");
    }
  };

  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8">
      {onBack ? (
        <div className="relative flex items-center justify-center h-10 mb-8 shrink-0">
          <button
            type="button"
            onClick={returnAfterSave}
            className="absolute left-0 w-10 h-10 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center"
            aria-label="設定へ戻る"
          >
            <ChevronLeft size={20} className="text-white/55" strokeWidth={1.8} />
          </button>
          <p className="text-white/88 text-[1.02rem] text-narrative">問いの届け方</p>
        </div>
      ) : (
        <OnboardingProgress current="weekly" outlineComplete />
      )}

      <div className="flex-1 flex flex-col justify-center">
        <div className="text-center mb-10">
          <p className="text-white/90 text-[1.1rem] text-narrative mb-4">
            選んだ曜日に、問いをお届けします
          </p>

          <p className="text-white/48 text-sm leading-loose">
            週1〜3回、受け取りやすい時間を選べます
          </p>
        </div>

        <div className="space-y-3">
          {schedules.map((schedule, index) => (
            <div key={schedule.localId || schedule.id || index} className="glass-card px-4 py-4 flex items-center gap-2">
              <select
                value={schedule.weekday}
                onChange={event => updateSchedule(index, { weekday: Number(event.target.value) })}
                aria-label={`${index + 1}件目の曜日`}
                className="bg-transparent text-white/88 text-[0.98rem] outline-none flex-1 min-w-0"
              >
                {weekdayOptions.map((label, weekdayIndex) => (
                  <option key={label} value={weekdayIndex} className="bg-slate-900">
                    {label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1 text-white/88 text-[0.98rem] shrink-0">
                <select value={schedule.hour} onChange={event => updateSchedule(index, { hour: Number(event.target.value) })} aria-label={`${index + 1}件目の時`} className="bg-transparent text-right outline-none">
                  {hourOptions.map(value => <option key={value} value={value} className="bg-slate-900">{String(value).padStart(2, "0")}</option>)}
                </select>
                <span className="text-white/30">:</span>
                <select value={schedule.minute} onChange={event => updateSchedule(index, { minute: Number(event.target.value) })} aria-label={`${index + 1}件目の分`} className="bg-transparent text-right outline-none">
                  {minuteOptions.map(value => <option key={value} value={value} className="bg-slate-900">{String(value).padStart(2, "0")}</option>)}
                </select>
              </div>
              {index > 0 ? (
                <button type="button" onClick={() => removeSchedule(index)} className="w-8 h-8 flex items-center justify-center text-white/30 text-lg" aria-label={`${index + 1}件目を削除`}>×</button>
              ) : <span className="w-8" aria-hidden="true" />}
            </div>
          ))}

          {schedules.length < 3 && (
            <button type="button" onClick={addSchedule} className="w-full py-3 flex items-center justify-center gap-2 text-white/48 text-sm">
              <Plus size={16} strokeWidth={1.7} />
              受け取り時間を追加
            </button>
          )}
        </div>

        <div className="mt-6 text-center min-h-[70px]">
          <p className="text-white/40 text-sm leading-loose">
            登録したメールアドレスに届きます
          </p>

          {saveState === "saving" && <p className="mt-3 text-white/28 text-xs">保存しています...</p>}
          {saveState === "saved" && <p className="mt-3 text-white/42 text-xs">✓ 保存しました</p>}
          {saveState === "error" && <button type="button" onClick={() => persistSchedules(schedules)} className="mt-3 text-rose-200/70 text-xs underline underline-offset-4">保存できませんでした。もう一度</button>}
          {saveState === "idle" && <p className="mt-3 text-white/28 text-xs leading-loose">変更すると自動で保存されます</p>}
          {removedSchedule && <button type="button" onClick={undoRemove} className="mt-3 ml-4 text-white/48 text-xs underline underline-offset-4">削除を元に戻す</button>}
        </div>
      </div>

      {!onBack && (
        <button type="button" onClick={finishAndContinue} disabled={saveState === "saving"} className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white disabled:opacity-40">
          次へ
        </button>
      )}
    </div>
  );
}



export default App;
