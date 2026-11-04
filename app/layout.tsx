import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import "./learning-studio.css";
import "./notebook.css";
import "./frost.css";
import "./palettes.css";
import "./shell.css";
import "./results.css";
import { PALETTE_BOOT_SCRIPT } from "@/lib/palettes.mjs";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const icon = `${protocol}://${host}/notanota-app-icon.svg?v=3`;

  return {
    title: "NotaNota | Note Reading Trainer",
    description: "Learn music reading with short lessons, treble and bass notation, rhythm practice and note locations on guitar, piano and violin.",
    icons: {
      icon: [{ url: icon, type: "image/svg+xml" }],
      shortcut: icon,
      apple: '/app-192.png',
    },
    openGraph: {
      title: "NotaNota | Note Reading Trainer",
      description: "Short lessons, focused music-reading practice and instrument note locations. Türkçe ve English.",
      type: "website",
      siteName: "NotaNota",
      locale: "tr_TR",
      alternateLocale: ["en_US"],
      images: [{
        url: image,
        type: "image/png",
        width: 1200,
        height: 630,
        alt: "NotaNota music-reading studio",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: "NotaNota | Note Reading Trainer",
      description: "Short lessons, focused music-reading practice and instrument note locations. Türkçe ve English.",
      images: [image],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#FAF6F1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr" data-palette="bordo" suppressHydrationWarning>
      <head>
        {/* Applies the saved colour model before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: PALETTE_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
