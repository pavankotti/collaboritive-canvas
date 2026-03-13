import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SkribblCanvas",
  description: "Real-time collaborative drawing & guessing game",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="antialiased font-sans h-full">
        {children}
      </body>
    </html>
  );
}
