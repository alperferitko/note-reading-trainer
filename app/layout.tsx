import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og-social.png`;
  const icon = `${protocol}://${host}/nota-nota-icon.png`;

  return {
    title: "Nota Nota — Sight-Reading & Instrument Practice",
    description: "Bilingual sight-reading and instrument note practice. Porte okumayı ve notaların enstrümanındaki yerlerini Türkçe veya İngilizce çalış.",
    icons: {
      icon,
      shortcut: icon,
    },
    openGraph: {
      title: "Nota Nota",
      description: "Read the note. Find it on your instrument. · Notayı gör. Enstrümanında bul.",
      type: "website",
      siteName: "Nota Nota",
      locale: "tr_TR",
      alternateLocale: ["en_US"],
      images: [{
        url: image,
        width: 1729,
        height: 910,
        type: "image/png",
        alt: "Nota Nota sight-reading and instrument practice",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Nota Nota",
      description: "Read the note. Find it on your instrument. · Notayı gör. Enstrümanında bul.",
      images: [image],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
