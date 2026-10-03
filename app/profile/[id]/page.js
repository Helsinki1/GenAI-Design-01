import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import ProfileForm from "./profile-form";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProfilePage({ params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!UUID_PATTERN.test(id)) {
    notFound();
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, email, first_name, last_name, bio, avatar_url")
    .eq("id", id)
    .maybeSingle();

  if (!error && !profile) {
    notFound();
  }

  const isOwner = user.id === id;
  const fullName = [profile?.first_name, profile?.last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="page">
      <section className="card profile-card">
        <Link className="back-link" href="/">
          ← Back to captions
        </Link>
        <p className="eyebrow">Profile</p>
        <h1>{fullName || (isOwner ? "Your profile" : "Profile")}</h1>

        {error ? (
          <p className="notice auth-error">Could not load profile: {error.message}</p>
        ) : isOwner ? (
          <ProfileForm profile={profile} />
        ) : (
          <div className="profile-view">
            {profile.avatar_url ? (
              <img className="avatar" src={profile.avatar_url} alt="" />
            ) : (
              <div className="avatar avatar-placeholder">No photo</div>
            )}
            <p className="copy">{profile.bio || "No bio yet."}</p>
          </div>
        )}
      </section>
    </main>
  );
}
