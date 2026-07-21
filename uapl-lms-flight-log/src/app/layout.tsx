import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MessageProvider } from "@/components/message-provider";
import { PwaManager } from "@/components/pwa-manager";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Apollo Flight Management System",
  title: {
    default: "Apollo Flight Management System",
    template: "%s | Apollo Flight Management System",
  },
  description:
    "Operations, training, maintenance, inventory, records, and reporting for Apollo Global Academy.",
  manifest: "/UATO/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Flight Manager",
  },
  icons: {
    icon: "/UATO/apollo-global-academy-logo.png",
    apple: "/UATO/apollo-global-academy-logo.png",
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f172a" },
  ],
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <MessageProvider>
          {children}
          <PwaManager />
        </MessageProvider>
      </body>
    </html>
  );
}
