import Link from "next/link";
import { signOut } from "./actions";

export default function SiteHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/admin">
        <span className="brand-bullet" aria-hidden="true">C</span>
        Caption Lab Admin
      </Link>
      <nav className="site-nav" aria-label="Main">
        <a className="nav-link" href={process.env.NEXT_PUBLIC_CAPTION_APP_URL || "https://gen-ai-design-01.vercel.app"}>Caption app ↗</a>
        <form action={signOut}><button className="nav-link" type="submit">Sign out</button></form>
      </nav>
    </header>
  );
}
