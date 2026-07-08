import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Used just for the "RALLY" logo wordmark next to the icon mark.
const poppins = Poppins({
  variable: "--font-poppins",
  weight: ["700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Rally · find the fair spot",
  description:
    "Type in where everyone's coming from and Rally finds the London station that's fairest for the whole group, based on real journey times.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} h-full antialiased`}
      style={{ colorScheme: "light" }}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
