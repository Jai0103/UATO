import type { Metadata } from "next";
import { MessageProvider } from "@/components/message-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "UAPL LMS Flight Log",
  description: "Flight log management system for UAPL trainers and administrators"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <MessageProvider>{children}</MessageProvider>
      </body>
    </html>
  );
}
