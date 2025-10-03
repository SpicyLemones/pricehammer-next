import type { Metadata } from "next";
import { ContactStatic } from "@/components/ContactStatic";

const description =
  "Contact the PriceHammer team to report incorrect Warhammer prices, request new Australian stores, or share feedback.";

export const metadata: Metadata = {
  title: "Contact PriceHammer",
  description,
  alternates: {
    canonical: "/contact",
  },
};

export default function ContactPage() {
  return <ContactStatic />;
}
