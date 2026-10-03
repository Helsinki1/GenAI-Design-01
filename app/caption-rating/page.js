import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

export default async function CaptionRatingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: images, error } = await supabase
    .from("images")
    .select("id, url, captions(count)")
    .order("created_datetime_utc", { ascending: true })
    .order("id", { ascending: true });

  return (
    <main className="page">
      <section className="gallery-shell">
        <Link className="back-link" href="/">
          ← Back to captions
        </Link>
        <div className="stack">
          <p className="eyebrow">Caption Rating</p>
          <h1>Pick an image</h1>
          <p className="copy">
            Generate AI captions for an image and vote on the best ones.
          </p>
        </div>

        {error ? (
          <p className="notice">Could not load images: {error.message}</p>
        ) : images?.length ? (
          <div className="caption-grid">
            {images.map((image) => {
              const captionCount = image.captions?.[0]?.count ?? 0;
              return (
                <Link
                  className="caption-card card-link"
                  href={`/caption-rating/${image.id}`}
                  key={image.id}
                >
                  <img className="caption-image" src={image.url} alt="" />
                  <div className="caption-body">
                    <p className="caption-text">
                      {captionCount} {captionCount === 1 ? "caption" : "captions"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="empty">No images found.</p>
        )}
      </section>
    </main>
  );
}
