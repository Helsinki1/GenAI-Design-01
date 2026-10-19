"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient } from "../../../lib/admin";
import { generateCaption } from "../../caption-rating/actions";

const MAX_CAPTION_LENGTH = 300;

function cleanContent(content) {
  return typeof content === "string" ? content.trim().slice(0, MAX_CAPTION_LENGTH) : "";
}

function revalidateCaptionPages(imageId) {
  revalidatePath("/admin", "layout");
  revalidatePath("/");
  if (imageId) revalidatePath(`/caption-rating/${imageId}`);
}

export async function createCaption({ imageId, content }) {
  const { supabase, user, error } = await getAdminClient();
  if (error) return { error };

  const text = cleanContent(content);
  if (!text) return { error: "Write a caption first." };
  if (!imageId) return { error: "Pick an image." };

  const { error: insertError } = await supabase
    .from("captions")
    .insert({ content: text, image_id: imageId, created_by: user.id });

  if (insertError) return { error: insertError.message };
  revalidateCaptionPages(imageId);
  return { error: null };
}

// Same OpenAI captioning the app uses, triggered from the admin area.
export async function generateAiCaption(imageId) {
  const { error } = await getAdminClient();
  if (error) return { error };
  if (!imageId) return { error: "Pick an image." };

  const result = await generateCaption(imageId);
  revalidateCaptionPages(imageId);
  return result;
}

export async function updateCaption({ id, content }) {
  const { supabase, error } = await getAdminClient();
  if (error) return { error };

  const text = cleanContent(content);
  if (!text) return { error: "Captions can't be empty." };

  const { data, error: updateError } = await supabase
    .from("captions")
    .update({ content: text })
    .eq("id", id)
    .select("image_id");

  if (updateError) return { error: updateError.message };
  if (!data?.length) return { error: "Caption not found, or you lack permission to edit it." };
  revalidateCaptionPages(data[0].image_id);
  return { error: null };
}

export async function deleteCaption(id) {
  const { supabase, error } = await getAdminClient();
  if (error) return { error };

  const { data, error: deleteError } = await supabase
    .from("captions")
    .delete()
    .eq("id", id)
    .select("image_id");

  if (deleteError) return { error: deleteError.message };
  if (!data?.length) return { error: "Caption not found, or you lack permission to delete it." };
  revalidateCaptionPages(data[0].image_id);
  return { error: null };
}
