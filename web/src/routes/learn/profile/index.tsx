import { createFileRoute } from "@tanstack/react-router";
import { AccountSettings } from "@/modules/account";
export const Route = createFileRoute("/learn/profile/")({ component: AccountSettings });
