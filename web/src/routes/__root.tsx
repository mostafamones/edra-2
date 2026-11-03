import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/modules/auth";
import { DeveloperPreviewFrame, FailureStatusChip } from "@/modules/development";
import { PortalTransition } from "@/components/shared/portal-transition";
import { getPlatform } from "@/routes/-functions/shell";
import globals from "@/styles/globals.css?url";
import fonts from "@/styles/fonts.css?url";
import noto from "@fontsource-variable/noto-sans-arabic/files/noto-sans-arabic-arabic-wght-normal.woff2?url";
import geist from "@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2?url";
import poppins400 from "@fontsource/poppins/files/poppins-latin-400-normal.woff2?url";
import poppins500 from "@fontsource/poppins/files/poppins-latin-500-normal.woff2?url";
import poppins600 from "@fontsource/poppins/files/poppins-latin-600-normal.woff2?url";
import poppins700 from "@fontsource/poppins/files/poppins-latin-700-normal.woff2?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: () => getPlatform(),
  shouldReload: false,
  head: ({ loaderData }) => ({ meta: [{ charSet: "utf-8" }, { name: "viewport", content: "width=device-width, initial-scale=1" }, { title: "Edra" }, { name: "description", content: "One place to run your academy." }, ...(loaderData ? [{ name: "edra-platform", content: loaderData }] : [])], links: [
    { rel: "stylesheet", href: globals }, { rel: "stylesheet", href: fonts }, { rel: "icon", href: "/favicon.ico" },
    ...["/fonts/figtree/figtree-latin-wght-normal.woff2", noto, geist, poppins400, poppins500, poppins600, poppins700].map(href => ({ rel: "preload", href, as: "font", type: "font/woff2", crossOrigin: "anonymous" as const })),
  ] }),
  shellComponent: Document,
  component: Root,
  notFoundComponent: NotFound,
  errorComponent: ErrorPage,
});
function Root() {
  const initialPlatform = Route.useLoaderData();
  const { queryClient } = Route.useRouteContext();
  return <ThemeProvider><QueryClientProvider client={queryClient}><TooltipProvider><AuthProvider initialPlatform={initialPlatform}><DeveloperPreviewFrame><PortalTransition><Outlet /></PortalTransition></DeveloperPreviewFrame></AuthProvider><Toaster /><FailureStatusChip /></TooltipProvider></QueryClientProvider></ThemeProvider>;
}
function Document({ children }: { children: React.ReactNode }) { return <html lang="en" suppressHydrationWarning className="h-full antialiased"><head><HeadContent /></head><body suppressHydrationWarning className="flex min-h-full flex-col">{children}<Scripts /></body></html>; }
// A root-level not-found can replace Root, so it carries the theme itself; next-themes ignores a nested provider.
// React 19 hoists this metadata from Router's notFoundComponent into the SSR head.
function NotFound() { return <ThemeProvider><meta name="robots" content="noindex" /><div style={{ fontFamily: "system-ui, sans-serif", height: "100vh", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}><div><h1 style={{ display: "inline-block", margin: "0 20px 0 0", padding: "0 23px 0 0", fontSize: 24, fontWeight: 500, verticalAlign: "top", lineHeight: "49px", borderRight: "1px solid" }}>404</h1><div style={{ display: "inline-block" }}><h2 style={{ fontSize: 14, fontWeight: 400, lineHeight: "49px", margin: 0 }}>This page could not be found.</h2></div></div></div></ThemeProvider>; }
function ErrorPage() {
  return <div style={{ fontFamily: 'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif', minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ marginTop: -32, maxWidth: 325, padding: "32px 28px", textAlign: "left" }}><h1 style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: "32px", margin: "0 0 12px" }}>This page couldn’t load</h1><p style={{ fontSize: 14, lineHeight: "21px", margin: "0 0 20px" }}>A server error occurred. Reload to try again.</p><button type="button" onClick={() => window.location.reload()} style={{ height: 32, padding: "0 12px", fontSize: 14, fontWeight: 500, borderRadius: 6, cursor: "pointer" }}>Reload</button></div></div>;
}
