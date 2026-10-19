import Link from "next/link";
import { displayName, fetchAll, requireAdmin } from "../../../lib/admin";

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function countBy(rows, key) {
  const counts = new Map();
  for (const row of rows) counts.set(row[key], (counts.get(row[key]) ?? 0) + 1);
  return counts;
}

export default async function AdminUsersPage() {
  const { supabase } = await requireAdmin();

  const [profiles, votes, captions, images] = await Promise.all([
    fetchAll(() =>
      supabase
        .from("profiles")
        .select("id, email, first_name, last_name, avatar_url, bio, is_admin, created_at")
        .order("created_at", { ascending: false })
        .order("id"),
    ),
    fetchAll(() => supabase.from("caption_votes").select("user_id").order("id")),
    fetchAll(() => supabase.from("captions").select("created_by").order("id")),
    fetchAll(() => supabase.from("images").select("created_by").order("id")),
  ]);

  const error = profiles.error || votes.error || captions.error || images.error;
  if (error) {
    return <p className="notice auth-error">Could not load users: {error.message}</p>;
  }

  const votesByUser = countBy(votes.data, "user_id");
  const captionsByUser = countBy(captions.data, "created_by");
  const uploadsByUser = countBy(images.data, "created_by");

  return (
    <div className="admin-body">
      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Users ({profiles.data.length})</h2>
          <span className="panel-sub">Read-only</span>
        </div>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Joined</th>
                <th className="num">Votes</th>
                <th className="num">Captions</th>
                <th className="num">Uploads</th>
              </tr>
            </thead>
            <tbody>
              {profiles.data.map((profile) => (
                <tr key={profile.id}>
                  <td>
                    <Link className="user-cell" href={`/profile/${profile.id}`}>
                      {profile.avatar_url ? (
                        <img className="table-avatar" src={profile.avatar_url} alt="" />
                      ) : (
                        <span className="table-avatar" aria-hidden="true" />
                      )}
                      <span className="user-text">
                        <span className="user-name">{displayName(profile)}</span>
                        <span className="user-email">{profile.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td>
                    {profile.is_admin ? (
                      <span className="role-badge role-admin">Admin</span>
                    ) : (
                      <span className="role-badge">User</span>
                    )}
                  </td>
                  <td className="nowrap">{formatDate(profile.created_at)}</td>
                  <td className="num">{votesByUser.get(profile.id) ?? 0}</td>
                  <td className="num">{captionsByUser.get(profile.id) ?? 0}</td>
                  <td className="num">{uploadsByUser.get(profile.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
