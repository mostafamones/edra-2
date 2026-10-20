import { departurePost } from "@/modules/exams/student/departures/route";
export async function POST(request: Request, context: RouteContext<"/api/student/exams/[examId]/departure">) {
  return departurePost(request, (await context.params).examId);
}
