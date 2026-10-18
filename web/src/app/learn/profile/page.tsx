import { AccountSettings } from "@/modules/account";

/** The learn layout already requires a signed-in account with completed student setup, not an academy. */
export default function StudentProfilePage() {
  return <AccountSettings />;
}
