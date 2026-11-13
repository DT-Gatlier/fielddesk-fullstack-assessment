import type { Metadata } from "next";
import { ToastProvider } from "@/components/toast";
import { ReduxProvider } from "@/components/redux-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "FieldDesk | Operations & Dispatch",
  description: "Multi-tenant field operations and maintenance management platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <ReduxProvider><ToastProvider>{children}</ToastProvider></ReduxProvider>
      </body>
    </html>
  );
}
