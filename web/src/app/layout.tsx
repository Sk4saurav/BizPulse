import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const instrument = Instrument_Serif({ 
  weight: "400", 
  subsets: ["latin"],
  variable: "--font-serif",
  style: ["normal", "italic"]
});

export const metadata: Metadata = {
  title: "BizPulse - AI Business Analytics for Indian SMBs",
  description: "Upload your data, get a consultant-grade business health assessment instantly.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={\`\${inter.variable} \${instrument.variable} font-sans antialiased bg-navy text-white min-h-screen\`}
      >
        {children}
      </body>
    </html>
  );
}
