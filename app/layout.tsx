import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;

  return {
    title: "Nota Nota — Porte Çalışması",
    description: "Sol anahtarındaki doğal notaları görerek ve konumlarını okuyarak çalış.",
    openGraph: {
      title: "Nota Nota",
      description: "Notayı gör. İsmini söyle.",
      type: "website",
      locale: "tr_TR",
      images: [{ url: image, width: 1536, height: 1024, alt: "Nota Nota porte çalışması" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Nota Nota",
      description: "Notayı gör. İsmini söyle.",
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
