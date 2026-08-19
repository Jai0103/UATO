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
    icon: [
      {
        url: "/UATO/app-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/UATO/app-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/UATO/app-icon-180.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
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
    { media: "(prefers-color-scheme: light)", color: "#102a43" },
    { media: "(prefers-color-scheme: dark)", color: "#0b121b" },
  ],
};

const themeInitializationScript = `
  (function () {
    try {
      var savedTheme = localStorage.getItem("uapl-interface-theme");
      document.documentElement.classList.toggle("dark", savedTheme === "dark");
    } catch (error) {
      document.documentElement.classList.remove("dark");
    }
  })();
`;

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body>
        <MessageProvider>
          {children}
          <PwaManager />
        </MessageProvider>
      </body>
    </html>
  );
}
