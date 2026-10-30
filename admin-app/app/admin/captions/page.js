import Link from "next/link";
import { displayName, fetchAll, requireAdmin } from "../../../lib/admin";
import CaptionRow from "./caption-row";
import CreateCaption from "./create-caption";

export default async function AdminCaptionsPage({ searchParams }) {
  const { supabase } = await requireAdmin();
  const params = (await searchParams) ?? {};

  const [images, captions, profiles] = await Promise.all([
    fetchAll(() =>
      supabase
        .from("images")
        .select("id, url")
        .order("created_datetime_utc", { ascending: false })
        .order("id"),
    ),
    fetchAll(() =>
      supabase
        .from("captions")
        .select("id, content, image_id, model, created_by, created_datetime_utc, caption_votes(vote_value)")
        .order("created_datetime_utc", { ascending: false })
        .order("id"),
    ),
    fetchAll(() => supabase.from("profiles").select("id, email, first_name, last_name").order("id")),
  ]);

  const error = images.error || captions.error || profiles.error;
  if (error) {
    return <p className="notice auth-error">Could not load captions: {error.message}</p>;
  }

  const imagesById = new Map(images.data.map((image) => [image.id, image]));
  const profilesById = new Map(profiles.data.map((p) => [p.id, p]));
  const imageFilter = imagesById.has(params.image) ? params.image : null;
  const shown = imageFilter
    ? captions.data.filter((caption) => caption.image_id === imageFilter)
    : captions.data;

  return (
    <div className="admin-body">
      <CreateCaption images={images.data} defaultImageId={imageFilter} />

      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">
            Captions ({shown.length}){imageFilter ? " for one image" : ""}
          </h2>
          {imageFilter ? (
            <Link className="secondary-button" href="/admin/captions">
              Show all images
            </Link>
          ) : null}
        </div>
        {shown.length ? (
          <ul className="admin-caption-list">
            {shown.map((caption) => {
              let up = 0;
              let down = 0;
              for (const vote of caption.caption_votes) {
                if (vote.vote_value === 1) up += 1;
                else down += 1;
              }
              return (
                <CaptionRow
                  key={caption.id}
                  caption={{
                    id: caption.id,
                    content: caption.content,
                    imageId: caption.image_id,
                    imageUrl: imagesById.get(caption.image_id)?.url ?? null,
                    model: caption.model,
                    author: caption.created_by ? displayName(profilesById.get(caption.created_by)) : null,
                    createdAt: caption.created_datetime_utc,
                    up,
                    down,
                  }}
                />
              );
            })}
          </ul>
        ) : (
          <p className="empty">No captions yet.</p>
        )}
      </div>
    </div>
  );
}
