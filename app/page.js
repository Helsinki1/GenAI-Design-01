import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../lib/supabase/server";
import SiteHeader from "./site-header";
import UploadImage from "./upload-image";

// Sessions from before the sign-in pick existed get a stable fallback from the user id.
function fallbackIndex(userId, length) {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % length;
}

// Moves the user's Image of the Day to the front of the grid.
function featureImageOfTheDay(images, imageOfTheDayId, userId) {
  if (!images?.length) return images;
  let index = images.findIndex((image) => image.id === imageOfTheDayId);
  if (index === -1) index = fallbackIndex(userId, images.length);
  return [images[index], ...images.slice(0, index), ...images.slice(index + 1)];
}

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (process.env.ADMIN_APP === "1") {
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    if (profile?.is_admin) redirect("/admin");
    return <main className="page"><section className="card"><SiteHeader /><h1>Admin access required</h1><p className="copy">This account does not have access to the admin area.</p></section></main>;
  }

  const [{ data: allImages, error }, { data: profile }] = await Promise.all([
    supabase
      .from("images")
      .select("id, url, captions(count)")
      .order("created_datetime_utc", { ascending: false })
      .order("id", { ascending: true }),
    supabase
      .from("profiles")
      .select("image_of_the_day_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const images = featureImageOfTheDay(
    allImages,
    profile?.image_of_the_day_id,
    user.id,
  );

  return (
    <main className="page">
      <section className="gallery-shell">
        <SiteHeader current="images" />
        <div className="page-header">
          <div className="stack">
            <p className="eyebrow">Caption Rating</p>
            <h1>Pick an image</h1>
            <p className="copy">
              Generate AI captions for an image and vote on the best ones.
            </p>
          </div>
        </div>

        <UploadImage userId={user.id} />

        {error ? (
          <p className="notice">Could not load images: {error.message}</p>
        ) : images?.length ? (
          <div className="caption-grid">
            {images.map((image, index) => {
              const captionCount = image.captions?.[0]?.count ?? 0;
              const isImageOfTheDay = index === 0;
              return (
                <Link
                  className={`caption-card card-link${isImageOfTheDay ? " image-of-the-day" : ""}`}
                  href={`/caption-rating/${image.id}`}
                  key={image.id}
                >
                  {isImageOfTheDay ? (
                    <span className="image-of-the-day-label">★ Image of the Day</span>
                  ) : null}
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
