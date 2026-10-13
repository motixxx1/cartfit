import type { Metadata, Viewport } from "next";
import "./globals.css";
import NavBar from "@/components/NavBar";

export const metadata: Metadata = {
  title: "CartFit · סל-פיקס",
  description: "סל קניות חכם שנבנה בדיוק לפי התקציב שלך - בכל רשת בישראל",
};

export const viewport: Viewport = { themeColor: "#10B981", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        {/* Heebo/Rubik are loaded as a stylesheet so the build never depends on
            network access; swap for next/font/google if you prefer self-hosting. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;700;800&family=Rubik:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">
        <div className="mx-auto min-h-screen w-full max-w-2xl bg-slate-50 pb-28">{children}</div>
        <NavBar />
      </body>
    </html>
  );
}
