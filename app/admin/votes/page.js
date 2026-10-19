import Link from "next/link";
import { displayName, fetchAll, requireAdmin } from "../../../lib/admin";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "up", label: "▲ Upvotes" },
  { value: "down", label: "▼ Downvotes" },
];

function formatDateTime(value) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export default async function AdminVotesPage({ searchParams }) {
  const { supabase } = await requireAdmin();
  const params = (await searchParams) ?? {};
  const filter = FILTERS.some((f) => f.value === params.filter) ? params.filter : "all";

  const [votes, profiles] = await Promise.all([
    fetchAll(() =>
      supabase
        .from("caption_votes")
        .select(
          "id, user_id, vote_value, created_datetime_utc, modified_datetime_utc, captions(id, content, image_id, model)",
        )
        .order("modified_datetime_utc", { ascending: false })
        .order("id"),
    ),
    fetchAll(() => supabase.from("profiles").select("id, email, first_name, last_name").order("id")),
  ]);

  const error = votes.error || profiles.error;
  if (error) {
    return <p className="notice auth-error">Could not load votes: {error.message}</p>;
  }

  const profilesById = new Map(profiles.data.map((p) => [p.id, p]));
  const up = votes.data.filter((v) => v.vote_value === 1).length;
  const down = votes.data.length - up;
  const shown = votes.data.filter((v) =>
    filter === "up" ? v.vote_value === 1 : filter === "down" ? v.vote_value === -1 : true,
  );

  return (
    <div className="admin-body">
      <div className="stat-row">
        <div className="stat-tile">
          <p className="stat-label">Total votes</p>
          <p className="stat-value">{votes.data.length.toLocaleString("en-US")}</p>
        </div>
        <div className="stat-tile">
          <p className="stat-label">Upvotes</p>
          <p className="stat-value">{up.toLocaleString("en-US")}</p>
        </div>
        <div className="stat-tile">
          <p className="stat-label">Downvotes</p>
          <p className="stat-value">{down.toLocaleString("en-US")}</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Votes ({shown.length})</h2>
          <div className="filter-row">
            {FILTERS.map((f) => (
              <Link
                className={`admin-nav-link${filter === f.value ? " is-active" : ""}`}
                href={f.value === "all" ? "/admin/votes" : `/admin/votes?filter=${f.value}`}
                key={f.value}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
        {shown.length ? (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Vote</th>
                  <th>Caption</th>
                  <th>Voter</th>
                  <th>Last changed</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((vote) => (
                  <tr key={vote.id}>
                    <td>
                      <span className={`vote-pill ${vote.vote_value === 1 ? "vote-pill-up" : "vote-pill-down"}`}>
                        {vote.vote_value === 1 ? "▲ Up" : "▼ Down"}
                      </span>
                    </td>
                    <td className="caption-cell">
                      {vote.captions ? (
                        <Link href={`/caption-rating/${vote.captions.image_id}`}>
                          {vote.captions.content}
                        </Link>
                      ) : (
                        "Deleted caption"
                      )}
                    </td>
                    <td>{displayName(profilesById.get(vote.user_id))}</td>
                    <td className="nowrap">{formatDateTime(vote.modified_datetime_utc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No votes to show.</p>
        )}
      </div>
    </div>
  );
}
