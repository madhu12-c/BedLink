import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { getCurrentUser } from "@/lib/auth/session";
import { getSupabaseEnv } from "@/lib/supabase/env";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BedLink — Realtime Emergency Hospital Bed Coordination",
  description:
    "Real-time emergency hospital bed and resource coordination platform connecting paramedics, dispatchers, and emergency departments across Mumbai.",
  manifest: "/manifest.json",
  applicationName: "BedLink",
  keywords: ["ambulance", "hospital", "emergency", "bed coordination", "EMS", "108", "Mumbai"],
  authors: [{ name: "BedLink EMS Team" }],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-512.jpg", sizes: "512x512", type: "image/jpeg" },
    ],
    apple: [
      { url: "/icon-512.jpg", sizes: "180x180", type: "image/jpeg" },
    ],
    shortcut: "/favicon.ico",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BedLink",
    startupImage: "/icon-512.jpg",
  },
  formatDetection: {
    telephone: true,
    email: false,
    address: false,
  },
  openGraph: {
    title: "BedLink — Emergency Bed Coordination",
    description: "Real-time ambulance dispatch and hospital bed coordination for Mumbai 108 EMS.",
    type: "website",
    locale: "en_IN",
    siteName: "BedLink",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#2563EB" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const demoMode = getSupabaseEnv() === null;
  const user = demoMode ? null : await getCurrentUser();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* PWA / iOS specific meta tags */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="BedLink" />
        <meta name="application-name" content="BedLink" />
        <meta name="msapplication-TileColor" content="#2563EB" />
        <meta name="msapplication-tap-highlight" content="no" />
        {/* Prevent phone number auto-detection linking */}
        <meta name="format-detection" content="telephone=yes" />
      </head>
      <body className="min-h-full bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
        <AuthProvider user={user} demoMode={demoMode}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
