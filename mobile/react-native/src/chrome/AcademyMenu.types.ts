import type { Academy } from "../fixtures";

export type AcademyMenuProps = {
  open: boolean;
  onClose: () => void;
  academies: Academy[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSignOut: () => void;
};
