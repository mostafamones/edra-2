import { createFileRoute } from "@tanstack/react-router";
import { loadAccount } from "@/routes/-functions/shell";
import Link from "@/components/shared/link";
import { staffEntryHref } from "@/lib/routing";
import { AccountSettings } from "@/modules/account";

export const Route = createFileRoute("/account/")({ loader: () => loadAccount(), component: Page });
function Page() { return <div className="flex min-h-svh flex-col"><Link href={staffEntryHref()} className="m-6 mb-0 self-start text-sm underline underline-offset-4">Back to your workspace</Link><AccountSettings /></div>; }
