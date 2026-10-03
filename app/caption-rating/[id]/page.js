import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { voteOnCaption } from "../actions";
import GenerateButton from "./generate-button";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tallyVotes(votes, userId) {
  let upvotes = 0;
  let downvotes = 0;
  let myVote = 0;

  for (const vote of votes ?? []) {
    if (vote.vote_value === 1) upvotes += 1;
    if (vote.vote_value === -1) downvotes += 1;
    if (vote.user_id === userId) myVote = vote.vote_value;
  }

  return { upvotes, downvotes, myVote };
}

export default async function CaptionRatingImagePage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!UUID_PATTERN.test(id)) {
    notFound();
  }

  const { data: image, error: imageError } = await supabase
    .from("images")
    .select("id, url")
    .eq("id", id)
    .maybeSingle();

  if (!imageError && !image) {
    notFound();
  }

  const { data: captions, error: captionsError } = await supabase
    .from("captions")
    .select("id, content, model, created_datetime_utc, caption_votes(user_id, vote_value)")
    .eq("image_id", id)
    .order("created_datetime_utc", { ascending: false });

  const error = imageError || captionsError;

  return (
    <main className="page">
      <section className="gallery-shell rating-shell">
        <Link className="back-link" href="/">
          ← All images
        </Link>

        {error ? (
          <p className="notice">Could not load this image: {error.message}</p>
        ) : (
          <>
            <img className="rating-image" src={image.url} alt="" />
            <GenerateButton imageId={image.id} />

            <h2 className="section-title">Captions ({captions.length})</h2>
            {captions.length ? (
              <ul className="rating-list">
                {captions.map((caption) => {
                  const { upvotes, downvotes, myVote } = tallyVotes(
                    caption.caption_votes,
                    user.id,
                  );
                  return (
                    <li className="rating-item" key={caption.id}>
                      <div className="rating-text">
                        <p className="caption-text">{caption.content}</p>
                        {caption.model ? (
                          <span className="ai-badge">AI · {caption.model}</span>
                        ) : null}
                      </div>
                      <div className="vote-group">
                        <form action={voteOnCaption.bind(null, image.id, caption.id, 1)}>
                          <button
                            className={`vote-button${myVote === 1 ? " vote-active-up" : ""}`}
                            type="submit"
                            aria-pressed={myVote === 1}
                            aria-label="Upvote"
                          >
                            ▲ {upvotes}
                          </button>
                        </form>
                        <form action={voteOnCaption.bind(null, image.id, caption.id, -1)}>
                          <button
                            className={`vote-button${myVote === -1 ? " vote-active-down" : ""}`}
                            type="submit"
                            aria-pressed={myVote === -1}
                            aria-label="Downvote"
                          >
                            ▼ {downvotes}
                          </button>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="empty">No captions yet. Generate the first one!</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
