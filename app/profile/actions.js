"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../../lib/supabase/server";

function cleanText(value, maxLength) {
  const text = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  return text || null;
}

export async function updateProfile({ firstName, lastName, bio, avatarUrl }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You need to sign in again." };
  }

  // Only accept photos from this user's own folder in the avatars bucket.
  const avatarPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${user.id}/`;
  if (avatarUrl && !avatarUrl.startsWith(avatarPrefix)) {
    return { error: "Invalid photo URL." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: cleanText(firstName, 100),
      last_name: cleanText(lastName, 100),
      bio: cleanText(bio, 500),
      avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/profile/${user.id}`);
  return { error: null };
}
