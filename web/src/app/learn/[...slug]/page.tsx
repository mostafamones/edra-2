import { notFound } from "next/navigation";

import { PagePreviewView } from "@/modules/navigation/components/preview";
import { findStudentItem } from "@/modules/navigation/manifest";

export default async function StudentPreviewPage({ params }: PageProps<"/learn/[...slug]">) {
  const { slug } = await params;
  const item = findStudentItem(`/learn/${slug.join("/")}`);
  if (!item?.preview) notFound();
  return <PagePreviewView preview={item.preview} />;
}
