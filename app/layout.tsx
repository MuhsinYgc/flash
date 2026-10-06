import type { Metadata } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Kipaş İstiklal Basket — Işık Gösterisi",
  description:
    "Kipaş İstiklal Basket tribün ışık gösterisi. DJ müziği başlatır, taraftarlar QR ile katılır.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} h-full font-sans antialiased`}
    >
      <body className="stadium-bg flex min-h-full flex-col text-foreground">
        {children}
      </body>
    </html>
  );
}
