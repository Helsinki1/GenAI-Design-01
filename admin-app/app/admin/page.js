import Link from "next/link";
import { displayName, fetchAll, requireAdmin } from "../../lib/admin";

const DAY_MS = 24 * 60 * 60 * 1000;
const CHART_DAYS = 14;
const MIN_CRITIC_VOTES = 3;

const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

function utcDay(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function tally(votes) {
  let up = 0;
  let down = 0;
  for (const vote of votes) {
    if (vote.vote_value === 1) up += 1;
    else down += 1;
  }
  return { up, down, net: up - down, total: up + down };
}

function groupBy(rows, key) {
  const groups = new Map();
  for (const row of rows) {
    const value = row[key];
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return groups;
}

function buildStats({ profiles, images, captions, votes }) {
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const imagesById = new Map(images.map((image) => [image.id, image]));
  const votesByCaption = groupBy(votes, "caption_id");

  const scored = captions.map((caption) => ({
    ...caption,
    image: imagesById.get(caption.image_id),
    ...tally(votesByCaption.get(caption.id) ?? []),
  }));
  const voted = scored.filter((caption) => caption.total > 0);

  const totals = tally(votes);
  const aiCaptions = captions.filter((caption) => caption.model);

  // Hall of fame / shame by net score; "divisive" = lots of votes, split close to 50/50.
  const byNet = [...voted].sort((a, b) => b.net - a.net || b.total - a.total);
  const hallOfFame = byNet.slice(0, 5);
  const hallOfShame = byNet.filter((c) => c.net < 0).reverse().slice(0, 5);
  const divisive = voted
    .filter((c) => c.up > 0 && c.down > 0)
    .map((c) => ({ ...c, split: Math.min(c.up, c.down) / Math.max(c.up, c.down) }))
    .sort((a, b) => b.split * b.total - a.split * a.total)
    .slice(0, 5);

  // AI vs. hand-written: does the machine get the laughs?
  const groupScore = (group) => {
    const groupVotes = group.reduce(
      (acc, c) => ({ up: acc.up + c.up, down: acc.down + c.down }),
      { up: 0, down: 0 },
    );
    const total = groupVotes.up + groupVotes.down;
    return {
      count: group.length,
      ...groupVotes,
      total,
      upRate: total ? groupVotes.up / total : null,
      avgNet: group.length ? (groupVotes.up - groupVotes.down) / group.length : 0,
    };
  };
  const aiVsHuman = [
    { label: "AI-generated", ...groupScore(scored.filter((c) => c.model)) },
    { label: "Hand-written seeds", ...groupScore(scored.filter((c) => !c.model)) },
  ];

  // Votes per day for the last CHART_DAYS days (UTC), split into up and down.
  const today = Date.parse(utcDay(Date.now()));
  const days = Array.from({ length: CHART_DAYS }, (_, i) => {
    const date = utcDay(today - (CHART_DAYS - 1 - i) * DAY_MS);
    return { date, up: 0, down: 0 };
  });
  const dayIndex = new Map(days.map((day, i) => [day.date, i]));
  for (const vote of votes) {
    const i = dayIndex.get(utcDay(vote.created_datetime_utc));
    if (i === undefined) continue;
    if (vote.vote_value === 1) days[i].up += 1;
    else days[i].down += 1;
  }

  // When do people vote? Count by UTC hour.
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  for (const vote of votes) hours[new Date(vote.created_datetime_utc).getUTCHours()].count += 1;

  // Voter personalities: who is the harshest critic and who is the biggest fan?
  const voters = [...groupBy(votes, "user_id")]
    .map(([userId, userVotes]) => ({ profile: profilesById.get(userId), ...tally(userVotes) }))
    .filter((voter) => voter.total >= MIN_CRITIC_VOTES)
    .map((voter) => ({ ...voter, upRate: voter.up / voter.total }));
  const harshest = [...voters].sort((a, b) => a.upRate - b.upRate || b.total - a.total)[0];
  const kindest = [...voters].sort((a, b) => b.upRate - a.upRate || b.total - a.total)[0];
  const mostActive = [...voters].sort((a, b) => b.total - a.total)[0];

  // Which uploader's images inspire the most captions?
  const captionsByImage = groupBy(captions, "image_id");
  const topImages = images
    .map((image) => {
      const imageCaptions = captionsByImage.get(image.id) ?? [];
      const engagement = imageCaptions.reduce(
        (sum, c) => sum + (votesByCaption.get(c.id)?.length ?? 0),
        0,
      );
      return { ...image, captionCount: imageCaptions.length, engagement };
    })
    .sort((a, b) => b.engagement - a.engagement || b.captionCount - a.captionCount)
    .slice(0, 4);

  const models = [...groupBy(aiCaptions, "model")]
    .map(([model, rows]) => ({ model, count: rows.length }))
    .sort((a, b) => b.count - a.count);

  const weekAgo = Date.now() - 7 * DAY_MS;
  const newUsers = profiles.filter((p) => Date.parse(p.created_at) >= weekAgo).length;
  const uploads = images.filter((image) => image.created_by).length;

  return {
    totals,
    counts: {
      users: profiles.length,
      admins: profiles.filter((p) => p.is_admin).length,
      newUsers,
      images: images.length,
      uploads,
      captions: captions.length,
      aiCaptions: aiCaptions.length,
      votersCount: new Set(votes.map((v) => v.user_id)).size,
    },
    hallOfFame,
    hallOfShame,
    divisive,
    aiVsHuman,
    days,
    hours,
    harshest,
    kindest,
    mostActive,
    topImages,
    models,
  };
}

function StatTile({ label, value, note }) {
  return (
    <div className="stat-tile">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {note ? <p className="stat-note">{note}</p> : null}
    </div>
  );
}

// Upvotes rise above the baseline and downvotes hang below it, one column per day.
function VoteMoodChart({ days }) {
  const width = 640;
  const half = 90;
  const labelSpace = 22;
  const height = half * 2 + labelSpace;
  const max = Math.max(1, ...days.flatMap((d) => [d.up, d.down]));
  const slot = width / days.length;
  const barWidth = Math.min(28, slot - 6);
  const scale = (n) => (n / max) * (half - 8);

  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label="Upvotes and downvotes per day for the last two weeks">
      <line className="chart-baseline" x1="0" x2={width} y1={half} y2={half} />
      {days.map((day, i) => {
        const x = i * slot + (slot - barWidth) / 2;
        const upHeight = scale(day.up);
        const downHeight = scale(day.down);
        const label = new Date(`${day.date}T00:00:00Z`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });
        return (
          <g className="chart-column" key={day.date}>
            <title>{`${label}: ▲ ${day.up} up · ▼ ${day.down} down`}</title>
            <rect className="chart-hit" x={i * slot} y="0" width={slot} height={half * 2} />
            {day.up ? (
              <rect className="bar-up" x={x} y={half - 1 - upHeight} width={barWidth}
                height={upHeight} rx="4" />
            ) : null}
            {day.down ? (
              <rect className="bar-down" x={x} y={half + 1} width={barWidth}
                height={downHeight} rx="4" />
            ) : null}
            {i % 2 === days.length % 2 ? null : (
              <text className="chart-label" x={i * slot + slot / 2} y={height - 6}
                textAnchor="middle">
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// 24 cells, darker = more votes cast in that UTC hour.
function HourStrip({ hours }) {
  const max = Math.max(1, ...hours.map((h) => h.count));
  const busiest = hours.reduce((a, b) => (b.count > a.count ? b : a));
  return (
    <>
      <div className="hour-strip">
        {hours.map(({ hour, count }) => (
          <div
            className="hour-cell"
            key={hour}
            style={{ "--level": count / max }}
            title={`${String(hour).padStart(2, "0")}:00 UTC: ${count} ${count === 1 ? "vote" : "votes"}`}
          />
        ))}
      </div>
      <div className="hour-axis">
        <span>00:00</span>
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>23:00</span>
      </div>
      <p className="panel-foot">
        {busiest.count
          ? `Peak hour: ${String(busiest.hour).padStart(2, "0")}:00 UTC with ${busiest.count} votes.`
          : "No votes yet."}
      </p>
    </>
  );
}

function CaptionList({ captions, empty, metric }) {
  if (!captions.length) return <p className="empty">{empty}</p>;
  return (
    <ol className="leader-list">
      {captions.map((caption) => (
        <li key={caption.id}>
          <Link className="leader-caption" href={`${process.env.NEXT_PUBLIC_CAPTION_APP_URL || "https://gen-ai-design-01.vercel.app"}/caption-rating/${caption.image_id}`}>
            {caption.content}
          </Link>
          <span className="leader-metric">{metric(caption)}</span>
        </li>
      ))}
    </ol>
  );
}

function PersonaCard({ title, voter, describe }) {
  return (
    <div className="persona">
      <p className="stat-label">{title}</p>
      {voter ? (
        <>
          <p className="persona-name">{displayName(voter.profile)}</p>
          <p className="stat-note">{describe(voter)}</p>
        </>
      ) : (
        <p className="stat-note">Needs someone with {MIN_CRITIC_VOTES}+ votes.</p>
      )}
    </div>
  );
}

export default async function AdminDashboard() {
  const { supabase } = await requireAdmin();

  const [profiles, images, captions, votes] = await Promise.all([
    fetchAll(() =>
      supabase.from("profiles").select("id, email, first_name, last_name, is_admin, created_at").order("id"),
    ),
    fetchAll(() =>
      supabase.from("images").select("id, url, created_by, created_datetime_utc").order("id"),
    ),
    fetchAll(() =>
      supabase.from("captions").select("id, content, image_id, model, created_by, created_datetime_utc").order("id"),
    ),
    fetchAll(() =>
      supabase.from("caption_votes").select("id, caption_id, user_id, vote_value, created_datetime_utc").order("id"),
    ),
  ]);

  const error = profiles.error || images.error || captions.error || votes.error;
  if (error) {
    return <p className="notice auth-error">Could not load stats: {error.message}</p>;
  }

  const stats = buildStats({
    profiles: profiles.data,
    images: images.data,
    captions: captions.data,
    votes: votes.data,
  });
  const { totals, counts } = stats;

  return (
    <div className="admin-body">
      <div className="hero-stat">
        <p className="stat-label">Votes cast, all time</p>
        <p className="hero-value">{totals.total.toLocaleString("en-US")}</p>
        <p className="stat-note">
          by {counts.votersCount} {counts.votersCount === 1 ? "voter" : "voters"} ·{" "}
          {totals.total ? `${percent.format(totals.up / totals.total)} of them upvotes` : "no votes yet"}
        </p>
      </div>

      <div className="stat-row">
        <StatTile label="Users" value={compact.format(counts.users)}
          note={`${counts.newUsers} new this week · ${counts.admins} admin${counts.admins === 1 ? "" : "s"}`} />
        <StatTile label="Images" value={compact.format(counts.images)}
          note={`${counts.uploads} uploaded by users`} />
        <StatTile label="Captions" value={compact.format(counts.captions)}
          note={`${counts.captions ? percent.format(counts.aiCaptions / counts.captions) : "0%"} written by AI`} />
        <StatTile label="Votes per caption" value={counts.captions ? (totals.total / counts.captions).toFixed(1) : "0"}
          note={`net mood ${totals.net >= 0 ? "+" : ""}${totals.net}`} />
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2 className="panel-title">Mood of the crowd</h2>
          <div className="legend">
            <span><i className="swatch swatch-up" /> Upvotes</span>
            <span><i className="swatch swatch-down" /> Downvotes</span>
          </div>
        </div>
        <p className="panel-sub">Votes per day, last {CHART_DAYS} days (UTC). Hover a day for counts.</p>
        <VoteMoodChart days={stats.days} />
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2 className="panel-title">Man vs. machine</h2>
          <p className="panel-sub">Is AI funnier than the hand-written seed captions?</p>
          <div className="versus">
            {stats.aiVsHuman.map((group) => (
              <div className="versus-row" key={group.label}>
                <div className="versus-head">
                  <span>{group.label}</span>
                  <span className="leader-metric">
                    {group.upRate === null ? "no votes" : `${percent.format(group.upRate)} upvoted`}
                  </span>
                </div>
                <div className="meter">
                  <div className="meter-fill" style={{ width: `${(group.upRate ?? 0) * 100}%` }} />
                </div>
                <p className="stat-note">
                  {group.count} captions · avg net score {group.avgNet >= 0 ? "+" : ""}
                  {group.avgNet.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2 className="panel-title">When do people vote?</h2>
          <p className="panel-sub">Votes by hour of day (UTC). Darker = busier.</p>
          <HourStrip hours={stats.hours} />
        </div>
      </div>

      <div className="panel-grid panel-grid-3">
        <div className="panel">
          <h2 className="panel-title">🏆 Hall of fame</h2>
          <CaptionList captions={stats.hallOfFame} empty="No votes yet."
            metric={(c) => `${c.net >= 0 ? "+" : ""}${c.net}`} />
        </div>
        <div className="panel">
          <h2 className="panel-title">🍅 Hall of shame</h2>
          <CaptionList captions={stats.hallOfShame} empty="Nobody's in the red. Yet."
            metric={(c) => `${c.net}`} />
        </div>
        <div className="panel">
          <h2 className="panel-title">⚖️ Most divisive</h2>
          <CaptionList captions={stats.divisive} empty="No split decisions yet."
            metric={(c) => `▲${c.up} ▼${c.down}`} />
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Voter personalities</h2>
        <div className="persona-row">
          <PersonaCard title="Harshest critic" voter={stats.harshest}
            describe={(v) => `Downvotes ${percent.format(1 - v.upRate)} of ${v.total} votes`} />
          <PersonaCard title="Biggest fan" voter={stats.kindest}
            describe={(v) => `Upvotes ${percent.format(v.upRate)} of ${v.total} votes`} />
          <PersonaCard title="Most active voter" voter={stats.mostActive}
            describe={(v) => `${v.total} votes cast`} />
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2 className="panel-title">Most-debated images</h2>
          <p className="panel-sub">Ranked by total votes on their captions.</p>
          <div className="thumb-row">
            {stats.topImages.map((image) => (
              <Link className="thumb" href={`${process.env.NEXT_PUBLIC_CAPTION_APP_URL || "https://gen-ai-design-01.vercel.app"}/caption-rating/${image.id}`} key={image.id}>
                <img src={image.url} alt="" />
                <span>{image.engagement} votes · {image.captionCount} captions</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="panel">
          <h2 className="panel-title">Caption models</h2>
          <p className="panel-sub">Which AI models wrote the captions.</p>
          {stats.models.length ? (
            <table className="admin-table">
              <tbody>
                {stats.models.map(({ model, count }) => (
                  <tr key={model}>
                    <td><span className="ai-badge">{model}</span></td>
                    <td className="num">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">No AI captions yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
