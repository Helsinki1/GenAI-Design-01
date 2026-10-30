import { requireAdmin } from "../../lib/admin";
import SiteHeader from "../site-header";
import AdminNav from "./admin-nav";

export const metadata = {
  title: "Caption Lab Admin",
};

export default async function AdminLayout({ children }) {
  await requireAdmin();

  return (
    <main className="page">
      <section className="gallery-shell admin-shell">
        <SiteHeader current="admin" />
        <div className="stack">
          <p className="eyebrow">Admin</p>
          <AdminNav />
        </div>
        {children}
      </section>
    </main>
  );
}
