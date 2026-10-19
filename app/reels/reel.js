"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { voteOnCaption } from "../caption-rating/actions";
import { applyVote } from "../caption-rating/[id]/vote-buttons";
import { getRandomMeme } from "./actions";

const SWIPE_COOLDOWN_MS = 700;
const SWIPE_MIN_PX = 50;

// Fetches the next meme and warms the browser cache for its image.
async function prefetchMeme(excludeImageId) {
  const result = await getRandomMeme(excludeImageId);
  if (result.meme) new Image().src = result.meme.imageUrl;
  return result;
}

export default function Reel({ initialMeme }) {
  // Vote counts live here (not in props) so a server refresh after voting
  // never swaps the meme out from under the user.
  const [meme, setMeme] = useState(initialMeme);
  const [error, setError] = useState(null);
  const [loading, startLoading] = useTransition();
  const [, startVoting] = useTransition();
  const upcoming = useRef(null);
  const lastSwipe = useRef(0);
  const touchStartY = useRef(null);

  useEffect(() => {
    upcoming.current = prefetchMeme(meme.imageId);
  }, [meme.captionId, meme.imageId]);

  const next = useCallback(() => {
    if (loading) return;
    setError(null);
    startLoading(async () => {
      try {
        const result = await (upcoming.current ?? prefetchMeme(meme.imageId));
        if (result.error) setError(result.error);
        else if (result.meme) setMeme(result.meme);
      } catch {
        setError("Could not load the next meme. Try again.");
      } finally {
        upcoming.current = null;
      }
    });
  }, [loading, meme.imageId]);

  // A swipe up, a scroll down, or the ↓ / J keys move to the next meme.
  const swipeNext = useCallback(() => {
    const now = Date.now();
    if (now - lastSwipe.current < SWIPE_COOLDOWN_MS) return;
    lastSwipe.current = now;
    next();
  }, [next]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.target.closest?.("input, textarea, select")) return;
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        swipeNext();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [swipeNext]);

  function vote(voteValue) {
    const before = meme;
    setError(null);
    setMeme((current) => ({ ...current, ...applyVote(current, voteValue) }));
    startVoting(async () => {
      const result = await voteOnCaption(before.imageId, before.captionId, voteValue);
      if (result?.error) {
        setError(result.error);
        setMeme((current) => (current.captionId === before.captionId ? before : current));
      }
    });
  }

  return (
    <>
      <article
        className="reel reel-enter"
        key={meme.captionId}
        onWheel={(event) => {
          if (event.deltaY > 30) swipeNext();
        }}
        onTouchStart={(event) => {
          touchStartY.current = event.touches[0].clientY;
        }}
        onTouchEnd={(event) => {
          const start = touchStartY.current;
          touchStartY.current = null;
          if (start !== null && start - event.changedTouches[0].clientY > SWIPE_MIN_PX) swipeNext();
        }}
      >
        <img className="reel-image" src={meme.imageUrl} alt="" />
        <div className="reel-body">
          <p className="reel-caption">{meme.content}</p>
          <div className="reel-meta">
            {meme.model ? <span className="ai-badge">AI · {meme.model}</span> : <span>Seed caption</span>}
            <Link href={`/caption-rating/${meme.imageId}`}>
              See all {meme.captionCount} {meme.captionCount === 1 ? "caption" : "captions"} →
            </Link>
          </div>
          <div className="reel-actions">
            <div className="vote-group">
              <button
                className={`vote-button${meme.myVote === 1 ? " vote-active-up" : ""}`}
                type="button"
                onClick={() => vote(1)}
                aria-pressed={meme.myVote === 1}
                aria-label="Upvote"
              >
                ▲ {meme.upvotes}
              </button>
              <button
                className={`vote-button${meme.myVote === -1 ? " vote-active-down" : ""}`}
                type="button"
                onClick={() => vote(-1)}
                aria-pressed={meme.myVote === -1}
                aria-label="Downvote"
              >
                ▼ {meme.downvotes}
              </button>
            </div>
            <button className="auth-button" type="button" onClick={next} disabled={loading}>
              {loading ? "Loading…" : "Next meme ↓"}
            </button>
          </div>
          {error ? <p className="notice auth-error">{error}</p> : null}
        </div>
      </article>
      <p className="reel-hint">
        Swipe up, scroll, or press <kbd>↓</kbd> for the next meme
      </p>
    </>
  );
}
