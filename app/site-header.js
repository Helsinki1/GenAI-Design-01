import Link from "next/link";
import { signOut } from "./actions";
import { createClient } from "../lib/supabase/server";

// Top bar shared by the signed-in pages. `current` is the active link's key.
export default async function SiteHeader({ current }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle()
    : { data: null };

  const links = [
    { key: "images", href: "/", label: "Images" },
    { key: "reels", href: "/reels", label: "Reels" },
    ...(user ? [{ key: "profile", href: `/profile/${user.id}`, label: "Profile" }] : []),
    ...(profile?.is_admin ? [{ key: "admin", href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span className="brand-bullet" aria-hidden="true">C</span>
        Caption Lab
      </Link>
      <nav className="site-nav" aria-label="Main">
        {links.map(({ key, href, label }) => (
          <Link
            className={`nav-link${current === key ? " is-active" : ""}`}
            href={href}
            key={key}
            aria-current={current === key ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
        {user ? (
          <form action={signOut}>
            <button className="nav-link" type="submit">
              Sign out
            </button>
          </form>
        ) : null}
      </nav>
    </header>
  );
}
