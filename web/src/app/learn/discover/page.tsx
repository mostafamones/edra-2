import { LearningUnits, scopeParam, unitListParams } from "@/modules/learning";

export default async function DiscoverPage({ searchParams }: PageProps<"/learn/discover">) {
  const query = await searchParams;
  return <LearningUnits started={false} {...unitListParams(query)} scope={scopeParam(query)} />;
}
