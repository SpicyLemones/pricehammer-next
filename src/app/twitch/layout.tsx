import type { Metadata } from "next";

const description = "A macroeconomics exercise on a colony of sub-sentient group of slop enjoyers.";

export const metadata: Metadata = {
  title: "Twitch Toys",
  description,
  alternates: { canonical: "/twitch" },
  openGraph: {
    title: "Twitch Toys",
    description,
    url: "/twitch",
  },
  twitter: {
    title: "Twitch Toys",
    description,
  },
};

export default function TwitchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
