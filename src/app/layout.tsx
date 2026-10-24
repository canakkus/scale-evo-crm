import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { getShellUser } from "@/lib/shell-user";
import { LocationProvider } from "@/lib/location-context";
import { LocationPromptModal } from "@/components/location/location-prompt-modal";
import { ThemeProvider } from "@/components/theme-provider";

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
  const user = await getShellUser();

  return (
    <html lang="de" className={inter.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <LocationProvider initialUser={user}>
            {user ? (
              <div className="flex h-screen overflow-hidden">
                <Sidebar user={user} />
                <main className="flex-1 overflow-y-auto">
                  {children}
                </main>
                <LocationPromptModal />
              </div>
            ) : (
              children
            )}
          </LocationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
