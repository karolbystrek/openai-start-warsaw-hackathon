import type { Metadata } from "next";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "AI Shopping Assistant",
  description: "Deterministic deal evaluation demo",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
