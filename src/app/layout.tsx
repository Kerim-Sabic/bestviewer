import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Horalix DICOM Viewer",
  description: "Research-use DICOMweb medical imaging viewer"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
