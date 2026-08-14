import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const icon = `${protocol}://${host}/notanota-app-icon.svg?v=3`;

  return {
    title: "NotaNota | Note Reading Trainer",
    description: "Build fluent recognition of natural notes and read complete treble-clef lines with mixed rhythms in focused bilingual practice.",
    icons: {
      icon: [{ url: icon, type: "image/svg+xml" }],
      shortcut: icon,
    },
    openGraph: {
      title: "NotaNota | Note Reading Trainer",
      description: "See the note, name it, then read complete staff lines with a steady pulse. Türkçe ve English.",
      type: "website",
      siteName: "NotaNota",
      locale: "tr_TR",
      alternateLocale: ["en_US"],
      images: [{
        url: image,
        type: "image/png",
        width: 1200,
        height: 630,
        alt: "NotaNota treble-clef note-reading practice",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: "NotaNota | Note Reading Trainer",
      description: "See the note, name it, then read complete staff lines with a steady pulse. Türkçe ve English.",
      images: [image],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#F4EFE4",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
