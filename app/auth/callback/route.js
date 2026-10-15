import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";

// Every sign-in gets a fresh, randomly chosen Image of the Day.
async function pickImageOfTheDay(supabase, userId) {
  const { data: images } = await supabase.from("images").select("id");
  if (!images?.length) return;

  const { id } = images[Math.floor(Math.random() * images.length)];
  await supabase
    .from("profiles")
    .update({ image_of_the_day_id: id })
    .eq("id", userId);
}

export async function GET(request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      await pickImageOfTheDay(supabase, data.user.id);
      return NextResponse.redirect(new URL("/", requestUrl.origin));
    }
  }

  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("error", "Sign-in could not be completed. Please try again.");
  return NextResponse.redirect(loginUrl);
}
