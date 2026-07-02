import React, { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronRight, Files, Mic } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://wquxjeqkumossjxehdop.supabase.co";

const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const GAS_AI_URL = "https://script.google.com/macros/s/AKfycbwz5wfVtHfGPmxpK6l3rKiqVn235sqwhmdIuPYvKSex02B_k6a5ULc-m7l_K3ig_AE/exec";

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const askAI = async (transcriptRaw) => {
  const res = await fetch(GAS_AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'processAudio',
      transcriptRaw
    })
  });

  const json = await res.json();
  if (!json.success) throw new Error(json.error);
  return json.data;
};

function getSequenceFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const seq = parseInt(params.get("sequence"), 10);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
}

async function transcribeAudioOnServer({ answerId, audioPaths, fallbackTranscript }) {
  const { data, error } = await supabaseClient.functions.invoke("transcribe-audio", {
    body: {
      answerId,
      audioPaths,
      fallbackTranscript
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

async function polishTranscriptOnServer({ answerId, transcriptRaw, questionText }) {
  const { data, error } = await supabaseClient.functions.invoke("polish-transcript", {
    body: {
      answerId,
      transcriptRaw,
      questionText
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



function isDevMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("dev") === "1";
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

const DEV_LOGIN_EMAIL = "bird9bird9bird9+koedev@gmail.com";
const DEV_LOGIN_PASSWORD = "bird9bird9";

async function ensureProfileExists(sessionUser, registrationData = {}) {
  const userId = sessionUser.id;
  const email = sessionUser.email || registrationData.email || "";

  const familyName = registrationData.familyName || null;
  const givenName = registrationData.givenName || null;

  const fullName =
    registrationData.fullName ||
    [familyName, givenName].filter(Boolean).join(" ") ||
    "あなた";

  const preferredName =
    registrationData.preferredName ||
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
    const updatePayload = {
      family_name: familyName || existingProfile.family_name,
      given_name: givenName || existingProfile.given_name,
      name: fullName || existingProfile.name,
      display_name: fullName || existingProfile.display_name,
      preferred_name: preferredName || existingProfile.preferred_name
    };

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

    return updatedProfile;
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

  return newProfile;
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
    const { data: newProject, error: projectInsertError } = await supabaseClient
      .from("book_projects")
      .insert({
        family_id: family.id,
        owner_user_id: userId,
        subject_person_id: person.id,
        project_type: "koebook",
        title: `${displayName}さんのtateyoko BOOK`,
        status: "active"
      })
      .select()
      .single();

    if (projectInsertError) {
      console.error("book_projects insert error", projectInsertError);
      throw projectInsertError;
    }

    project = newProject;
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

  const { data: questionSet, error: setError } = await supabaseClient
    .from("question_sets")
    .select("id, code, name")
    .eq("product_type", "koebook")
    .eq("is_default", true)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (setError) {
    console.error("question set load error", setError);
    return;
  }

  if (!questionSet) {
    console.error("default question set not found");
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
        question_set_id: questionSet.id,
        question_set_code: questionSet.code,
        question_set_name: questionSet.name,
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
      content,
      chapter: chapterDescription || chapterTitle,
      chapter_label: chapterTitle,
      chapter_description: chapterDescription,
      prompt_style: meta.prompt_style || null,
      prompt_hint: meta.prompt_hint || "",
      reassurance_text: meta.reassurance_text || "",
      followup_hint: meta.followup_hint || "",
      min_duration_seconds: meta.min_duration_seconds || 25,
      min_transcript_chars: meta.min_transcript_chars || 80
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

const MIN_RECORDING_SECONDS = 15;

function isRecordingTooShort(duration) {
  const seconds = Number(duration || 0);
  return seconds < MIN_RECORDING_SECONDS;
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

function getNextDeliveryText(notificationPref) {
  if (
    !notificationPref ||
    notificationPref.weekday === undefined ||
    notificationPref.hour === undefined
  ) {
    return "次の問いが届いたら、また続きを開いてください。";
  }

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const now = new Date();

  const target = new Date(now);
  target.setHours(notificationPref.hour || 0);
  target.setMinutes(notificationPref.minute || 0);
  target.setSeconds(0);
  target.setMilliseconds(0);

  const currentWeekday = now.getDay();
  const targetWeekday = Number(notificationPref.weekday);

  let daysUntil = (targetWeekday - currentWeekday + 7) % 7;

  if (daysUntil === 0 && target <= now) {
    daysUntil = 7;
  }

  target.setDate(now.getDate() + daysUntil);

  const month = target.getMonth() + 1;
  const date = target.getDate();
  const weekday = weekdays[target.getDay()];
  const hour = String(target.getHours()).padStart(2, "0");
  const minute = String(target.getMinutes()).padStart(2, "0");

  return `次の問いは、${month}月${date}日（${weekday}）${hour}:${minute}ごろに届きます。`;
}
function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function hasDoneDailyMicCheck() {
  return localStorage.getItem("tateyoko_daily_mic_check") === getTodayKey();
}

function markDailyMicCheckDone() {
  localStorage.setItem("tateyoko_daily_mic_check", getTodayKey());
}

function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [scene, setScene] = useState(-1);
  const [user, setUser] = useState(null);
  const [questionsDB, setQuestionsDB] = useState([]);
  const [notificationPref, setNotificationPref] = useState(null);
  const [progress, setProgress] = useState({ currentIndex: 0, total: 0 });
  const [foundation, setFoundation] = useState(null);

  const [voiceData, setVoiceData] = useState({
    duration: 0,
    transcript: "",
    audioUrl: null,
    hasAudio: false,
    audioBlob: null,
    audioSegments: [],
    photoItems: [],
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
    addMoreCount: 0
  });

  useEffect(() => {
    const initApp = async () => {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (!session) {
          setScene(-1);
          return;
        }

        const profile = await ensureProfileExists(session.user);

        const { data: notificationData } = await supabaseClient
          .from("notification_preferences")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle();

        setNotificationPref(notificationData || null);

        const currentUser = {
          id: session.user.id,
          ...profile,
          name: profile?.display_name || profile?.name || "あなた"
        };

        const foundationData = await ensureUserFoundation(session.user.id, currentUser);
        setFoundation(foundationData);

        const questionSet = await loadUserQuestionSet(
          session.user.id,
          foundationData
        );

        const currentIndex = getInitialQuestionIndex(questionSet, profile);

        setUser(currentUser);
        setQuestionsDB(questionSet);
        setProgress({
          currentIndex,
          total: questionSet.length
        });


      if (!notificationData) {
        setScene("setup_intro");
      } else {
        setScene("home");
      }
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
    addMoreCount: 0
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
    ? (prev.duration || 0) + (dur || 0)
    : dur;

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

const handleTranscribeForReview = async (sourceVoiceData = voiceData) => {

  setVoiceData(prev => ({
    ...prev,
    transcriptionStatus: "processing",
    transcriptionError: ""
  }));

  try {
    const currentQ = questionsDB[progress.currentIndex];
    const currentSeq = currentQ?.sequence_order;

    let targetAnswerId = sourceVoiceData.answerId || crypto.randomUUID();

    const { data: existingAnswer } = await supabaseClient
      .from("answers")
      .select("id")
      .match({
        user_id: user.id,
        sequence_order: currentSeq
      })
      .maybeSingle();

    if (existingAnswer) targetAnswerId = existingAnswer.id;

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

      const segmentNo = String(i + 1).padStart(2, "0");
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

    setVoiceData(prev => ({
      ...prev,
      answerId: targetAnswerId,
      storagePath: paths[paths.length - 1] || prev.storagePath || null,
      storagePaths: paths.length > 0 ? paths : prev.storagePaths
    }));

    const aiResult = await transcribeAudioOnServer({
      answerId: targetAnswerId,
      audioPaths: paths,
      fallbackTranscript: sourceVoiceData.transcript
    });

const transcriptRaw =
  aiResult.transcript_raw ||
  aiResult.transcript ||
  sourceVoiceData.transcript ||
  "";

const firstData = {
  ...sourceVoiceData,
  answerId: targetAnswerId,
  storagePath: paths[paths.length - 1] || sourceVoiceData.storagePath || null,
  storagePaths: paths.length > 0 ? paths : sourceVoiceData.storagePaths,

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

setVoiceData(firstData);
setScene(3.5);

try {
  const polishResult = await polishTranscriptOnServer({
    answerId: targetAnswerId,
    transcriptRaw,
    questionText: currentQ?.content || ""
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

  const handleSaveAnswer = async (tag) => {
    setIsInitializing(true);

    try {
      const currentQ = questionsDB[progress.currentIndex];
      const currentSeq = currentQ?.sequence_order;
      const ansId = voiceData.answerId || crypto.randomUUID();

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

      if (storagePaths.length > 0) {
        const mediaRows = storagePaths.map((storagePath, index) => ({
          answer_id: finalAnswerId,
          user_id: user.id,
          family_id: foundation?.family?.id || null,
          book_project_id: foundation?.project?.id || currentQ?.book_project_id || null,
          person_id: foundation?.person?.id || null,
          asset_type: "audio",
          storage_path: storagePath,
          meta_json: {
            part: index + 1,
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
      setScene(6);
    } catch (error) {
      console.error(error);
      alert("保存に失敗しました。");
      setScene(5);
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

  return (
    <div className="app-container">
      {scene === -1 && (
        <Scene_Login
          onLogin={async (u) => {
            setIsInitializing(true);
            try {
              setUser(u);

              const foundationData = await ensureUserFoundation(u.id, u);
              setFoundation(foundationData);

              const questionSet = await loadUserQuestionSet(
                u.id,
                foundationData
              );

              const { data: notificationData } = await supabaseClient
                .from("notification_preferences")
                .select("*")
                .eq("user_id", u.id)
                .maybeSingle();

              setNotificationPref(notificationData || null);

              setQuestionsDB(questionSet);
              setProgress({
                currentIndex: 0,
                total: questionSet.length
              });

              if (!notificationData) {
                setScene("setup_intro");
              } else {
                setScene("home");
              }
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
          onComplete={() => setScene("notification_setup")}
        />
      )}

      {scene === "notification_setup" && (
        <Scene_NotificationSetup
          user={user}
          onComplete={async () => {
            setIsInitializing(true);
            try {
              const foundationData =
                foundation || (await ensureUserFoundation(user.id, user));

              setFoundation(foundationData);

              const questionSet = await loadUserQuestionSet(
                user.id,
                foundationData
              );

              setQuestionsDB(questionSet);
              setProgress({
                currentIndex: 0,
                total: questionSet.length
              });
              setScene("home");
            } finally {
              setIsInitializing(false);
            }
          }}
        />
      )}
      {scene === "home" && (
        <Scene_Home
          userName={user?.name || "あなた"}
          onStartTalking={() => setScene(0)}
          onOpenStoryPages={() => setScene("story_pages")}
          onOpenBookBuilder={() => setScene("book_builder")}
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
            if (hasDoneDailyMicCheck()) {
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
            markDailyMicCheckDone();
            setScene(1);
          }}
        />
      )}

      {scene === 1 && (
        <Scene1_MyPage
          progress={progress}
          question={currentQ}
          userName={user?.name || "あなた"}
          onNext={() => {
            resetVoiceData();
            setScene(2);
          }}
          onSkip={handleSkipQuestion}
        />
      )}

      {scene === 2 && (
        <Scene2_PreVoice
          onNext={() => setScene(3)}
          duration={3000}
        />
      )}

      {scene === 3 && (
<Scene_Recording
  question={currentQ}
onComplete={(t, d, u, b) => {
  handleRecordComplete(t, d, u, b);
}}
/>
      )}

      {scene === 3.5 && (

<Scene3_5_VoiceCheck
  data={voiceData}
  question={currentQ}
  onAddMore={() => {
    setVoiceData(prev => ({
      ...prev,
      appendMode: true,
      addMoreCount: (prev.addMoreCount || 0) + 1
    }));
    setScene(3);
  }}
  onRetry={() => {
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
  onProceed={() => setScene(4)}
/>

      )}

{scene === "short_recording" && (
  <Scene_ShortRecording
    onAddMore={() => {
      setVoiceData(prev => ({
        ...prev,
        appendMode: true,
        addMoreCount: (prev.addMoreCount || 0) + 1
      }));
      setScene(3);
    }}
    onRetry={() => {
      resetVoiceData();
      setScene(3);
    }}
    onSkip={handleSkipQuestion}
  />
)}

      {scene === "processing" && (
        <Scene_Processing />
      )}

      {scene === 4 && (
        <Scene4_AIMirror
          data={voiceData}
          onEditedTextChange={handleEditedTextChange}
          onAddPhotos={handlePhotoSelect}
          onRemovePhoto={handleRemovePhoto}
          onNext={() => setScene(5)}
        />
      )}

      {scene === 5 && (
        <Scene5_Meaning
          onNext={handleSaveAnswer}
        />
      )}

      {scene === 6 && (
        <Scene6_Completion
          onTalkMore={() => {
            resetVoiceData();
            setScene(2);
          }}
          onOpenStoryPages={() => setScene("story_pages")}
          onEndToday={() => setScene("end_today")}
        />
      )}

      {scene === "end_today" && (
        <Scene_EndToday
          notificationPref={notificationPref}
          onOpenStoryPages={() => setScene("story_pages")}
        />
      )}

      {scene === "story_pages" && (
        <Scene_StoryPages
          user={user}
          questionSet={questionsDB}
          onTalkMore={() => {
            resetVoiceData();
            setScene(2);
          }}
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

function Scene_Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [givenName, setGivenName] = useState("");

  const [step, setStep] = useState(1);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDevLogin = async () => {
    if (!isDevMode()) return;

    if (
      DEV_LOGIN_EMAIL === "dev-koe@example.com" ||
      DEV_LOGIN_PASSWORD === "CHANGE_ME_DEV_PASSWORD"
    ) {
      alert("開発用ログインのメールアドレスとパスワードを v1.html 内で設定してください。");
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
        email: session.user.email,
        familyName: "開発",
        givenName: "太郎",
        fullName: "開発 太郎",
        preferredName: "太郎さん"
      });

      onLogin({
        id: session.user.id,
        ...profile,
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

  const handleSendPin = async () => {
    setLoading(true);

    const { error } = await supabaseClient.auth.signInWithOtp({
      email
    });

    setLoading(false);

    if (error) {
      console.error(error);
      alert("エラーが発生しました。");
    } else {
      setStep(2);
    }
  };

  const handleVerifyPin = async () => {
    setLoading(true);

    const { data, error } = await supabaseClient.auth.verifyOtp({
      email,
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

    let profile;

    try {
      profile = await ensureProfileExists(session.user, {
        email,
        familyName,
        givenName,
        fullName,
        preferredName
      });
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
        name: profile?.display_name || profile?.name || "あなた",
        family_name: profile?.family_name || familyName || null,
        given_name: profile?.given_name || givenName || null,
        display_name: profile?.display_name || fullName || profile?.name || "あなた",
        preferred_name: profile?.preferred_name || preferredName
      });
    }, 100);
  };

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-4 text-center overflow-y-auto">
      <div className="mb-12 pt-8">
        <p className="text-[1.1rem] text-white/90 text-narrative mb-4">
          この物語を開くために<br />お名前とメールアドレスを教えてください。
        </p>
        <p className="ui-small">
          同じメールアドレスでは、前回の続きが開きます。
        </p>
      </div>

      {step === 1 ? (
        <div className="w-full max-w-[320px] space-y-8 mb-12">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="ui-label mb-2">姓</p>
              <input
                type="text"
                className="quiet-input"
                value={familyName}
                onChange={e => setFamilyName(e.target.value)}
                placeholder=""
              />
            </div>

            <div>
              <p className="ui-label mb-2">名</p>
              <input
                type="text"
                className="quiet-input"
                value={givenName}
                onChange={e => setGivenName(e.target.value)}
                placeholder=""
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
            onClick={handleSendPin}
            disabled={!email || !familyName || !givenName || loading}
            className="btn-quiet w-full py-4 rounded-full text-sm"
          >
            {loading ? "送信中..." : "認証コードを送る"}
          </button>

          {isDevMode() && (
            <button
              onClick={handleDevLogin}
              disabled={loading}
              className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
            >
              開発用ログイン
            </button>
          )}
        </div>
      ) : (
        <div className="w-full max-w-[280px] space-y-8 mb-12 fade-enter">
          <p className="ui-small">
            メールに届いた6桁のコードを入力してください
          </p>

          <input
            type="text"
            className="quiet-input tracking-widest text-xl"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="000000"
            maxLength="6"
          />

          <button
            onClick={handleVerifyPin}
            disabled={pin.length !== 6 || loading}
            className="btn-quiet w-full py-4 rounded-full text-sm"
          >
            {loading ? "確認中..." : "物語をはじめる"}
          </button>

          {isDevMode() && (
            <button
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

function Scene_SupporterInvite({ user, foundation, onComplete }) {
  const [supporterEmail, setSupporterEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const saveInvite = async () => {
    const inviteeEmail = supporterEmail.trim();

    if (!inviteeEmail) {
      onComplete();
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabaseClient
        .from("project_invites")
        .insert({
          book_project_id: foundation?.project?.id || null,
          inviter_user_id: user.id,
          invitee_email: inviteeEmail,
          role: "supporter",
          status: "pending"
        });

      if (error) throw error;

      onComplete();
    } catch (e) {
      console.error("supporter invite save error", e);
      alert("サポーター招待の保存に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-4 text-center">
      <div className="w-full max-w-[320px] space-y-9">
        <div className="space-y-5 text-narrative">
          <p className="text-[1.1rem] text-white/90">
            本づくりを手伝う人
          </p>

          <p className="text-white/60 text-[0.98rem] leading-loose">
            写真の追加や、完成前の確認を<br />
            家族に手伝ってもらうことができます。
          </p>
        </div>

        <div>
          <p className="ui-label mb-2">サポーターのメールアドレス</p>
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
            {loading ? "保存中..." : "サポーターを招待する"}
          </button>

          <button
            onClick={onComplete}
            disabled={loading}
            className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
          >
            今はひとりで始める
          </button>
        </div>
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

function Scene_Home({ userName, onStartTalking, onOpenStoryPages, onOpenBookBuilder }) {
  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8">
      <div className="flex-1 flex flex-col justify-center">
        <div className="text-center mb-12">
          <p className="text-white/35 text-xs tracking-[0.22em] mb-3">
            tateyoko BOOK
          </p>

          <p className="text-white/82 text-[1.05rem] text-narrative">
            {userName}さんの物語
          </p>
        </div>

        <div className="space-y-4">
          <HomeMenuButton
            icon={Mic}
            label="問いに語る"
            onClick={onStartTalking}
          />

          <HomeMenuButton
            icon={Files}
            label="語りを見る"
            onClick={onOpenStoryPages}
          />

          <HomeMenuButton
            icon={BookOpen}
            label="本に仕上げる"
            onClick={onOpenBookBuilder}
          />
        </div>
      </div>
    </div>
  );
}

function Scene_BookBuilder({ user, userName, questionSet = [], onBack }) {
  const steps = ["表紙", "語り", "紙面", "注文", "完了"];
  const [stepIndex, setStepIndex] = useState(0);
  const [coverPhoto, setCoverPhoto] = useState(null);
  const [coverColor, setCoverColor] = useState("#d9cdbd");
  const [bookTitle, setBookTitle] = useState(`${userName}さんの物語`);
  const [bookSubtitle, setBookSubtitle] = useState("家族に愛を込めて");
  const coverInputRef = useRef(null);

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
  }, [user?.id]);

  const handleCoverPhotoSelect = (files) => {
    const file = Array.from(files || []).find(item =>
      item && item.type && item.type.startsWith("image/")
    );

    if (!file) return;

    if (coverPhoto?.url) {
      try { URL.revokeObjectURL(coverPhoto.url); } catch (e) {}
    }

    setCoverPhoto({
      file,
      url: URL.createObjectURL(file),
      name: file.name || "cover-photo"
    });
  };

  return (
    <div className="h-[100dvh] min-h-0 flex flex-col fade-enter px-4 pt-0 pb-4 -mt-6 overflow-hidden">
      <div className="shrink-0 pb-3">
        <div className="text-center mb-3">
          <p className="text-white/90 text-[1.02rem] text-narrative">
            本に仕上げる
          </p>
        </div>

        <div>
          <div className="grid grid-cols-5 gap-2 pb-2">
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

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-24">
        {stepIndex === 0 && (
          <div className="space-y-5">
            <div className="glass-card p-5">
              <p className="text-white/40 text-xs tracking-widest mb-5">
                PREVIEW
              </p>

              <div className="flex justify-center">
                <div
                  className="relative w-[210px] h-[300px] shadow-2xl"
                  style={{ backgroundColor: coverColor }}
                >
                  <div className="absolute left-3 top-0 h-full w-px bg-black/18" />

                  <div className="h-full flex flex-col items-center justify-center px-8 text-center">
                    <div className="w-12 h-px bg-slate-900/55 mb-4" />

                    <p className="text-slate-900/85 text-[0.95rem] leading-relaxed text-narrative whitespace-pre-wrap">
                      {bookTitle || "タイトル"}
                    </p>

                    {coverPhoto?.url && (
                      <img
                        src={coverPhoto.url}
                        alt="表紙写真"
                        className="w-24 h-24 object-cover mt-6 mb-6"
                      />
                    )}

                    <p className="text-slate-900/65 text-[0.65rem] leading-relaxed">
                      {bookSubtitle || "副題"}
                    </p>
                  </div>

                  <div className="absolute -right-8 top-0 w-5 h-full bg-white/50 shadow-lg" />
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <p className="text-white/82 text-[1.05rem] text-narrative mb-5">
                表紙デザイン
              </p>

              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleCoverPhotoSelect(e.target.files);
                  e.target.value = "";
                }}
              />

              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="btn-quiet w-full py-4 rounded-full text-white/80 mb-6"
              >
                写真を挿入する
              </button>

              <div className="mb-6">
                <p className="text-white/40 text-xs tracking-widest mb-3">
                  冊子の色
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

              <div className="mb-5">
                <p className="text-white/40 text-xs tracking-widest mb-2">
                  タイトル
                </p>

                <textarea
                  value={bookTitle}
                  onChange={e => setBookTitle(e.target.value)}
                  className="quiet-input min-h-[92px] resize-none text-left"
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
            </div>
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
                .sort((a, b) => {
                  const aIncluded = includedStoryIds.includes(a.id);
                  const bIncluded = includedStoryIds.includes(b.id);

                  if (aIncluded !== bIncluded) return aIncluded ? -1 : 1;
                  return Number(a.sequence_order || 0) - Number(b.sequence_order || 0);
                })
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
                          <p className="text-white/75 text-sm leading-relaxed text-narrative line-clamp-2">
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

                            {!photo && included && (
                              <p className="text-amber-300/55 text-xs">
                                写真がありません
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3 mt-4">
                        <button
                          type="button"
                          onClick={() => {
                            setIncludedStoryIds(prev =>
                              prev.includes(answer.id)
                                ? prev.filter(id => id !== answer.id)
                                : [...prev, answer.id]
                            );
                          }}
                          className={`flex-1 py-3 rounded-full border text-sm flex items-center justify-center gap-2 ${
                            included
                              ? "border-white/[0.18] bg-white/[0.12] text-white"
                              : "border-white/10 text-white/40"
                          }`}
                        >
                          <span className={`w-5 h-5 rounded border flex items-center justify-center text-xs ${
                            included
                              ? "bg-white text-slate-900 border-white"
                              : "border-white/20"
                          }`}>
                            {included ? "✓" : ""}
                          </span>

                          <span>{included ? "本に入れる" : "本に入れない"}</span>
                        </button>

                        <button
                          type="button"
                          className="px-5 py-3 rounded-full border border-white/10 text-white/45 text-sm"
                        >
                          編集
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        )}

        {stepIndex >= 2 && (
          <div className="glass-card p-6 text-center opacity-60">
            <p className="text-white/82 text-[1.05rem] text-narrative mb-5">
              {steps[stepIndex]}
            </p>

            <p className="text-white/40 text-sm leading-loose">
              準備中
            </p>
          </div>
        )}
      </div>

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

function Scene1_MyPage({ progress, question, userName, onNext, onSkip }) {
  return (
    <div className="h-full flex flex-col fade-enter">
      <header className="mb-8 pt-2">
        <h1 className="text-white/70 text-sm tracking-widest mb-6">
          {userName || "あなた"}さんの物語
        </h1>

        <div className="space-y-2">
          <p className="text-white/60 text-sm tracking-widest">
            {question.chapter_description || question.chapter || question.chapter_label}
          </p>

          <div className="w-full h-[2px] bg-white/10 rounded-full">
            <div
              className="h-full bg-white/40"
              style={{
                width: `${(progress.currentIndex / Math.max(progress.total, 1)) * 100}%`
              }}
            />
          </div>

          <p className="text-white/80 text-sm tracking-widest mt-2">
            {progress.currentIndex + 1} / {progress.total} ページ
          </p>
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center">
        <div className="glass-card p-6 text-center space-y-6">
          <p className="text-white/50 text-sm tracking-widest">
            今日の問い
          </p>

          <p className="text-[1.1rem] text-narrative text-white/90 whitespace-pre-wrap">
            {question.content}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 mt-8 pb-8">
        <button
          onClick={onNext}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full tracking-widest text-white"
        >
          今回の問いに答える
        </button>

        <button
          onClick={onSkip}
          className="w-full py-3 text-white/40 text-sm underline underline-offset-4"
        >
          別の問いへ
        </button>
      </div>
    </div>
  );
}

function Scene2_PreVoice({ onNext, duration }) {
  useEffect(() => {
    const t = setTimeout(onNext, duration);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="h-full flex items-center justify-center text-center fade-enter">
      <p className="text-[1.1rem] text-white/70 text-narrative tracking-[0.15em] animate-pulse">
        すぐに答えなくても大丈夫です
      </p>
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
          マイクをテストしてみましょう
        </p>

        <p className="text-white/60 text-[0.98rem] leading-loose">
          いつもより少しゆっくり話してください。
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

function Scene_Recording({ question, onComplete }) {
  const [step, setStep] = useState(0);
  const [time, setTime] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [isPaused, setIsPaused] = useState(false);
  const hasStartedRecordingRef = useRef(false);
  const timeRef = useRef(0);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [waveTick, setWaveTick] = useState(0);

  const mediaRef = useRef(null);
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

  const startWaveMonitor = (stream) => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
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

      setCountdown(3);
      hasStartedRecordingRef.current = false;
      setStep("countdown");
    } catch (e) {
      console.error(e);
      setStep("mic_error");
    }
  };

  const startActualRecording = async () => {
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

    startWaveMonitor(stream);

      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      mediaRef.current = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      mediaRef.current.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRef.current.onstop = () => {
        const finalMimeType =
          mimeTypeRef.current ||
          mediaRef.current?.mimeType ||
          "audio/mp4";

        const blob = new Blob(chunksRef.current, {
          type: finalMimeType
        });

        const url = URL.createObjectURL(blob);

        const finalTranscript = formatTranscriptForReading([
          transcriptRef.current,
          interimRef.current
        ].filter(Boolean).join(" "));

        onComplete(finalTranscript, timeRef.current, url, blob);

        stopWaveMonitor();

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      };

      mediaRef.current.start(250);

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

    stopWaveMonitor();
  };

  const resumeRecording = () => {
    setIsPaused(false);

    if (mediaRef.current && mediaRef.current.state === "paused") {
      try {
        mediaRef.current.resume();
      } catch (e) {
        console.warn("media recorder resume failed", e);
      }
    }

    if (streamRef.current) {
      startWaveMonitor(streamRef.current);
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
      if (mediaRef.current && mediaRef.current.state !== "inactive") {
        mediaRef.current.stop();
      } else {
        const finalTranscript = formatTranscriptForReading([
          transcriptRef.current,
          interimRef.current
        ].filter(Boolean).join(" "));

        onComplete(finalTranscript, timeRef.current, null, null);

        stopWaveMonitor();

        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      }
    }, 1200);
  };

  return (
    <div className="h-full flex flex-col fade-enter text-center pt-12">
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-white/65 text-[1.05rem] text-narrative mb-8 whitespace-pre-wrap">
          {question.content}
        </p>
      </div>

      {step === 0 && (
        <button
          onClick={start}
          className="btn-quiet bg-white/10 w-full py-5 rounded-full text-white"
        >
          録音をはじめる
        </button>
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
        <div className="pb-16 text-center fade-enter">
          <p className="text-white/90 text-[4.5rem] leading-none font-light">
            {countdown}
          </p>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-7 pb-4">
          <div className="glass-card py-5 px-4">
            <p className="text-white/35 text-xs tracking-[0.18em] mb-3">
              {isPaused ? "一時停止中" : "録音中"}
            </p>

            <VoiceWave level={voiceLevel + waveTick * 0} />

            <p className="text-white/45 text-sm tracking-widest mt-3">
              {Math.floor(time / 60)}:{String(time % 60).padStart(2, "0")}
            </p>
          </div>

          <div className="flex items-center justify-center gap-5">
            <button
              type="button"
              onClick={isPaused ? resumeRecording : pauseRecording}
              className="w-24 h-24 rounded-full border border-white/15 bg-white/10 text-white shadow-xl"
            >
              {isPaused ? "再開" : "一時停止"}
            </button>

            <button
              type="button"
              onClick={stop}
              className="w-24 h-24 rounded-full bg-white text-slate-900 shadow-xl"
            >
              終了
            </button>
          </div>


        </div>
      )}

      {step === 2 && (
        <p className="text-white/45 text-sm tracking-widest pb-10">
          声を、言葉にしています...
        </p>
      )}
    </div>
  );
}

function Scene_ShortRecording({ onAddMore, onRetry, onSkip }) {
  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-6 text-center">
      <div className="glass-card p-7 w-full max-w-[330px] mb-8">
        <p className="text-white/85 text-[1.05rem] text-narrative mb-5">
          もう少しだけ、聞かせてください
        </p>

        <p className="text-white/55 text-sm leading-loose">
          今の録音は少し短かったようです。<br />
          この問いを本のページにするために、<br />
          あと少しだけ話してみましょう。
        </p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-[280px]">
        <button
          onClick={onAddMore}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
        >
          少し話し足す
        </button>

        <button
          onClick={onRetry}
          className="btn-quiet w-full py-4 rounded-full text-white"
        >
          最初から話し直す
        </button>

        <button
          onClick={onSkip}
          className="w-full py-3 text-white/40 text-sm underline underline-offset-4"
        >
          別の問いへ
        </button>
      </div>
    </div>
  );
}

function Scene3_5_VoiceCheck({
  data,
  question,
  onAddMore,
  onRetry,
  onRetryTranscription,
  onSelectStyle,
  onProceed
}) {
  const isShortAnswer = isRecordingTooShort(data.duration);
  const hasAlreadyAddedMore = (data.addMoreCount || 0) > 0;
  const shouldSuggestAddMore = isShortAnswer && !hasAlreadyAddedMore;

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
  const showAddMoreSuggestion = shouldSuggestAddMore && !isProcessing;

  return (
    <div className="h-full flex flex-col fade-enter px-4 py-8 overflow-hidden">

      <div className="text-center mb-6">
        <p className="text-white/90 text-[1.05rem] text-narrative mb-3">
          語りを確認します
        </p>

      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        <div className="glass-card p-5 mb-6">

          {data.audioUrl ? (
            <audio controls src={data.audioUrl} className="w-full" />
          ) : (
            <p className="text-white/40 text-sm">
              音声プレビューを作成できませんでした
            </p>
          )}
        </div>

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

        <div className="flex gap-2 mb-5">
          <button
            type="button"
            disabled={!canUseStyles}
            onClick={() => onSelectStyle("clean")}
            className={`flex-1 py-2 rounded-full text-xs border ${
              data.selectedStyle === "clean"
                ? "bg-white/15 border-white/25 text-white"
                : "border-white/10 text-white/45"
            } ${!canUseStyles ? "opacity-40" : ""}`}
          >
            そのまま
          </button>

          <button
            type="button"
            disabled={!canUseStyles}
            onClick={() => onSelectStyle("readable")}
            className={`flex-1 py-2 rounded-full text-xs border ${
              data.selectedStyle === "readable"
                ? "bg-white/15 border-white/25 text-white"
                : "border-white/10 text-white/45"
            } ${!canUseStyles ? "opacity-40" : ""}`}
          >
            語り調
          </button>

          <button
            type="button"
            disabled={!canUseStyles}
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

         {isProcessing ? (
           <div className="flex items-center gap-3 text-white/45 text-sm leading-loose">
             <div className="w-3 h-3 rounded-full border-2 border-white/20 border-t-white/70 animate-spin shrink-0"></div>
             <p>文字起こし中です</p>
           </div>
         ) : displayText ? (


          <p className="text-white/78 text-[1rem] leading-[2.05] whitespace-pre-wrap text-narrative">
            {displayText}
          </p>
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

        {showAddMoreSuggestion && (
          <div className="glass-card p-5 mb-6">
            <p className="text-white/70 text-sm leading-loose mb-3">
              もう少し話し足すこともできます。
            </p>

            <p className="text-white/48 text-sm leading-loose">
              このまま進んでも大丈夫です。
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

        <button
          onClick={onProceed}
          disabled={isProcessing || !displayText}
          className={`btn-quiet w-full py-4 rounded-full text-white ${
            isProcessing || !displayText ? "opacity-40" : ""
          }`}
        >
          この内容で進む
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

function Scene_Processing() {
  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter text-center">
      <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/80 animate-spin mb-6"></div>

      <p className="text-white/50 tracking-widest text-sm text-narrative">
        声を預かり、<br/>言葉を編んでいます...
      </p>
    </div>
  );
}


function Scene4_AIMirror({ data, onEditedTextChange, onAddPhotos, onRemovePhoto, onNext }) {
  const photoInputRef = useRef(null);
  const [isEditingText, setIsEditingText] = useState(false);
  const [draftText, setDraftText] = useState(data.editedText || "");

  const styleLabel =
    data.selectedStyle === "clean"
      ? "そのまま"
      : data.selectedStyle === "essay"
        ? "作品調"
        : "語り調";

  useEffect(() => {
    setDraftText(data.editedText || "");
  }, [data.editedText]);

  const saveDraftText = () => {
    onEditedTextChange(draftText);
    setIsEditingText(false);
  };

  return (
    <div className="h-full flex flex-col fade-enter">
      <div className="flex-1 overflow-y-auto pb-10">
        <div className="mb-8 p-4 bg-white/5 border-l-2 border-amber-600/50 rounded-r-lg">
          <p className="text-white/35 text-xs tracking-[0.18em] mb-3">
            選択中の文体：{styleLabel}
          </p>

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
          <p className="text-white/35 text-xs tracking-[0.18em] mb-4">
            PHOTO
          </p>

          {data.photoItems && data.photoItems.length > 0 && (
            <div className="grid grid-cols-2 gap-3 mb-5">
              {data.photoItems.map((photo, index) => (
                <div
                  key={photo.createdAt || index}
                  className="relative rounded-2xl overflow-hidden bg-white/5 border border-white/10"
                >
                  <img src={photo.url} alt={`写真 ${index + 1}`} className="w-full aspect-square object-cover" />

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

          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              onAddPhotos(e.target.files);
              e.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="btn-quiet w-full py-4 rounded-full text-white/80"
          >
            写真を挿入する
          </button>

          <p className="mt-4 text-white/35 text-xs leading-loose text-center">
            この語りに添えたい写真があれば、<br />
            あとから本のページに使えます。
          </p>
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

function Scene5_Meaning({ onNext }) {
  const tags = [
    "少し懐かしい時間",
    "誰かを思い出す時間",
    "自分を振り返る時間",
    "言葉にできなかった時間"
  ];

  return (
    <div className="h-full flex flex-col fade-enter">
      <div className="flex-1 flex flex-col justify-center text-center">
        <p className="text-white/80 text-[1.1rem] text-narrative mb-10">
          この語りは、あなたにとって<br />どんな時間でしたか？
        </p>

        <div className="flex flex-col gap-4 px-4">
          {tags.map(t => (
            <button
              key={t}
              onClick={() => onNext(t)}
              className="btn-quiet py-4 rounded-xl"
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={() => onNext("スキップ")}
        className="mb-6 text-white/40 text-sm underline underline-offset-4"
      >
        スキップして保存
      </button>
    </div>
  );
}

function Scene6_Completion({ onTalkMore, onOpenStoryPages, onEndToday }) {
  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter text-center">
      <p className="text-white/90 text-[1.05rem] mb-12">
        あなたの物語に、<br/>ひとつのページが加わりました
      </p>

      <div className="flex flex-col gap-4 w-full max-w-[280px]">
        <button
          onClick={onTalkMore}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
        >
          もう1ページ進める
        </button>

        <button
          onClick={onOpenStoryPages}
          className="w-full py-3 text-white/45 text-sm underline underline-offset-4"
        >
          これまでの語りを見る
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

function Scene_EndToday({ notificationPref, onOpenStoryPages }) {
  const nextDeliveryText = getNextDeliveryText(notificationPref);

  return (
    <div className="h-full flex flex-col items-center justify-center fade-enter px-6 text-center">
      <div className="space-y-7 mb-12 text-narrative">
        <p className="text-white/90 text-[1.08rem]">
          今日はここまでにしましょう
        </p>

        <p className="text-white/65 text-[0.98rem] leading-loose">
          今日の語りは、<br />
          ちゃんと残っています。
        </p>

        <p className="text-white/55 text-[0.95rem] leading-loose">
          {nextDeliveryText}
        </p>

        <p className="text-white/45 text-[0.92rem] leading-loose">
          以前届いたメッセージから開いても、<br />
          続きから再開できます。
        </p>
      </div>

      <div className="flex flex-col gap-4 w-full max-w-[280px]">
        <button
          onClick={onOpenStoryPages}
          className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
        >
          これまでの語りを見る
        </button>

        <p className="text-white/35 text-xs leading-loose">
          この画面は、そのまま閉じて大丈夫です。
        </p>
      </div>
    </div>
  );
}

function Scene_StoryPages({ user, questionSet = [], onTalkMore, onBack }) {

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

    for (const question of questionSet || []) {
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
  const [loading, setLoading] = useState(true);
  const [deletingPhotoPath, setDeletingPhotoPath] = useState(null);
  const [selectedChapterIndex, setSelectedChapterIndex] = useState(0);
  const storyPhotoInputRef = useRef(null);
  const pendingPhotoAnswerIdRef = useRef(null);

  const loadAnswers = async () => {
    if (!user?.id) {
      setAnswers([]);
      setMediaByAnswerId({});
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

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
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnswers();
  }, [user?.id]);

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

      await loadAnswers();
    } catch (e) {
      console.error(e);
      alert(e.message || "写真の削除に失敗しました。");
    } finally {
      setDeletingPhotoPath(null);
    }
  };

  const openPhotoPickerForAnswer = (answerId) => {
    pendingPhotoAnswerIdRef.current = answerId;
    storyPhotoInputRef.current?.click();
  };

  const handleStoryPhotoSelect = async (files) => {
    const answerId = pendingPhotoAnswerIdRef.current;
    const selectedFiles = Array.from(files || [])
      .filter(file => file && file.type && file.type.startsWith("image/"));

    if (!answerId || selectedFiles.length === 0 || !user?.id) return;

    try {
      setLoading(true);

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
          family_id: null,
          book_project_id: targetAnswer?.book_project_id || null,
          person_id: null,
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

      await loadAnswers();
    } catch (e) {
      console.error(e);
      alert(e.message || "写真の追加に失敗しました。");
    } finally {
      pendingPhotoAnswerIdRef.current = null;
      if (storyPhotoInputRef.current) {
        storyPhotoInputRef.current.value = "";
      }
      setLoading(false);
    }
  };



  const chapterSections = buildChapterSections(answers);
  const safeChapterIndex = Math.min(
    selectedChapterIndex,
    Math.max(chapterSections.length - 1, 0)
  );
  const selectedChapter = chapterSections[safeChapterIndex] || null;
  const visibleAnswers = selectedChapter?.answers || [];

return (
  <div className="h-full flex flex-col fade-enter px-4 pt-0 pb-4 -mt-8 overflow-hidden">
    <input
      ref={storyPhotoInputRef}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      onChange={(e) => handleStoryPhotoSelect(e.target.files)}
    />

    <div className="text-center mb-2">

  <p className="text-white/85 text-[0.95rem] text-narrative">
    これまでの語り
  </p>
</div>

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
          visibleAnswers.map((answer, index) => {
            const body = getStoryBody(answer);
            const questionText = getQuestionTextForAnswer(answer);

            const media = mediaByAnswerId[answer.id] || [];
            const photos = media.filter(m => m.asset_type === "photo" && m.url);
            const audios = media.filter(m => m.asset_type === "audio" && m.url);

            return (
              <article key={answer.id} className="glass-card p-5 text-left">
                {questionText && (
                  <div className="border-l-2 border-amber-400/70 pl-4 mb-5">
                    <p className="text-white/35 text-xs leading-loose">
                      {questionText}
                    </p>
                  </div>
                )}

<div className="mb-5">
  {photos.length > 0 ? (
    <div className="grid grid-cols-2 gap-3">
      {photos.map((photo, photoIndex) => (
        <div
          key={photo.storage_path || photoIndex}
          className="relative rounded-2xl overflow-hidden border border-white/10 bg-white/5"
        >
          <img src={photo.url} alt={`写真 ${photoIndex + 1}`} className="w-full aspect-square object-cover" />
          <button
            type="button"
            onClick={() => deletePhoto(photo)}
            disabled={deletingPhotoPath === photo.storage_path}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 text-white/85 text-sm"
          >
            {deletingPhotoPath === photo.storage_path ? "…" : "×"}
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => openPhotoPickerForAnswer(answer.id)}
        className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] aspect-square flex items-center justify-center"
      >
        <span className="text-white/28 text-xs tracking-widest">
          写真を挿入
        </span>
      </button>
    </div>
  ) : (
    <button
      type="button"
      onClick={() => openPhotoPickerForAnswer(answer.id)}
      className="w-full rounded-2xl border border-dashed border-white/10 bg-white/[0.03] h-24 flex items-center justify-center"
    >
      <span className="text-white/28 text-sm tracking-widest">
        写真を挿入
      </span>
    </button>
  )}
</div>

                <p className="text-white/75 text-[0.98rem] leading-[2.15] whitespace-pre-wrap text-narrative">{body}</p>

                {audios.length > 0 && (
                  <div className="mt-5 space-y-3">
                    {audios.map((audio, audioIndex) => (
                      <audio key={audio.storage_path || audioIndex} src={audio.url} controls className="w-full" />
                    ))}
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

function Scene_NotificationSetup({ user, onComplete }) {
  const presets = [
    {
      label: "日曜の夜 20:00",
      weekday: 0,
      hour: 20
    },
    {
      label: "月曜の朝 7:00",
      weekday: 1,
      hour: 7
    },
    {
      label: "金曜の夜 21:00",
      weekday: 5,
      hour: 21
    }
  ];

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  const [selectedPreset, setSelectedPreset] = useState(null);
  const [customMode, setCustomMode] = useState(false);
  const [weekday, setWeekday] = useState(0);
  const [time, setTime] = useState("20:00");
  const [loading, setLoading] = useState(false);

  const timeOptions = [];

  for (let h = 5; h <= 23; h++) {
    timeOptions.push(`${String(h).padStart(2, "0")}:00`);
    timeOptions.push(`${String(h).padStart(2, "0")}:30`);
  }

  async function savePreference() {
    try {
      setLoading(true);

      let finalWeekday;
      let finalHour;
      let finalMinute = 0;

      if (customMode) {
        finalWeekday = weekday;

        const [h, m] = time.split(":").map(Number);
        finalHour = h;
        finalMinute = m;
      } else {
        if (!selectedPreset) {
          alert("時間を選択してください");
          return;
        }

        finalWeekday = selectedPreset.weekday;
        finalHour = selectedPreset.hour;
        finalMinute = selectedPreset.minute || 0;
      }

      const {
        data: { session },
        error: sessionError
      } = await supabaseClient.auth.getSession();

      if (sessionError || !session) {
        throw new Error("ログイン情報が見つかりません");
      }

      await ensureProfileExists(session.user);

      const activeUserId = session.user.id;

      const { error } = await supabaseClient
        .from("notification_preferences")
        .upsert({
          user_id: activeUserId,
          email_enabled: true,
          line_enabled: false,
          weekday: finalWeekday,
          hour: finalHour,
          minute: finalMinute,
          timezone: "Asia/Tokyo",
          delivery_channel: "email"
        }, {
          onConflict: "user_id"
        });

      if (error) {
        throw error;
      }

      onComplete();
    } catch (e) {
      console.error(e);
      alert("設定の保存に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col justify-center fade-enter text-center px-4">
      <p className="text-[1.1rem] text-white/90 text-narrative mb-3">
        問いが届く時間を選んでください
      </p>

      <p className="ui-small mb-14">
        ご自身のペースに合わせて選んでください。
      </p>

      {!customMode ? (
        <>
          <div className="space-y-4 mb-10">
            {presets.map(preset => (
              <button
                key={preset.label}
                onClick={() => setSelectedPreset(preset)}
                className={`
                  w-full py-4 rounded-xl transition-all
                  ${selectedPreset?.label === preset.label
                    ? 'bg-white/12 border border-white/25 text-white'
                    : 'btn-quiet'}
                `}
              >
                ○ {preset.label}
              </button>
            ))}
          </div>

          <button
            onClick={savePreference}
            disabled={!selectedPreset || loading}
            className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white mb-12"
          >
            {loading ? "保存中..." : "この時間に受け取る"}
          </button>

          <div>
            <p className="ui-small mb-6">
              ご自身のペースに合わせて<br />
              選ぶこともできます。
            </p>

            <button
              onClick={() => setCustomMode(true)}
              className="text-white/45 text-sm underline underline-offset-4"
            >
              曜日と時間を設定する
            </button>
          </div>
        </>
      ) : (
        <div className="fade-enter">
          <div className="mb-12">
            <p className="text-white/50 text-sm mb-6">
              問いが届く曜日
            </p>

            <div className="flex justify-center gap-2 flex-wrap">
              {weekdays.map((day, index) => (
                <button
                  key={day}
                  onClick={() => setWeekday(index)}
                  className={`
                    w-12 h-12 rounded-full transition-all
                    ${weekday === index
                      ? 'bg-white text-slate-900'
                      : 'btn-quiet'}
                  `}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-14">
            <p className="text-white/50 text-sm mb-6">
              問いが届く時間
            </p>

            <select
              value={time}
              onChange={e => setTime(e.target.value)}
              className="quiet-input max-w-[180px] mx-auto text-center"
            >
              {timeOptions.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={savePreference}
            disabled={loading}
            className="btn-quiet bg-white/10 w-full py-4 rounded-full text-white"
          >
            {loading ? "保存中..." : "この時間に受け取る"}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;