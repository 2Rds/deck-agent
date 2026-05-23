import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeckRedTeam — Investor-grade pitch deck critique",
  description:
    "Upload your pitch deck. Get an investor-grade red team report in under 5 minutes. Math gets checked. TAM/SAM/SOM gets stress-tested. Slides that will get you killed in a partner meeting get flagged.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
