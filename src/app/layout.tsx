import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { getOptionalUser } from "@/lib/auth";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | Scale Evo CRM",
    default: "Scale Evo CRM",
  },
  description: "Lokales CRM und Lead-Management für Webdesign-Akquise",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getOptionalUser();

  return (
    <html lang="de" className={inter.variable}>
      <body>
        {user ? (
          // Authenticated: Shell mit Sidebar
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        ) : (
          // Unauthenticated: kein Layout (Login-Seite)
          <>{children}</>
        )}
      </body>
    </html>
  );
}
