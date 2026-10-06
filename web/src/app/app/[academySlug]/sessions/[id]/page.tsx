import { SessionDetailsPage } from "@/modules/sessions/components/details-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionDetailsPage id={id} />;
}
