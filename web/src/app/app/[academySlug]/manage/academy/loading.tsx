import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
