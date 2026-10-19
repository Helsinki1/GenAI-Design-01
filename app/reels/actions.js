"use server";

import { createClient } from "../../lib/supabase/server";

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

// Picks a random image that has captions, then one of its captions at random.
// `excludeImageId` avoids showing the same image twice in a row when possible.
export async function getRandomMeme(excludeImageId = null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You need to sign in to watch reels." };
  }

  const { data: images, error: imagesError } = await supabase
    .from("images")
    .select("id, url, captions!inner(id)");

  if (imagesError) return { error: imagesError.message };
  if (!images?.length) return { error: null, meme: null };

  const candidates =
    images.length > 1 ? images.filter((image) => image.id !== excludeImageId) : images;
  const image = pickRandom(candidates);
  const { id: captionId } = pickRandom(image.captions);

  const { data: caption, error: captionError } = await supabase
    .from("captions")
    .select("id, content, model, caption_votes(user_id, vote_value)")
    .eq("id", captionId)
    .single();

  if (captionError) return { error: captionError.message };

  let upvotes = 0;
  let downvotes = 0;
  let myVote = 0;
  for (const vote of caption.caption_votes) {
    if (vote.vote_value === 1) upvotes += 1;
    else downvotes += 1;
    if (vote.user_id === user.id) myVote = vote.vote_value;
  }

  return {
    error: null,
    meme: {
      imageId: image.id,
      imageUrl: image.url,
      captionId: caption.id,
      content: caption.content,
      model: caption.model,
      captionCount: image.captions.length,
      upvotes,
      downvotes,
      myVote,
    },
  };
}
