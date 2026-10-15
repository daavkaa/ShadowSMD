import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: { default: "Skills Academy — Өдөр бүр бага багаар", template: "%s · Skills Academy" },
  description: "Сошиал медиа маркетинг ба ажлын ур чадварыг практик дасгал, шалгалт, баталгаажуулах боломжтой сертификаттай сур.",
  applicationName: "Skills Academy",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#241a43", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn">
      <body className="antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
