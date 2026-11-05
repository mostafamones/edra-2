import { useState } from "react";
import { AlertCircleIcon, At, CheckmarkCircle02Icon, Message01Icon, Notification01Icon, SquareUnlock02Icon, UserAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useConcernPanel, type ConcernScope } from "@/modules/concerns";
import { useMarkNotificationsRead, useNotificationList, useNotificationUnread } from "../queries";
import { notificationText } from "../text";
import type { NotificationItem } from "../validation";
import type { usePushSubscription } from "../push";
import { PushControl } from "./push";

const ICONS: Record<NotificationItem["kind"], typeof Message01Icon> = {
  concern_added: UserAdd01Icon, concern_message: Message01Icon, concern_mention: At,
  concern_settled: CheckmarkCircle02Icon, concern_reopened: SquareUnlock02Icon,
};

function State({ children, retry }: { children: React.ReactNode; retry?: () => void }) {
  return <Empty className="p-6" role={retry ? "alert" : "status"}>
    <EmptyHeader><EmptyTitle className="text-sm">{children}</EmptyTitle></EmptyHeader>
    {retry && <Button type="button" variant="outline" size="sm" onClick={retry}>Retry</Button>}
  </Empty>;
}

/**
 * Header bell for the current academy. Counts come from the server total; the list loads only
 * while open. Activation opens the concern through the panel, which rechecks access first.
 */
export function NotificationPopover({ scope, push }: { scope: ConcernScope; push: ReturnType<typeof usePushSubscription> }) {
  const [open, setOpen] = useState(false);
  const panel = useConcernPanel();
  const unread = useNotificationUnread(scope);
  const list = useNotificationList(scope, open);
  const markRead = useMarkNotificationsRead(scope);
  const [markError, setMarkError] = useState(false);
  const count = unread.data?.count ?? 0;
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  const activate = (item: NotificationItem) => {
    setOpen(false);
    if (!item.readAt) void markRead([item.id]);
    void panel?.openConcern({ academyId: scope.academyId, concernId: item.concernId, ...(item.messageId && { messageId: item.messageId }) });
  };
  const markAll = () => { setMarkError(false); void markRead().then((ok) => setMarkError(!ok)); };
  return <Popover open={open} onOpenChange={setOpen}>
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="relative" aria-label={count ? `Notifications, ${count} unread` : "Notifications"}>
            <HugeiconsIcon icon={Notification01Icon} strokeWidth={1.5} aria-hidden="true" />
            {count > 0 && <Badge aria-hidden="true" className="absolute -end-1 -top-1 h-4 min-w-4 px-1 text-[10px]">{count > 99 ? "99+" : count}</Badge>}
            {unread.isError && <HugeiconsIcon icon={AlertCircleIcon} strokeWidth={1.5} className="absolute -end-1 -top-1 size-3.5" aria-hidden="true" />}
          </Button>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent>{unread.isError ? "Notifications (count unavailable)" : "Notifications"}</TooltipContent>
    </Tooltip>
    <PopoverContent align="end" className="flex max-h-[min(560px,calc(100dvh-5rem))] w-[min(380px,calc(100vw-2rem))] flex-col gap-0 p-0">
      <PopoverHeader className="flex-row items-center gap-2 border-b px-3 py-2">
        <PopoverTitle className="flex-1">Notifications</PopoverTitle>
        {count > 0 && <Button type="button" size="sm" variant="ghost" onClick={markAll}>Mark all read</Button>}
      </PopoverHeader>
      {markError && <p role="alert" className="px-3 py-1 text-xs">Could not mark notifications read</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.isLoading ? <State>Loading notifications…</State>
          : list.isError && !items.length ? <State retry={() => void list.refetch()}>Could not load notifications</State>
          : !items.length ? <State>No notifications</State>
          : <ul aria-label="Notifications">
            {items.map((item) => {
              const { action, preview } = notificationText(item);
              return <li key={item.id}>
                <button type="button" disabled={!panel} onClick={() => activate(item)}
                  className="flex w-full gap-3 px-3 py-2 text-start hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50">
                  <HugeiconsIcon icon={ICONS[item.kind]} strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium" dir="auto">{action}</span>
                    <span className="block truncate text-xs text-muted-foreground" dir="auto">{item.concernTitle}</span>
                    {preview && <span className={`line-clamp-2 break-words text-xs ${item.deleted ? "italic text-muted-foreground" : ""}`} dir="auto">{preview}</span>}
                    <time dateTime={item.createdAt} className="block text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</time>
                  </span>
                  {!item.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"><span className="sr-only">Unread</span></span>}
                </button>
              </li>;
            })}
          </ul>}
        {list.hasNextPage && <div className="p-2 text-center"><Button type="button" size="sm" variant="ghost" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? "Loading…" : "Load more"}</Button></div>}
        {list.isFetchNextPageError && <State retry={() => void list.fetchNextPage()}>Could not load more notifications</State>}
      </div>
      <PushControl push={push} />
    </PopoverContent>
  </Popover>;
}
