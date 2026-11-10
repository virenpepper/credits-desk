import type { Metadata } from "next";
import { Inter } from "next/font/google";
import config from "../../desk.config.json";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: config.deskName,
  description: "Manufacturer credit claims: log, triage, verify, deduct",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The font variable must sit on <html>: Tailwind's preflight sets font-family there.
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
