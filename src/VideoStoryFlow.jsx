import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, ChevronLeft, ChevronRight, Pause, Play, RotateCw, Square, Trash2, Video, X } from "lucide-react";
import { Upload } from "tus-js-client";

const MAX_VIDEO_SECONDS = 5 * 60;
const VIDEO_BUCKET = "videos";
const CHUNK_SIZE = 6 * 1024 * 1024;

const FIXED_PROMPTS = [
  {
    kind: "current_self",
    label: "今の自分について",
    text: "最近、どんなふうに過ごしていますか？"
  },
  {
    kind: "memory",
    label: "忘れたくない思い出",
    text: "今でもよく思い出す場面を教えてください。"
  },
  {
    kind: "message",
    label: "大切な人へ",
    text: "本をひらく人へ、今伝えたいことはありますか？"
  }
];

function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function pickMimeType(candidates) {
  if (typeof MediaRecorder === "undefined") return "";
  return candidates.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

function extensionFor(type, fallback = "webm") {
  const value = String(type || "").toLowerCase();
  if (value.includes("mp4")) return "mp4";
  if (value.includes("ogg")) return "ogg";
  if (value.includes("jpeg")) return "jpg";
  return fallback;
}

function getQuestionText(answer, questionSet) {
  const question = (questionSet || []).find((item) => (
    Number(item.sequence_order) === Number(answer.sequence_order)
  ));
  return question?.content || question?.question_text || "これまでの問い";
}

function makeRecommendedPrompt(answerCount, questionCount) {
  const progress = questionCount > 0 ? answerCount / questionCount : 0;
  if (progress < 0.34) return FIXED_PROMPTS[0];
  if (progress < 0.8) return FIXED_PROMPTS[1];
  return FIXED_PROMPTS[2];
}

async function makePoster(videoElement) {
  if (!videoElement?.videoWidth || !videoElement?.videoHeight) return null;
  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / videoElement.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(videoElement.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(videoElement.videoHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
}

async function resumableUpload({ supabaseClient, file, path, onProgress }) {
  const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
  if (sessionError || !session?.access_token) throw new Error("ログイン情報を確認できませんでした");

  const supabaseUrl = String(supabaseClient.supabaseUrl || "").replace(/\/$/, "");
  const anonKey = String(supabaseClient.supabaseKey || "");
  if (!supabaseUrl || !anonKey) throw new Error("保存先を確認できませんでした");
  const storageUrl = supabaseUrl.replace(/\.supabase\.co$/i, ".storage.supabase.co");

  return await new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: `${storageUrl}/storage/v1/upload/resumable`,
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
        "x-upsert": "false"
      },
      metadata: {
        bucketName: VIDEO_BUCKET,
        objectName: path,
        contentType: file.type || "video/webm",
        cacheControl: "3600"
      },
      uploadSize: file.size,
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      removeFingerprintOnSuccess: true,
      onError: reject,
      onProgress: (uploaded, total) => onProgress?.(total > 0 ? uploaded / total : 0),
      onSuccess: () => resolve(path)
    });

    upload.findPreviousUploads()
      .then((previous) => {
        if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(reject);
  });
}

