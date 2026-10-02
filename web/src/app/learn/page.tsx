import { PagePreviewView } from "@/modules/navigation/components/preview";
import { findStudentItem } from "@/modules/navigation/manifest";

export default function LearnPage() {
  return <PagePreviewView preview={findStudentItem("/learn")!.preview!} />;
}
