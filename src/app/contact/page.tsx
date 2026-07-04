import { redirect } from "next/navigation";

// Contact lives on the About page now; keep old /contact links working.
export const dynamic = "force-dynamic";

export default function ContactPage() {
  redirect("/about");
}
