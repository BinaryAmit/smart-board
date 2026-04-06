import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Smart Board",
  description: "Collaborative PDF whiteboard with authentication",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
