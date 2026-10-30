"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";

import { generateForImage } from "../../lib/generation";

async function getUserClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
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

  const result = await generateForImage(supabase, user, image, true);
  if (result.error) return result;

  revalidatePath(`/caption-rating/${image.id}`);
  revalidatePath("/");
  return { error: null };
}

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

  const result = await generateForImage(supabase, user, { id: image.id, url: imageUrl }, false);
  if (result.error) return { error: `Image uploaded, but captions could not be generated: ${result.error}` };
  revalidatePath("/");
  return { error: null, imageId: image.id };
}

// Clicking the vote you already cast removes it; otherwise it is created or switched.
export async function voteOnCaption(imageId, captionId, voteValue) {
  if (voteValue !== 1 && voteValue !== -1) {
    return { error: "Invalid vote." };
  }

  const { supabase, user } = await getUserClient();
  if (!user) {
    return { error: "You need to sign in to vote." };
  }

  const { data: existing, error: lookupError } = await supabase
    .from("caption_votes")
    .select("id, vote_value")
    .eq("caption_id", captionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (lookupError) {
    return { error: lookupError.message };
  }

  let writeError;
  if (!existing) {
    ({ error: writeError } = await supabase.from("caption_votes").insert({
      caption_id: captionId,
      user_id: user.id,
      vote_value: voteValue,
    }));
  } else if (existing.vote_value === voteValue) {
    ({ error: writeError } = await supabase
      .from("caption_votes")
      .delete()
      .eq("id", existing.id));
  } else {
    ({ error: writeError } = await supabase
      .from("caption_votes")
      .update({
        vote_value: voteValue,
        modified_datetime_utc: new Date().toISOString(),
      })
      .eq("id", existing.id));
  }

  revalidatePath(`/caption-rating/${imageId}`);
  return { error: writeError?.message ?? null };
}
