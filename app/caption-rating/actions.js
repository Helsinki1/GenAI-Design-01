"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function getUserClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// Send the image bytes inline so OpenAI never has to follow the host's redirects.
async function toDataUrl(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Could not download the image (${response.status}).`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("The image is too large to caption.");
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  return `data:${contentType};base64,${bytes.toString("base64")}`;
}

function cleanCaption(text) {
  return text
    ?.trim()
    .replace(/^["“']+|["”']+$/g, "")
    .trim()
    .slice(0, 300);
}

// Returns `count` distinct captions for an image given as a data URL.
async function requestCaptions(dataUrl, model, count) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 80 * count,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You write short, funny, meme-style captions for images. Each caption is under 20 words, with no surrounding quotes. Reply with JSON: {"captions": ["..."]}.',
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                count === 1
                  ? "Write one caption for this image."
                  : `Write ${count} different captions for this image, each with a different joke.`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message || `OpenAI request failed (${response.status}).`);
  }

  let parsed;
  try {
    parsed = JSON.parse(body?.choices?.[0]?.message?.content ?? "");
  } catch {
    throw new Error("OpenAI returned captions in an unexpected format.");
  }

  const captions = (Array.isArray(parsed?.captions) ? parsed.captions : [])
    .filter((caption) => typeof caption === "string")
    .map(cleanCaption)
    .filter(Boolean)
    .slice(0, count);
  if (!captions.length) {
    throw new Error("OpenAI returned an empty caption.");
  }
  return captions;
}

export async function generateCaption(imageId) {
  const { supabase, user } = await getUserClient();
  if (!user) {
    return { error: "You need to sign in to generate captions." };
  }

  if (!process.env.OPENAI_API_KEY) {
    return { error: "OPENAI_API_KEY is not configured on the server." };
  }

  const { data: image, error: imageError } = await supabase
    .from("images")
    .select("id, url")
    .eq("id", imageId)
    .maybeSingle();

  if (imageError || !image) {
    return { error: imageError?.message || "Image not found." };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  let content;
  try {
    [content] = await requestCaptions(await toDataUrl(image.url), model, 1);
  } catch (error) {
    return { error: error.message };
  }

  const { error: insertError } = await supabase.from("captions").insert({
    content,
    image_id: image.id,
    model,
    created_by: user.id,
  });

  if (insertError) {
    return { error: insertError.message };
  }

  revalidatePath(`/caption-rating/${image.id}`);
  revalidatePath("/");
  return { error: null };
}

const UPLOAD_CAPTION_COUNT = 3;

// The browser uploads the file to Storage; this saves it as an image and captions it.
export async function addUploadedImage(imageUrl) {
  const { supabase, user } = await getUserClient();
  if (!user) {
    return { error: "You need to sign in to upload images." };
  }

  // Only accept files from this user's own folder in the uploads bucket.
  const uploadPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/uploads/${user.id}/`;
  if (typeof imageUrl !== "string" || !imageUrl.startsWith(uploadPrefix)) {
    return { error: "Invalid image URL." };
  }

  const { data: image, error: imageError } = await supabase
    .from("images")
    .insert({ url: imageUrl, created_by: user.id })
    .select("id")
    .single();

  if (imageError) {
    return { error: imageError.message };
  }

  revalidatePath("/");

  // The image is saved either way; caption failures can be retried from its page.
  if (!process.env.OPENAI_API_KEY) {
    return { error: "Image uploaded, but OPENAI_API_KEY is not configured so no captions were generated." };
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  let captions;
  try {
    captions = await requestCaptions(await toDataUrl(imageUrl), model, UPLOAD_CAPTION_COUNT);
  } catch (error) {
    return { error: `Image uploaded, but captions could not be generated: ${error.message}` };
  }

  const { error: insertError } = await supabase.from("captions").insert(
    captions.map((content) => ({
      content,
      image_id: image.id,
      model,
      created_by: user.id,
    })),
  );

  if (insertError) {
    return { error: `Image uploaded, but captions could not be saved: ${insertError.message}` };
  }

  return { error: null, imageId: image.id };
}

// Clicking the vote you already cast removes it; otherwise it is created or switched.
export async function voteOnCaption(imageId, captionId, voteValue) {
  if (voteValue !== 1 && voteValue !== -1) {
    return;
  }

  const { supabase, user } = await getUserClient();
  if (!user) {
    return;
  }

  const { data: existing } = await supabase
    .from("caption_votes")
    .select("id, vote_value")
    .eq("caption_id", captionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    await supabase.from("caption_votes").insert({
      caption_id: captionId,
      user_id: user.id,
      vote_value: voteValue,
    });
  } else if (existing.vote_value === voteValue) {
    await supabase.from("caption_votes").delete().eq("id", existing.id);
  } else {
    await supabase
      .from("caption_votes")
      .update({
        vote_value: voteValue,
        modified_datetime_utc: new Date().toISOString(),
      })
      .eq("id", existing.id);
  }

  revalidatePath(`/caption-rating/${imageId}`);
}
