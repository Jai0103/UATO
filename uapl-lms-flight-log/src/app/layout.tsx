import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MessageProvider } from "@/components/message-provider";
import { PwaManager } from "@/components/pwa-manager";
import "./globals.css";

export const metadata: Metadata = {
  title: "Apollo Flight Management System",
  description:
    "Mobile flight log management system for Apollo Global Academy.",
  manifest: "/UATO/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Flight Manager",
  },
  icons: {
    icon: "/UATO/AGA_Logo_fullcolor_Horizontal (1).png",
    apple: "/UATO/AGA_Logo_fullcolor_Horizontal (1).png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
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
