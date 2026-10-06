import { notFound } from "next/navigation";

/** Academy learning requires student enrollment authority, which is not available yet. */
export default function AcademyLearningPage() {
  notFound();
}
