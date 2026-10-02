import { PagePreviewView } from "@/modules/navigation/components/preview";
import { findStaffItem } from "@/modules/navigation/manifest";

export default function AppHomePage() {
  return <PagePreviewView preview={findStaffItem("/app")!.preview!} />;
}
