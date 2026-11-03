import { createFileRoute } from "@tanstack/react-router";
import { loadBooking } from "@/routes/-functions/shell";
import { StudentBookingForm } from "@/modules/students";
export const Route = createFileRoute("/invite/booking/$token/")({
  loader: ({ params }) => loadBooking({ data: params.token }),
  head: () => ({ meta: [{ title: "Register · Edra" }, { name: "referrer", content: "no-referrer" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});
function Page() { const data = Route.useLoaderData(); const { token } = Route.useParams(); return <StudentBookingForm token={token} {...data} />; }
