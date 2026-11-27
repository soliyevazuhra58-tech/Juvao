import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JUVAO — Your AI space",
  description: "A thoughtful space to think, create, and explore with JUVAO AI.",
  applicationName: "JUVAO",
};

export const viewport: Viewport = {
  themeColor: "#090a0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}