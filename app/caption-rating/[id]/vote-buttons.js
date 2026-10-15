"use client";

import { useOptimistic, useState, useTransition } from "react";
import { voteOnCaption } from "../actions";

// Mirrors the server rule: clicking your current vote removes it, otherwise it switches.
export function applyVote({ upvotes, downvotes, myVote }, voteValue) {
  if (myVote === 1) upvotes -= 1;
  if (myVote === -1) downvotes -= 1;

  const nextVote = myVote === voteValue ? 0 : voteValue;
  if (nextVote === 1) upvotes += 1;
  if (nextVote === -1) downvotes += 1;

  return { upvotes, downvotes, myVote: nextVote };
}

export default function VoteButtons({ imageId, captionId, upvotes, downvotes, myVote }) {
  const [error, setError] = useState(null);
  const [, startTransition] = useTransition();
  const [votes, addOptimisticVote] = useOptimistic(
    { upvotes, downvotes, myVote },
    applyVote,
  );

  function handleVote(voteValue) {
    setError(null);
    startTransition(async () => {
      addOptimisticVote(voteValue);
      const result = await voteOnCaption(imageId, captionId, voteValue);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="vote-area">
      <div className="vote-group">
        <button
          className={`vote-button${votes.myVote === 1 ? " vote-active-up" : ""}`}
          type="button"
          onClick={() => handleVote(1)}
          aria-pressed={votes.myVote === 1}
          aria-label="Upvote"
        >
          ▲ {votes.upvotes}
        </button>
        <button
          className={`vote-button${votes.myVote === -1 ? " vote-active-down" : ""}`}
          type="button"
          onClick={() => handleVote(-1)}
          aria-pressed={votes.myVote === -1}
          aria-label="Downvote"
        >
          ▼ {votes.downvotes}
        </button>
      </div>
      {error ? <p className="notice auth-error">{error}</p> : null}
    </div>
  );
}
