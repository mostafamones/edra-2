import { IconBook, IconBuildingCommunity, IconCode, IconMicroscope, IconMusic, IconPalette, IconSchool, IconTrophy, IconWorld, type Icon } from "@tabler/icons-react";

import type { ACADEMY_ICON_IDS } from "./validation";

/** Labels and Tabler icons for the allowed academy icon ids, in display order. */
export const ACADEMY_ICONS: Record<(typeof ACADEMY_ICON_IDS)[number], { label: string; Icon: Icon }> = {
  school: { label: "School", Icon: IconBuildingCommunity },
  book: { label: "Book", Icon: IconBook },
  graduate: { label: "Graduate", Icon: IconSchool },
  science: { label: "Science", Icon: IconMicroscope },
  code: { label: "Code", Icon: IconCode },
  art: { label: "Art", Icon: IconPalette },
  music: { label: "Music", Icon: IconMusic },
  trophy: { label: "Trophy", Icon: IconTrophy },
  world: { label: "World", Icon: IconWorld },
};
