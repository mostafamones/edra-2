import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_Arabic, Nunito_Sans } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/modules/auth";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { cn } from "@/lib/utils";

const nunitoSansHeading = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  adjustFontFallback: false,
});

const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-noto-sans-arabic",
  subsets: ["arabic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Edra",
    template: "%s · Edra",
  },
  description: "One place to run your academy.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, notoSansArabic.variable, nunitoSansHeading.variable)}
    >
      <body suppressHydrationWarning className="flex min-h-full flex-col">
        <ThemeProvider>
          <QueryProvider>
            <TooltipProvider>
              <AuthProvider>{children}</AuthProvider>
              <Toaster />
            </TooltipProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
