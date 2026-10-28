import type { Metadata } from "next";
import { headers } from "next/headers";
import { ROUTE_HEADER } from "@/lib/routing";
import { Geist_Mono, Noto_Sans_Arabic, Figtree, Poppins } from "next/font/google";
import { QueryProvider } from "@/components/providers/query-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { AuthProvider } from "@/modules/auth";
import { DeveloperPreviewFrame, FailureStatusChip } from "@/modules/development";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { cn } from "@/lib/utils";
import { PortalTransition } from "@/components/shared/portal-transition";

const notoSansArabic = Noto_Sans_Arabic({
  variable: "--font-noto-sans-arabic",
  subsets: ["arabic"],
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  // The generated Arial fallback has Arabic glyphs and would draw Arabic before Noto Sans Arabic.
  adjustFontFallback: false,
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  // The generated Arial fallback has Arabic glyphs and would draw Arabic before Noto Sans Arabic.
  adjustFontFallback: false,
  weight: ["400", "500", "600", "700"],
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const platformHeader = (await headers()).get(ROUTE_HEADER);
  const initialPlatform = platformHeader === "marketing" || platformHeader === "staff" || platformHeader === "student" ? platformHeader : null;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full", "antialiased", geistMono.variable, notoSansArabic.variable, poppins.variable, figtree.variable)}
    >
      <body suppressHydrationWarning className="flex min-h-full flex-col">
        <ThemeProvider>
          <QueryProvider>
            <TooltipProvider>
              <AuthProvider initialPlatform={initialPlatform}>
                <DeveloperPreviewFrame>
                  <PortalTransition>{children}</PortalTransition>
                </DeveloperPreviewFrame>
              </AuthProvider>
              <Toaster />
              <FailureStatusChip />
            </TooltipProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
