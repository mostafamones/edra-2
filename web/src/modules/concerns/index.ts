export { CONCERN_LIMITS, type ConcernAttachment, type ConcernEvent, type ConcernEventKind, type ConcernStatus, type ConcernTarget } from "./contracts";
export { concernFailure, type ConcernErrorCode, type ConcernFailure } from "./errors";
export {
  concernKeys, ConcernReadError, loadConcernPage, loadConcernTarget, forgetConcern, forgetConcernScope, invalidateConcernLists, syncConcernThread,
  useConcernDetail, useConcernInbox, useConcernSearch, useConcernThread, useConcernUnread,
  type ConcernScope, type ConcernStatusFilter,
} from "./queries";
export { useConcernInboxLive, useConcernLive, type ConcernLiveStatus } from "./live";
export { useConcernCommands, useCreateConcern } from "./commands";
export { TYPING_TTL_MS } from "./thread";
export {
  CONCERN_BODY_MAX, CONCERN_TITLE_MAX, concernEmojiSchema,
  type ConcernDetail, type ConcernInboxEntry, type ConcernInboxPage, type ConcernMessage, type ConcernParticipant,
  type ConcernSearchHit, type ConcernThread, type ConcernUnread,
} from "./validation";

export { ConcernPanelProvider, useConcernPanel, type OpenConcernResult } from "./components/panel";
