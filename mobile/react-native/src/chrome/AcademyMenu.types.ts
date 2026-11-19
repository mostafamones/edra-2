export type AcademyMenuProps = {
  open: boolean;
  onClose: () => void;
  academies: readonly { id: string; name: string; icon?: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSignOut: () => void;
};
