import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, fetchAll } from "../../../lib/admin";
import { getResource } from "../../../lib/admin-resources";
import ResourceManager from "./resource-manager";

const PAGE_SIZE = 25;

export default async function ResourcePage({ params, searchParams }) {
  const { resource: slug } = await params;
  const config = getResource(slug);
  if (!config) notFound();
  const { supabase, user } = await requireAdmin();
  const search = await searchParams;
  const page = Math.max(1, Math.min(100000, Number.parseInt(search.page, 10) || 1));
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 200) : "";
  const select = slug === "media" ? "*,images(url)" : "*";
  let query = supabase.from(config.table).select(select, { count: "exact" });
  if (slug === "media") query = query.not("model", "is", null);
  if (q && config.search) query = query.ilike(config.search, `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (config.order) query = query.order(config.order, { ascending: false });
  query = query.order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data, count, error } = await query;
  const options = {};
  for (const field of config.fields.filter((field) => field.type === "reference")) {
    const result = await fetchAll(() => supabase.from(field.table).select(`id,${field.labelKey}`).order("id"));
    if (result.error) return <p role="alert">Could not load {field.label}: {result.error.message}</p>;
    options[field.key] = result.data.map((row) => ({ id: row.id, label: row[field.labelKey] }));
  }
  const href = (next) => `/admin/${slug}?${new URLSearchParams({ page: String(next), ...(q ? { q } : {}) })}`;

  return <div className="admin-body">
    <h1>{config.title}</h1>
    {config.description && <p className="copy">{config.description}</p>}
    {config.search && <form className="resource-search" role="search">
      <label>Search {config.title.toLowerCase()}<input name="q" defaultValue={q} maxLength={200} /></label>
      <button className="auth-button">Search</button>
      {q && <Link href={`/admin/${slug}`}>Clear</Link>}
    </form>}
    {error ? <p className="notice auth-error" role="alert">Could not load {config.title.toLowerCase()}: {error.message}</p> : <>
      <p className="stat-note">{count} records · Page {page} of {Math.max(1, Math.ceil(count / PAGE_SIZE))}</p>
      <ResourceManager key={`${slug}:${page}:${q}`} slug={slug} config={config} rows={data || []} options={options} userId={user.id} />
      <nav className="resource-pages" aria-label="Pagination">
        {page > 1 && <Link href={href(page - 1)}>← Previous</Link>}
        {page * PAGE_SIZE < count && <Link href={href(page + 1)}>Next →</Link>}
      </nav>
    </>}
  </div>;
}
