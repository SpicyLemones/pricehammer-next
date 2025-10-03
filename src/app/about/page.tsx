import type { Metadata } from "next";
import { About } from "@/components/About";

const description =
  "Learn how PriceHammer tracks Australian Warhammer prices, the data sources we use, and the mission behind the hobby project.";

export const metadata: Metadata = {
  title: "About PriceHammer",
  description,
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return <About />;
}
