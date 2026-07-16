import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og-social.png`;
  const icon = `${protocol}://${host}/favicon.png`;

  return {
    title: "Nota Nota — Note Reading / Porte Çalışması",
    description: "Treble-clef note reading practice in Turkish and English. Sol anahtarındaki doğal notaları Türkçe veya İngilizce çalış.",
    icons: {
      icon,
      shortcut: icon,
    },
    openGraph: {
      title: "Nota Nota",
      description: "See the note. Name it. · Notayı gör. İsmini söyle.",
      type: "website",
      siteName: "Nota Nota",
      locale: "tr_TR",
      alternateLocale: ["en_US"],
      images: [{
        url: image,
        width: 1729,
        height: 910,
        type: "image/png",
        alt: "Nota Nota treble-clef note reading trainer",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Nota Nota",
      description: "See the note. Name it. · Notayı gör. İsmini söyle.",
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
