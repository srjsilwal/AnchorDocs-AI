import type { Metadata } from "next";
import { Archivo, Lato } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AnchorDocs | Document Q&A",
  description:
    "Ask questions across your workspace documents and check the sources behind every answer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className={`${archivo.variable} ${lato.variable} min-h-full`}>
        {children}
      </body>
    </html>
  );
}
