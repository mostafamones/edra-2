import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export function ConcernFeedback({ children, retry }: { children: React.ReactNode; retry?: () => void }) {
  return <Empty className="p-6" role={retry ? "alert" : "status"}>
    <EmptyHeader><EmptyTitle className="text-sm">{children}</EmptyTitle></EmptyHeader>
    {retry && <Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>}
  </Empty>;
}
