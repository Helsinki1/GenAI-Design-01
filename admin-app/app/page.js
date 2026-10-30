import { redirect } from "next/navigation";
import { requireAdmin } from "../lib/admin";

export default async function Home() {
  await requireAdmin();
  redirect("/admin");
}
