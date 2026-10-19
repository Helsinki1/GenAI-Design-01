import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import SiteHeader from "../site-header";
import { getRandomMeme } from "./actions";
import Reel from "./reel";

export const metadata = {
  title: "Reels · Caption Lab",
};

export default async function ReelsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { meme, error } = await getRandomMeme();

  return (
    <main className="page">
      <div className="gallery-shell">
        <SiteHeader current="reels" />
        <section className="reels-shell">
          {error ? (
            <p className="notice auth-error">Could not load a meme: {error}</p>
          ) : meme ? (
            <Reel initialMeme={meme} />
          ) : (
            <p className="empty">No captioned images yet. Generate a caption first!</p>
          )}
        </section>
      </div>
    </main>
  );
}
