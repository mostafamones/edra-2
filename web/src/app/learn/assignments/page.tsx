import { LearningAssignments, scopeParam } from "@/modules/learning";

export default async function AssignmentsPage({ searchParams }: PageProps<"/learn/assignments">) {
  const query = await searchParams;
  // Only a well-formed id reaches the database; anything else shows the unfiltered list.
  const unit = typeof query.unit === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.unit) ? query.unit : undefined;
  return <LearningAssignments scope={scopeParam(query)} unit={unit} />;
}
