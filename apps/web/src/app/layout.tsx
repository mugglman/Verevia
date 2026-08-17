import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Verevia",
  description: "Die Plattform für moderne Vereine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
