import Link from "next/link";
import { getSupabaseServerClient } from "../lib/supabase";

const PAGE_SIZE = 24;

function getPageNumber(value) {
  const page = Number.parseInt(value, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

async function getCaptions({ page, query }) {
  const supabase = getSupabaseServerClient();
  const tableName = process.env.NEXT_PUBLIC_SUPABASE_TABLE || "captions";

  if (!supabase) {
    return {
      captions: [],
      error:
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to load data.",
      tableName,
      count: 0,
    };
  }

  const firstRow = (page - 1) * PAGE_SIZE;
  let request = supabase
    .from(tableName)
    .select("id, content, image_id, created_datetime_utc, images(url)", {
      count: "exact",
    })
    .order("created_datetime_utc", { ascending: false })
    .range(firstRow, firstRow + PAGE_SIZE - 1);

  if (query) {
    request = request.ilike("content", `%${query}%`);
  }

  const { data, error, count } = await request;

  if (error) {
    return {
      captions: [],
      error: error.message,
      tableName,
      count: 0,
    };
  }

  return {
    captions: data ?? [],
    error: null,
    tableName,
    count: count ?? 0,
  };
}

function galleryUrl(page, query) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/?${search}` : "/";
}

export default async function Home({ searchParams }) {
  const params = await searchParams;
  const query = typeof params?.q === "string" ? params.q.trim().slice(0, 100) : "";
  const requestedPage = getPageNumber(params?.page);
  const result = await getCaptions({ page: requestedPage, query });
  const totalPages = Math.max(1, Math.ceil(result.count / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const { captions, error, tableName } =
    page === requestedPage
      ? result
      : await getCaptions({ page, query });

  return (
    <main className="page">
      <section className="gallery-shell">
        <div className="stack">
          <p className="eyebrow">Caption Gallery</p>
          <h1>Captions</h1>
          <p className="copy">
            Image and caption pairings from the <code>{tableName}</code> table.
          </p>
        </div>

        <form className="search-form" role="search">
          <label className="sr-only" htmlFor="caption-search">
            Search captions
          </label>
          <input
            id="caption-search"
            className="search-input"
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search captions…"
          />
          <button className="search-button" type="submit">
            Search
          </button>
          {query ? (
            <Link className="clear-link" href="/">
              Clear
            </Link>
          ) : null}
        </form>

        {error ? <p className="notice">{error}</p> : null}

        {captions.length > 0 ? (
          <div className="caption-grid">
            {captions.map((caption) => (
              <article className="caption-card" key={caption.id}>
                {caption.images?.url ? (
                  <img
                    className="caption-image"
                    src={caption.images.url}
                    alt={`Visual for the caption: ${caption.content}`}
                  />
                ) : (
                  <div className="caption-image-placeholder">Image unavailable</div>
                )}
                <div className="caption-body">
                  <p className="caption-text">{caption.content}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty">
            {query ? "No captions match that search." : "No captions found."}
          </p>
        )}

        {!error && result.count > PAGE_SIZE ? (
          <nav className="pagination" aria-label="Caption pages">
            {page > 1 ? (
              <Link className="page-link" href={galleryUrl(page - 1, query)}>
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span>
              Page {page} of {totalPages}
            </span>
            {page < totalPages ? (
              <Link className="page-link" href={galleryUrl(page + 1, query)}>
                Next
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
