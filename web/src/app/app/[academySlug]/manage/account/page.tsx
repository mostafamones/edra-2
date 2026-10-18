import { AccountSettings } from "@/modules/account";

/** Personal settings are global; the academy layout only supplies the shell and already requires staff membership. */
export default function Page() { return <AccountSettings />; }
