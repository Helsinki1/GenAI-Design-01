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

async function requestCaption(imageUrl, model) {
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content:
            "You write short, funny, meme-style captions for images. Reply with only the caption, no quotes, under 20 words.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Write one caption for this image." },
            { type: "image_url", image_url: { url: await toDataUrl(imageUrl) } },
          ],
        },
      ],
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message || `OpenAI request failed (${response.status}).`);
  }

  const caption = body?.choices?.[0]?.message?.content
    ?.trim()
    .replace(/^["“']+|["”']+$/g, "")
    .trim();
  if (!caption) {
    throw new Error("OpenAI returned an empty caption.");
  }
  return caption.slice(0, 300);
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
    content = await requestCaption(image.url, model);
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
