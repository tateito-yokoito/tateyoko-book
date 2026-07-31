import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const MAX_AUDIO_PARTS = 5;
const TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are not set");
    }

    const authHeader = req.headers.get("Authorization") || "";

    if (!authHeader) {
      throw new Error("Unauthorized");
    }

    const authClient = createClient(supabaseUrl, serviceRoleKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    const {
      data: { user },
      error: userError
    } = await authClient.auth.getUser();

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();

    const answerId = String(body.answerId || "").trim();
    const fallbackTranscript =
      String(body.fallbackTranscript || "").trim();

    const requestedPaths = Array.isArray(body.audioPaths)
      ? body.audioPaths
      : [];

    const audioPaths = requestedPaths
      .map((path: unknown) => String(path || "").trim())
      .filter(Boolean);

    if (!answerId) {
      throw new Error("answerId is required");
    }

    if (audioPaths.length > MAX_AUDIO_PARTS) {
      throw new Error(`audioPaths must contain at most ${MAX_AUDIO_PARTS} items`);
    }

    const userPathPrefix = `${user.id}/`;

    if (audioPaths.some(path => !path.startsWith(userPathPrefix))) {
      throw new Error("Forbidden audio path");
    }

    if (audioPaths.length === 0) {
      return jsonResponse({
        success: true,
        answerId,
        transcript_raw: fallbackTranscript,
        transcript: fallbackTranscript,
        transcribed_part_count: 0,
        used_fallback: true
      });
    }

    const transcripts: string[] = [];

    for (let index = 0; index < audioPaths.length; index++) {
      const path = audioPaths[index];

      const { data: audioBlob, error: downloadError } =
        await serviceClient.storage
          .from("audio")
          .download(path);

      if (downloadError || !audioBlob) {
        console.error("audio download error", {
          path,
          message: downloadError?.message || "audio blob not found"
        });
        throw new Error("音声ファイルを読み込めませんでした");
      }

      const fileName = makeAudioFileName(path, index);
      const audioFile = new File(
        [audioBlob],
        fileName,
        {
          type:
            audioBlob.type ||
            inferAudioContentType(fileName)
        }
      );

      const formData = new FormData();
      formData.append("file", audioFile);
      formData.append("model", TRANSCRIPTION_MODEL);
      formData.append("language", "ja");
      formData.append("temperature", "0");

      const transcriptionResponse = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiApiKey}`
          },
          body: formData
        }
      );

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        console.error("OpenAI transcription error", {
          status: transcriptionResponse.status,
          path,
          error: errorText
        });
        throw new Error("文字起こしに失敗しました");
      }

      const transcriptionJson = await transcriptionResponse.json();
      const transcript = String(transcriptionJson?.text || "").trim();

      if (transcript) {
        transcripts.push(transcript);
      }
    }

    const transcriptRaw =
      transcripts.join("\n\n").trim() ||
      fallbackTranscript;

    return jsonResponse({
      success: true,
      answerId,
      transcript_raw: transcriptRaw,
      transcript: transcriptRaw,
      transcribed_part_count: transcripts.length,
      used_fallback: transcripts.length === 0
    });
  } catch (error) {
    console.error(error);

    return jsonResponse(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error"
      },
      error instanceof Error && error.message === "Unauthorized"
        ? 401
        : 500
    );
  }
});

function makeAudioFileName(path: string, index: number) {
  const pathFileName =
    path.split("/").pop() ||
    `audio-${index + 1}.webm`;

  if (/\.[a-z0-9]+$/i.test(pathFileName)) {
    return pathFileName;
  }

  return `${pathFileName}.webm`;
}

function inferAudioContentType(fileName: string) {
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".mp4") || lowerName.endsWith(".m4a")) {
    return "audio/mp4";
  }

  if (lowerName.endsWith(".mp3") || lowerName.endsWith(".mpeg")) {
    return "audio/mpeg";
  }

  if (lowerName.endsWith(".wav")) {
    return "audio/wav";
  }

  if (lowerName.endsWith(".ogg")) {
    return "audio/ogg";
  }

  return "audio/webm";
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}