export default function VideoStoryFlow({
  open,
  user,
  foundation,
  answers = [],
  questionSet = [],
  stories = [],
  supabaseClient,
  onReload,
  onClose
}) {
  const [phase, setPhase] = useState("overview");
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [cameraFacing, setCameraFacing] = useState("user");
  const [cameraStatus, setCameraStatus] = useState("idle");
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [videoBlob, setVideoBlob] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [reviewUrl, setReviewUrl] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [posterUrls, setPosterUrls] = useState({});
  const [existingStory, setExistingStory] = useState(null);
  const [existingVideoUrl, setExistingVideoUrl] = useState("");
  const [deletingId, setDeletingId] = useState("");

  const cameraVideoRef = useRef(null);
  const reviewVideoRef = useRef(null);
  const streamRef = useRef(null);
  const audioStreamRef = useRef(null);
  const videoRecorderRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const videoChunksRef = useRef([]);
  const audioChunksRef = useRef([]);
  const recordedMimeRef = useRef("video/webm");
  const recordedAudioMimeRef = useRef("audio/webm");
  const timerRef = useRef(null);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const totalPausedMsRef = useRef(0);
  const stoppedRecordersRef = useRef(0);

  const projectId = foundation?.project?.id || "";
  const recommendedPrompt = useMemo(
    () => makeRecommendedPrompt(answers.length, questionSet.length),
    [answers.length, questionSet.length]
  );
  const remainingSeconds = Math.max(0, MAX_VIDEO_SECONDS - elapsed);

  const stopCamera = () => {
    for (const track of streamRef.current?.getTracks?.() || []) track.stop();
    for (const track of audioStreamRef.current?.getTracks?.() || []) track.stop();
    streamRef.current = null;
    audioStreamRef.current = null;
    if (cameraVideoRef.current) cameraVideoRef.current.srcObject = null;
  };

  const clearTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const resetCapture = () => {
    clearTimer();
    stopCamera();
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
    setRecording(false);
    setPaused(false);
    setElapsed(0);
    setCountdown(0);
    setVideoBlob(null);
    setAudioBlob(null);
    setReviewUrl("");
    setCameraStatus("idle");
    setErrorMessage("");
    videoChunksRef.current = [];
    audioChunksRef.current = [];
  };

  useEffect(() => {
    if (!open) return undefined;
    setPhase("overview");
    setSelectedPrompt(null);
    setExistingStory(null);
    setExistingVideoUrl("");
    setErrorMessage("");
    return () => resetCapture();
    // The capture cleanup is intentionally tied to opening/closing the flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || stories.length === 0) {
      setPosterUrls({});
      return undefined;
    }
    let cancelled = false;
    Promise.all(stories.map(async (story) => {
      if (!story.poster_storage_path) return [story.id, ""];
      const { data } = await supabaseClient.storage
        .from(VIDEO_BUCKET)
        .createSignedUrl(story.poster_storage_path, 60 * 60);
      return [story.id, data?.signedUrl || ""];
    })).then((entries) => {
      if (!cancelled) setPosterUrls(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [open, stories, supabaseClient]);

  useEffect(() => {
    if (!open || phase !== "camera") return undefined;
    let cancelled = false;
    setCameraStatus("opening");
    setErrorMessage("");

    navigator.mediaDevices?.getUserMedia({
      video: {
        facingMode: { ideal: cameraFacing },
        width: { ideal: 720 },
        height: { ideal: 1280 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    }).then((stream) => {
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play().catch(() => {});
      }
      setCameraStatus("ready");
    }).catch((error) => {
      console.error("video camera open error", error);
      setCameraStatus("error");
      setErrorMessage("カメラとマイクをひらけませんでした。端末の設定をご確認ください。");
    });

    return () => {
      cancelled = true;
      if (!recording) stopCamera();
    };
  }, [cameraFacing, open, phase]);

  useEffect(() => () => {
    clearTimer();
    stopCamera();
    if (reviewUrl) URL.revokeObjectURL(reviewUrl);
  }, [reviewUrl]);

  const finalizeRecording = () => {
    stoppedRecordersRef.current += 1;
    const expected = audioRecorderRef.current ? 2 : 1;
    if (stoppedRecordersRef.current < expected) return;

    clearTimer();
    const videoType = videoRecorderRef.current?.mimeType || recordedMimeRef.current;
    const audioType = audioRecorderRef.current?.mimeType || recordedAudioMimeRef.current;
    const nextVideoBlob = new Blob(videoChunksRef.current, { type: videoType });
    const nextAudioBlob = audioChunksRef.current.length > 0
      ? new Blob(audioChunksRef.current, { type: audioType })
      : null;
    const nextReviewUrl = URL.createObjectURL(nextVideoBlob);
    setVideoBlob(nextVideoBlob);
    setAudioBlob(nextAudioBlob);
    setReviewUrl(nextReviewUrl);
    setRecording(false);
    setPaused(false);
    stopCamera();
    setPhase("review");
  };

  const startRecordingNow = () => {
    const stream = streamRef.current;
    if (!stream) return;
    setErrorMessage("");
    videoChunksRef.current = [];
    audioChunksRef.current = [];
    stoppedRecordersRef.current = 0;
    totalPausedMsRef.current = 0;

    try {
      const videoMime = pickMimeType([
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ]);
      const videoOptions = {
        videoBitsPerSecond: 800_000,
        audioBitsPerSecond: 64_000,
        ...(videoMime ? { mimeType: videoMime } : {})
      };
      const videoRecorder = new MediaRecorder(stream, videoOptions);
      recordedMimeRef.current = videoMime || videoRecorder.mimeType || "video/webm";
      videoRecorderRef.current = videoRecorder;
      videoRecorder.ondataavailable = (event) => {
        if (event.data?.size > 0) videoChunksRef.current.push(event.data);
      };
      videoRecorder.onstop = finalizeRecording;

      const clonedAudioTracks = stream.getAudioTracks().map((track) => track.clone());
      let audioRecorder = null;
      if (clonedAudioTracks.length > 0) {
        const audioStream = new MediaStream(clonedAudioTracks);
        audioStreamRef.current = audioStream;
        const audioMime = pickMimeType(["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]);
        audioRecorder = new MediaRecorder(audioStream, {
          audioBitsPerSecond: 48_000,
          ...(audioMime ? { mimeType: audioMime } : {})
        });
        recordedAudioMimeRef.current = audioMime || audioRecorder.mimeType || "audio/webm";
        audioRecorderRef.current = audioRecorder;
        audioRecorder.ondataavailable = (event) => {
          if (event.data?.size > 0) audioChunksRef.current.push(event.data);
        };
        audioRecorder.onstop = finalizeRecording;
      } else {
        audioRecorderRef.current = null;
      }

      videoRecorder.start(1000);
      audioRecorder?.start(1000);
      startedAtRef.current = Date.now();
      setElapsed(0);
      setRecording(true);
      setPaused(false);

      timerRef.current = window.setInterval(() => {
        const activePauseMs = videoRecorder.state === "paused"
          ? Date.now() - pausedAtRef.current
          : 0;
        const nextElapsed = Math.floor((Date.now() - startedAtRef.current - totalPausedMsRef.current - activePauseMs) / 1000);
        setElapsed(Math.min(MAX_VIDEO_SECONDS, nextElapsed));
        if (nextElapsed >= MAX_VIDEO_SECONDS) {
          clearTimer();
          if (videoRecorderRef.current?.state !== "inactive") videoRecorderRef.current?.stop();
          if (audioRecorderRef.current?.state !== "inactive") audioRecorderRef.current?.stop();
        }
      }, 250);
    } catch (error) {
      console.error("video recording start error", error);
      setErrorMessage("この端末では録画を始められませんでした。");
    }
  };

  const beginCountdown = () => {
    if (cameraStatus !== "ready" || recording || countdown > 0) return;
    let value = 3;
    setCountdown(value);
    const countdownTimer = window.setInterval(() => {
      value -= 1;
      if (value <= 0) {
        window.clearInterval(countdownTimer);
        setCountdown(0);
        startRecordingNow();
      } else {
        setCountdown(value);
      }
    }, 800);
  };

  const stopRecording = () => {
    clearTimer();
    if (videoRecorderRef.current?.state !== "inactive") videoRecorderRef.current?.stop();
    if (audioRecorderRef.current?.state !== "inactive") audioRecorderRef.current?.stop();
  };

  const togglePause = () => {
    const videoRecorder = videoRecorderRef.current;
    const audioRecorder = audioRecorderRef.current;
    if (!videoRecorder || videoRecorder.state === "inactive") return;
    if (videoRecorder.state === "recording") {
      videoRecorder.pause();
      if (audioRecorder?.state === "recording") audioRecorder.pause();
      pausedAtRef.current = Date.now();
      setPaused(true);
    } else if (videoRecorder.state === "paused") {
      totalPausedMsRef.current += Date.now() - pausedAtRef.current;
      videoRecorder.resume();
      if (audioRecorder?.state === "paused") audioRecorder.resume();
      setPaused(false);
    }
  };

  const choosePrompt = (prompt) => {
    setSelectedPrompt(prompt);
    setPhase("prepare");
  };

  const switchCamera = () => {
    stopCamera();
    setCameraFacing((value) => value === "user" ? "environment" : "user");
  };

  const retake = () => {
    resetCapture();
    setPhase("camera");
  };

  const saveVideo = async () => {
    if (!videoBlob || !selectedPrompt || !projectId || !user?.id) return;
    setPhase("uploading");
    setUploadProgress(0);
    setUploadMessage("ビデオを保存しています");
    setErrorMessage("");

    const storyId = crypto.randomUUID();
    const usedSlots = new Set(stories.map((story) => Number(story.slot_order)));
    const slotOrder = usedSlots.has(1) ? 2 : 1;
    const rootPath = `${user.id}/${projectId}/${storyId}`;
    const videoPath = `${rootPath}/video.${extensionFor(videoBlob.type)}`;
    const audioPath = audioBlob
      ? `${rootPath}/audio.${extensionFor(audioBlob.type)}`
      : null;
    let posterPath = null;
    const uploadedPaths = [];

    try {
      await resumableUpload({
        supabaseClient,
        file: new File([videoBlob], `video.${extensionFor(videoBlob.type)}`, { type: videoBlob.type }),
        path: videoPath,
        onProgress: (value) => setUploadProgress(value * 0.82)
      });
      uploadedPaths.push(videoPath);

      const posterBlob = await makePoster(reviewVideoRef.current).catch(() => null);
      const supportingUploads = [];
      if (audioBlob && audioPath) {
        supportingUploads.push(
          supabaseClient.storage.from(VIDEO_BUCKET).upload(audioPath, audioBlob, {
            contentType: audioBlob.type || "audio/webm",
            upsert: false
          }).then(({ error }) => {
            if (error) throw error;
            uploadedPaths.push(audioPath);
          })
        );
      }
      if (posterBlob) {
        posterPath = `${rootPath}/poster.jpg`;
        supportingUploads.push(
          supabaseClient.storage.from(VIDEO_BUCKET).upload(posterPath, posterBlob, {
            contentType: "image/jpeg",
            upsert: false
          }).then(({ error }) => {
            if (error) throw error;
            uploadedPaths.push(posterPath);
          })
        );
      }
      await Promise.all(supportingUploads);
      setUploadProgress(0.9);
      setUploadMessage("文字起こしを準備しています");

      const initialTitle = ["current_self", "memory", "message"].includes(selectedPrompt.kind)
        ? selectedPrompt.label
        : "";
      const { error: insertError } = await supabaseClient
        .from("video_stories")
        .insert({
          id: storyId,
          book_project_id: projectId,
          subject_person_id: foundation?.person?.id || foundation?.project?.subject_person_id || null,
          created_by_user_id: user.id,
          slot_order: slotOrder,
          prompt_kind: selectedPrompt.kind,
          prompt_text: selectedPrompt.text,
          title: initialTitle,
          source_answer_id: selectedPrompt.sourceAnswerId || null,
          video_storage_path: videoPath,
          audio_storage_path: audioPath,
          poster_storage_path: posterPath,
          duration_seconds: Math.min(MAX_VIDEO_SECONDS, elapsed),
          mime_type: videoBlob.type || "video/webm",
          file_size_bytes: videoBlob.size,
          status: "processing",
          metadata: {
            recorded_facing_mode: cameraFacing,
            max_duration_seconds: MAX_VIDEO_SECONDS
          }
        });
      if (insertError) throw insertError;

      setUploadProgress(0.95);
      const { error: transcriptionError } = await supabaseClient.functions.invoke("transcribe-video-story", {
        body: { videoStoryId: storyId }
      });
      if (transcriptionError) console.warn("video transcription will need retry", transcriptionError);

      setUploadProgress(1);
      setUploadMessage("保存しました");
      await onReload?.();
      resetCapture();
      setPhase("overview");
    } catch (error) {
      console.error("video story save error", error);
      if (uploadedPaths.length > 0) {
        await supabaseClient.storage.from(VIDEO_BUCKET).remove(uploadedPaths).catch(() => {});
      }
      setErrorMessage("ビデオを保存できませんでした。通信を確認して、もう一度お試しください。");
      setPhase("review");
    }
  };

  const openExisting = async (story) => {
    setExistingStory(story);
    setExistingVideoUrl("");
    setPhase("existing");
    setErrorMessage("");
    const { data, error } = await supabaseClient.storage
      .from(VIDEO_BUCKET)
      .createSignedUrl(story.video_storage_path, 60 * 60);
    if (error || !data?.signedUrl) {
      setErrorMessage("ビデオをひらけませんでした。");
      return;
    }
    setExistingVideoUrl(data.signedUrl);
  };

  const deleteExisting = async (story) => {
    if (!window.confirm("このビデオを削除しますか？")) return;
    setDeletingId(story.id);
    try {
      const paths = [story.video_storage_path, story.audio_storage_path, story.poster_storage_path].filter(Boolean);
      if (paths.length > 0) {
        const { error: storageError } = await supabaseClient.storage.from(VIDEO_BUCKET).remove(paths);
        if (storageError) throw storageError;
      }
      const { error } = await supabaseClient.from("video_stories").delete().eq("id", story.id);
      if (error) throw error;
      await onReload?.();
      setPhase("overview");
      setExistingStory(null);
      setExistingVideoUrl("");
    } catch (error) {
      console.error("video story delete error", error);
      setErrorMessage("削除できませんでした。");
    } finally {
      setDeletingId("");
    }
  };

  if (!open) return null;

  return createPortal((
    <div className="fixed inset-0 z-[10020] h-[100dvh] w-[100dvw] overflow-hidden bg-slate-950 text-white fade-enter">
      <div className="mx-auto flex h-full w-full max-w-[560px] flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <header className="mb-4 flex h-12 shrink-0 items-center justify-between">
          <button
            type="button"
            onClick={() => {
              if (["overview", "uploading"].includes(phase)) return phase === "overview" ? onClose?.() : undefined;
              resetCapture();
              setPhase("overview");
              setErrorMessage("");
            }}
            disabled={phase === "uploading"}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] disabled:opacity-30"
            aria-label={phase === "overview" ? "閉じる" : "戻る"}
          >
            {phase === "overview" ? <X size={21} /> : <ChevronLeft size={22} />}
          </button>
          <div className="flex items-center gap-2 text-[0.98rem] text-white/88 text-narrative">
            <Video size={19} strokeWidth={1.7} />
            ビデオで残す
          </div>
          <div className="w-11 text-right text-xs text-white/34">{stories.length}/2</div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          {phase === "overview" && (
            <div className="space-y-4 pt-2">
              <div className="mb-7 text-center">
                <p className="text-[1.15rem] leading-loose text-white/86 text-narrative">声と一緒に、表情も残せます。</p>
                <p className="mt-2 text-sm leading-loose text-white/40">一冊につき2本まで・1本5分まで</p>
              </div>

              {stories.map((story) => (
                <button
                  key={story.id}
                  type="button"
                  onClick={() => openExisting(story)}
                  className="glass-card flex min-h-[92px] w-full items-center gap-4 p-3 text-left"
                >
                  <div className="flex h-[68px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06]">
                    {posterUrls[story.id]
                      ? <img src={posterUrls[story.id]} alt="" className="h-full w-full object-cover" />
                      : <Video size={23} className="text-white/35" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.98rem] text-white/80 text-narrative">{story.title || story.prompt_text || "残したビデオ"}</p>
                    <p className="mt-2 text-xs text-white/34">{formatTime(story.duration_seconds)}{story.status === "processing" ? " ・ 文字起こし中" : ""}</p>
                  </div>
                  <ChevronRight size={19} className="shrink-0 text-white/28" />
                </button>
              ))}

              {stories.length < 2 && (
                <button
                  type="button"
                  onClick={() => setPhase("recommend")}
                  className="btn-quiet mt-3 flex min-h-[64px] w-full items-center justify-center gap-3 rounded-full bg-white/10 px-5 text-white/90"
                >
                  <Camera size={21} strokeWidth={1.7} />
                  ビデオを追加する
                </button>
              )}

              {stories.length >= 2 && (
                <p className="pt-4 text-center text-sm leading-loose text-white/38">2本保存されています。<br />入れ替える場合は、先に1本削除してください。</p>
              )}
            </div>
          )}

          {phase === "recommend" && (
            <div className="pt-4 text-center">
              <p className="text-xs tracking-[0.2em] text-amber-200/50">おすすめ</p>
              <div className="glass-card mt-5 px-6 py-10">
                <p className="text-[1.35rem] leading-[2] text-white/90 text-narrative">{recommendedPrompt.text}</p>
              </div>
              <button type="button" onClick={() => choosePrompt(recommendedPrompt)} className="btn-quiet mt-8 w-full rounded-full bg-white py-4 text-slate-900">この内容で録る</button>
              <button type="button" onClick={() => setPhase("choices")} className="mt-5 min-h-[52px] w-full text-sm text-white/55 underline underline-offset-4">ほかの内容から選ぶ</button>
            </div>
          )}

          {phase === "choices" && (
            <div className="pt-2">
              <h1 className="mb-6 text-center text-[1.08rem] text-white/85 text-narrative">何を残しますか？</h1>
              <div className="space-y-3">
                {FIXED_PROMPTS.map((prompt) => (
                  <button key={prompt.kind} type="button" onClick={() => choosePrompt(prompt)} className="glass-card flex min-h-[68px] w-full items-center justify-between px-5 text-left text-white/78">
                    <span>{prompt.label}</span><ChevronRight size={18} className="text-white/26" />
                  </button>
                ))}
                <button type="button" onClick={() => setPhase("questions")} className="glass-card flex min-h-[68px] w-full items-center justify-between px-5 text-left text-white/78"><span>これまでの問いから選ぶ</span><ChevronRight size={18} className="text-white/26" /></button>
                <button type="button" onClick={() => choosePrompt({ kind: "free", label: "自由に話す", text: "自由にお話しください。" })} className="glass-card flex min-h-[68px] w-full items-center justify-between px-5 text-left text-white/78"><span>自由に話す</span><ChevronRight size={18} className="text-white/26" /></button>
                <button type="button" onClick={() => setPhase("custom")} className="glass-card flex min-h-[68px] w-full items-center justify-between px-5 text-left text-white/78"><span>内容を自分で書く</span><ChevronRight size={18} className="text-white/26" /></button>
              </div>
            </div>
          )}

          {phase === "questions" && (
            <div className="pt-2">
              <h1 className="mb-2 text-center text-[1.08rem] text-white/85 text-narrative">これまでの問いから選ぶ</h1>
              <p className="mb-6 text-center text-sm text-white/38">もう一度、顔を見ながら残したい問い</p>
              <div className="space-y-3">
                {answers.map((answer) => {
                  const text = getQuestionText(answer, questionSet);
                  return (
                    <button key={answer.id} type="button" onClick={() => choosePrompt({ kind: "existing_question", label: "これまでの問い", text, sourceAnswerId: answer.id })} className="glass-card flex min-h-[76px] w-full items-center justify-between gap-4 px-5 py-4 text-left">
                      <span className="text-[0.92rem] leading-loose text-white/70 text-narrative">{text}</span><ChevronRight size={18} className="shrink-0 text-white/26" />
                    </button>
                  );
                })}
                {answers.length === 0 && <p className="py-12 text-center text-sm text-white/38">選べる問いはまだありません。</p>}
              </div>
            </div>
          )}

          {phase === "custom" && (
            <div className="pt-3">
              <h1 className="text-center text-[1.08rem] text-white/85 text-narrative">残したい内容を書く</h1>
              <p className="mb-5 mt-2 text-center text-sm text-white/38">短いメモで大丈夫です</p>
              <textarea value={customPrompt} onChange={(event) => setCustomPrompt(event.target.value.slice(0, 180))} placeholder="例：家族で過ごした夏の思い出" className="glass-card h-36 w-full resize-none bg-transparent p-5 text-[1rem] leading-loose text-white/80 outline-none placeholder:text-white/24" />
              <button type="button" disabled={!customPrompt.trim()} onClick={() => choosePrompt({ kind: "custom", label: customPrompt.trim(), text: customPrompt.trim() })} className="btn-quiet mt-6 w-full rounded-full bg-white py-4 text-slate-900 disabled:opacity-30">この内容で録る</button>
            </div>
          )}

          {phase === "prepare" && selectedPrompt && (
            <div className="pt-2 text-center">
              <p className="text-xs tracking-[0.18em] text-amber-200/45">話す内容</p>
              <div className="glass-card mt-4 px-6 py-8">
                <p className="text-[1.25rem] leading-[2] text-white/90 text-narrative">{selectedPrompt.text}</p>
              </div>
              <div className="mt-7 rounded-3xl border border-white/8 bg-white/[0.025] px-5 py-5 text-left text-sm leading-[2] text-white/48">
                <p>2〜3分がおすすめです。短くても大丈夫です。</p>
                <p className="mt-3">顔や部屋の背景、ほかの人が映ってもよいか確認してください。</p>
              </div>
              <button type="button" onClick={() => setPhase("camera")} className="btn-quiet mt-7 flex w-full items-center justify-center gap-3 rounded-full bg-white py-4 text-slate-900"><Camera size={20} />カメラをひらく</button>
            </div>
          )}

          {phase === "camera" && (
            <div className="flex min-h-full flex-col">
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[2rem] border border-white/10 bg-black">
                <video ref={cameraVideoRef} muted playsInline autoPlay className={`h-full w-full object-cover ${cameraFacing === "user" ? "-scale-x-100" : ""}`} />
                {cameraStatus === "opening" && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/55">カメラをひらいています…</div>}
                {countdown > 0 && <div className="absolute inset-0 flex items-center justify-center bg-black/25 text-7xl text-white">{countdown}</div>}
                {recording && <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/45 px-3 py-2 text-sm"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />{formatTime(elapsed)}</div>}
                {!recording && cameraStatus === "ready" && <button type="button" onClick={switchCamera} className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-black/45" aria-label="カメラを切り替える"><RotateCw size={20} /></button>}
                {recording && remainingSeconds <= 30 && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-sm text-amber-100">あと {formatTime(remainingSeconds)}</div>}
              </div>
              <p className="mt-4 text-center text-[0.95rem] leading-loose text-white/68 text-narrative">{selectedPrompt?.text}</p>
              {errorMessage && <p className="mt-3 text-center text-sm leading-loose text-red-200/75">{errorMessage}</p>}
              <div className="mt-5 flex min-h-[82px] items-center justify-center gap-7">
                {!recording ? (
                  <button type="button" onClick={beginCountdown} disabled={cameraStatus !== "ready" || countdown > 0} className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white/65 bg-red-400/80 disabled:opacity-30" aria-label="録画を始める"><span className="h-11 w-11 rounded-full bg-red-300" /></button>
                ) : (
                  <>
                    <button type="button" onClick={togglePause} className="flex h-14 w-14 items-center justify-center rounded-full border border-white/18 bg-white/10" aria-label={paused ? "録画を再開" : "一時停止"}>{paused ? <Play size={23} /> : <Pause size={23} />}</button>
                    <button type="button" onClick={stopRecording} className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white/65 bg-white/10" aria-label="録画を終える"><Square size={30} fill="currentColor" /></button>
                  </>
                )}
              </div>
              <p className="text-center text-xs text-white/28">最長5分で自動的に止まります</p>
            </div>
          )}

          {phase === "review" && reviewUrl && (
            <div className="pt-1">
              <h1 className="mb-4 text-center text-[1.08rem] text-white/85 text-narrative">このビデオを残しますか？</h1>
              <video ref={reviewVideoRef} src={reviewUrl} controls playsInline preload="metadata" className="aspect-[3/4] w-full rounded-[2rem] border border-white/10 bg-black object-contain" />
              <p className="mt-3 text-center text-sm text-white/40">{formatTime(elapsed)}</p>
              {errorMessage && <p className="mt-3 rounded-2xl border border-red-200/10 bg-red-200/[0.04] px-4 py-3 text-center text-sm leading-loose text-red-100/75">{errorMessage}</p>}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button type="button" onClick={retake} className="min-h-[56px] rounded-full border border-white/12 text-white/60">撮り直す</button>
                <button type="button" onClick={saveVideo} className="btn-quiet min-h-[56px] rounded-full bg-white text-slate-900">このビデオを残す</button>
              </div>
            </div>
          )}

          {phase === "uploading" && (
            <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
              <div className="relative h-24 w-24 rounded-full border border-white/10">
                <div className="absolute inset-2 rounded-full border-2 border-white/10 border-t-amber-200/70 animate-spin" />
                <span className="absolute inset-0 flex items-center justify-center text-sm text-white/68">{Math.round(uploadProgress * 100)}%</span>
              </div>
              <p className="mt-7 text-[1rem] text-white/75 text-narrative">{uploadMessage}</p>
              <p className="mt-3 text-sm leading-loose text-white/35">画面を閉じずにお待ちください</p>
            </div>
          )}

          {phase === "existing" && existingStory && (
            <div className="pt-1">
              <h1 className="mb-4 text-center text-[1.08rem] text-white/85 text-narrative">{existingStory.title || existingStory.prompt_text || "残したビデオ"}</h1>
              {existingVideoUrl
                ? <video src={existingVideoUrl} poster={posterUrls[existingStory.id] || undefined} controls playsInline preload="metadata" className="aspect-[3/4] w-full rounded-[2rem] border border-white/10 bg-black object-contain" />
                : <div className="flex aspect-[3/4] w-full items-center justify-center rounded-[2rem] border border-white/10 bg-black/50 text-sm text-white/40">ビデオをひらいています…</div>}
              {existingStory.prompt_text && <p className="mt-5 text-center text-[0.95rem] leading-loose text-white/58 text-narrative">{existingStory.prompt_text}</p>}
              {existingStory.transcript_text && <div className="glass-card mt-5 p-5"><p className="whitespace-pre-wrap text-sm leading-[2] text-white/55 text-narrative">{existingStory.transcript_text}</p></div>}
              {errorMessage && <p className="mt-4 text-center text-sm text-red-100/70">{errorMessage}</p>}
              <button type="button" onClick={() => deleteExisting(existingStory)} disabled={deletingId === existingStory.id} className="mx-auto mt-7 flex min-h-[52px] items-center justify-center gap-2 px-5 text-sm text-white/38"><Trash2 size={17} />{deletingId ? "削除しています…" : "このビデオを削除"}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  ), document.body);
}
