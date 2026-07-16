import type { Metadata } from "next";
import { MessageProvider } from "@/components/message-provider";
import "./globals.css";
import { PwaManager } from "@/components/pwa-manager";

export const metadata: Metadata = {
  title: "UAPL LMS Flight Log",
  description: "Flight log management system for UAPL trainers and administrators"
};

export const metadata = {
  title: "Apollo Flight Management System",
  description: "Mobile flight log management for Apollo Global Academy.",
  manifest: "/UATO/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Flight Manager"
  },
  icons: {
    icon: "/UATO/apollo-global-academy-logo.png",
    apple: "/UATO/apollo-global-academy-logo.png"
  }
};

export const viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
      
        <MessageProvider>{children} <MessageProvider>
  {children}
  <PwaManager />
</MessageProvide</MessageProvider>
      </body>
    </html>
  );
}
