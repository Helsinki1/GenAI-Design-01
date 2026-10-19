import Link from "next/link";
import { requireAdmin } from "../../lib/admin";
import { signOut } from "../actions";
import AdminNav from "./admin-nav";

export const metadata = {
  title: "Caption Lab Admin",
};

export default async function AdminLayout({ children }) {
  const { user } = await requireAdmin();

  return (
    <main className="page">
      <section className="gallery-shell admin-shell">
        <div className="page-header">
          <div className="stack">
            <p className="eyebrow">Caption Lab · Admin</p>
            <AdminNav />
          </div>
          <div className="account">
            <span className="account-email">{user.email}</span>
            <Link className="secondary-button" href="/">
              Back to app
            </Link>
            <form action={signOut}>
              <button className="secondary-button" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
        {children}
      </section>
    </main>
  );
}
