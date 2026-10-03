import { redirect } from "next/navigation";

// The image grid lives on the home page; image pages stay at /caption-rating/[id].
export default function CaptionRatingPage() {
  redirect("/");
}
