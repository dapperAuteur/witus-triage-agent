import type { Metadata, Viewport } from "next";
// Self-hosted Geist (offline-first — STYLEGUIDE §2: no runtime font fetch).
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "WitUS Triage Agent",
  description:
    "A LangGraph agent that classifies WitUS Inbox submissions, proposes an action, and routes through a human-in-the-loop approval gate.",
  // WitUS ecosystem brand package — variant 04-orbit-type (the WitUS Inbox pairing).
  icons: {
    icon: [
      { url: "/brand/witus/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/witus/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/witus/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/brand/witus/favicon-180.png",
  },
};

// Mobile-first: lock the layout viewport and tint the browser chrome slate.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#020617",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
