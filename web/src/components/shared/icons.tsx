import { forwardRef, type ComponentProps, type FunctionComponent, type ForwardRefExoticComponent, type RefAttributes } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Add01Icon,
  Alert02Icon,
  AlertCircleIcon,
  Archive03Icon,
  ArchiveOff03Icon,
  ArrowDown02Icon,
  ArrowDownRight01Icon,
  ArrowDownToLineIcon,
  ArrowExpandIcon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  ArrowUp02Icon,
  ArrowUpDownIcon,
  ArrowUpToLineIcon,
  BarCode01Icon,
  Book01Icon,
  BookOpen01Icon,
  Books01Icon,
  Bug01Icon,
  Building03Icon,
  Calendar03Icon,
  CalendarClockIcon,
  Cancel01Icon,
  ChartHistogramIcon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  Clock01Icon,
  CloudOffIcon,
  CodeIcon,
  Copy01Icon,
  DatabaseImportIcon,
  Delete02Icon,
  Download01Icon,
  Edit01Icon,
  ExternalLinkIcon,
  FileEditIcon,
  FileImportIcon,
  FileTextIcon,
  FileUploadIcon,
  FilterRemoveIcon,
  Flag01Icon,
  FlashIcon,
  FloppyDiskIcon,
  GitBranchIcon,
  Globe02Icon,
  GraduationCapIcon,
  HelpCircleIcon,
  HierarchyIcon,
  HistoryIcon,
  Home01Icon,
  IdentityCardIcon,
  Image01Icon,
  ImageOffIcon,
  InformationCircleIcon,
  LaptopIcon,
  Link01Icon,
  ListIcon,
  ListOrderedIcon,
  ListViewIcon,
  LiveStreaming02Icon,
  Loading03Icon,
  Location01Icon,
  LockKeyholeIcon,
  LockKeyholeOpenIcon,
  Logout01Icon,
  MagicWand01Icon,
  Message01Icon,
  MicroscopeIcon,
  MinusSignIcon,
  MoreHorizontalIcon,
  MoreVerticalIcon,
  MusicNote01Icon,
  Notification03Icon,
  PaintBoardIcon,
  PauseIcon,
  PencilEdit01Icon,
  PlayIcon,
  Plug01Icon,
  Refresh01Icon,
  Rotate01Icon,
  School01Icon,
  Search01Icon,
  SearchCheckIcon,
  SearchSlashIcon,
  Sent02Icon,
  Settings01Icon,
  SlashIcon,
  SlidersHorizontalIcon,
  StopIcon,
  TextNumberSignIcon,
  Tick02Icon,
  Ticket01Icon,
  TrophyIcon,
  UnfoldMoreIcon,
  UserAdd01Icon,
  UserBlock01Icon,
  UserGroupIcon,
  UserIcon,
  UserSettings01Icon,
  UserXIcon,
  UsersIcon,
  ViewIcon,
  ViewOffSlashIcon,
  WifiOff01Icon,
} from "@hugeicons/core-free-icons";

export type IconProps = Omit<ComponentProps<typeof HugeiconsIcon>, "icon" | "stroke" | "strokeWidth" | "ref"> & { stroke?: number | string; strokeWidth?: number | string };
export type Icon = FunctionComponent<IconProps>;

function createIcon(icon: IconSvgElement, filled = false): ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>> {
  return forwardRef<SVGSVGElement, IconProps>(function IconAdapter({ stroke: _stroke, strokeWidth: _strokeWidth, absoluteStrokeWidth: _absoluteStrokeWidth, size = 24, ...props }, ref) {
    void _stroke; void _strokeWidth; void _absoluteStrokeWidth;
    return <HugeiconsIcon {...props} ref={ref} icon={icon} size={size} strokeWidth={1.5} {...(filled ? { fill: "currentColor" } : {})} />;
  });
}

export const IconAdjustmentsHorizontal = /*#__PURE__*/ createIcon(SlidersHorizontalIcon);
export const IconAlertCircle = /*#__PURE__*/ createIcon(AlertCircleIcon);
export const IconAlertTriangle = /*#__PURE__*/ createIcon(Alert02Icon);
export const IconArchive = /*#__PURE__*/ createIcon(Archive03Icon);
export const IconArchiveOff = /*#__PURE__*/ createIcon(ArchiveOff03Icon);
export const IconArrowBarToDown = /*#__PURE__*/ createIcon(ArrowDownToLineIcon);
export const IconArrowBarToUp = /*#__PURE__*/ createIcon(ArrowUpToLineIcon);
export const IconArrowDown = /*#__PURE__*/ createIcon(ArrowDown02Icon);
export const IconArrowDownRight = /*#__PURE__*/ createIcon(ArrowDownRight01Icon);
export const IconArrowLeft = /*#__PURE__*/ createIcon(ArrowLeft02Icon);
export const IconArrowRight = /*#__PURE__*/ createIcon(ArrowRight02Icon);
export const IconArrowUp = /*#__PURE__*/ createIcon(ArrowUp02Icon);
export const IconArrowsMaximize = /*#__PURE__*/ createIcon(ArrowExpandIcon);
export const IconArrowsSort = /*#__PURE__*/ createIcon(ArrowUpDownIcon);
export const IconBarcode = /*#__PURE__*/ createIcon(BarCode01Icon);
export const IconBell = /*#__PURE__*/ createIcon(Notification03Icon);
export const IconBolt = /*#__PURE__*/ createIcon(FlashIcon);
export const IconBook = /*#__PURE__*/ createIcon(BookOpen01Icon);
export const IconBook2 = /*#__PURE__*/ createIcon(Book01Icon);
export const IconBooks = /*#__PURE__*/ createIcon(Books01Icon);
export const IconBroadcast = /*#__PURE__*/ createIcon(LiveStreaming02Icon);
export const IconBug = /*#__PURE__*/ createIcon(Bug01Icon);
export const IconBuilding = /*#__PURE__*/ createIcon(Building03Icon);
export const IconBuildingCommunity = /*#__PURE__*/ createIcon(School01Icon);
export const IconCalendar = /*#__PURE__*/ createIcon(Calendar03Icon);
export const IconCalendarClock = /*#__PURE__*/ createIcon(CalendarClockIcon);
export const IconCalendarDue = /*#__PURE__*/ createIcon(CalendarClockIcon);
export const IconChartBar = /*#__PURE__*/ createIcon(ChartHistogramIcon);
export const IconCheck = /*#__PURE__*/ createIcon(Tick02Icon);
export const IconChecklist = /*#__PURE__*/ createIcon(CheckListIcon);
export const IconChevronDown = /*#__PURE__*/ createIcon(ChevronDownIcon);
export const IconChevronLeft = /*#__PURE__*/ createIcon(ChevronLeftIcon);
export const IconChevronRight = /*#__PURE__*/ createIcon(ChevronRightIcon);
export const IconChevronUp = /*#__PURE__*/ createIcon(ChevronUpIcon);
export const IconChevronsLeft = /*#__PURE__*/ createIcon(ChevronsLeftIcon);
export const IconChevronsRight = /*#__PURE__*/ createIcon(ChevronsRightIcon);
export const IconCircleCheck = /*#__PURE__*/ createIcon(CheckmarkCircle02Icon);
export const IconClipboardCheck = /*#__PURE__*/ createIcon(ClipboardCheckIcon);
export const IconClipboardList = /*#__PURE__*/ createIcon(ClipboardListIcon);
export const IconClock = /*#__PURE__*/ createIcon(Clock01Icon);
export const IconClockPlay = /*#__PURE__*/ createIcon(Clock01Icon);
export const IconCloudOff = /*#__PURE__*/ createIcon(CloudOffIcon);
export const IconCode = /*#__PURE__*/ createIcon(CodeIcon);
export const IconCopy = /*#__PURE__*/ createIcon(Copy01Icon);
export const IconDatabaseImport = /*#__PURE__*/ createIcon(DatabaseImportIcon);
export const IconDeviceFloppy = /*#__PURE__*/ createIcon(FloppyDiskIcon);
export const IconDeviceLaptop = /*#__PURE__*/ createIcon(LaptopIcon);
export const IconDots = /*#__PURE__*/ createIcon(MoreHorizontalIcon);
export const IconDotsVertical = /*#__PURE__*/ createIcon(MoreVerticalIcon);
export const IconDownload = /*#__PURE__*/ createIcon(Download01Icon);
export const IconEdit = /*#__PURE__*/ createIcon(Edit01Icon);
export const IconExternalLink = /*#__PURE__*/ createIcon(ExternalLinkIcon);
export const IconEye = /*#__PURE__*/ createIcon(ViewIcon);
export const IconEyeOff = /*#__PURE__*/ createIcon(ViewOffSlashIcon);
export const IconFileImport = /*#__PURE__*/ createIcon(FileImportIcon);
export const IconFilePencil = /*#__PURE__*/ createIcon(FileEditIcon);
export const IconFileText = /*#__PURE__*/ createIcon(FileTextIcon);
export const IconFileUpload = /*#__PURE__*/ createIcon(FileUploadIcon);
export const IconFilterOff = /*#__PURE__*/ createIcon(FilterRemoveIcon);
export const IconFlag = /*#__PURE__*/ createIcon(Flag01Icon);
export const IconFlagFilled = /*#__PURE__*/ createIcon(Flag01Icon, true);
export const IconGitBranch = /*#__PURE__*/ createIcon(GitBranchIcon);
export const IconHistory = /*#__PURE__*/ createIcon(HistoryIcon);
export const IconHome = /*#__PURE__*/ createIcon(Home01Icon);
export const IconId = /*#__PURE__*/ createIcon(IdentityCardIcon);
export const IconInfoCircle = /*#__PURE__*/ createIcon(InformationCircleIcon);
export const IconLink = /*#__PURE__*/ createIcon(Link01Icon);
export const IconList = /*#__PURE__*/ createIcon(ListIcon);
export const IconListCheck = /*#__PURE__*/ createIcon(CheckListIcon);
export const IconListDetails = /*#__PURE__*/ createIcon(ListViewIcon);
export const IconListNumbers = /*#__PURE__*/ createIcon(ListOrderedIcon);
export const IconLoader = /*#__PURE__*/ createIcon(Loading03Icon);
export const IconLoader2 = /*#__PURE__*/ createIcon(Loading03Icon);
export const IconLock = /*#__PURE__*/ createIcon(LockKeyholeIcon);
export const IconLockOpen = /*#__PURE__*/ createIcon(LockKeyholeOpenIcon);
export const IconLogout = /*#__PURE__*/ createIcon(Logout01Icon);
export const IconMapPin = /*#__PURE__*/ createIcon(Location01Icon);
export const IconMessageCircle = /*#__PURE__*/ createIcon(Message01Icon);
export const IconMicroscope = /*#__PURE__*/ createIcon(MicroscopeIcon);
export const IconMinus = /*#__PURE__*/ createIcon(MinusSignIcon);
export const IconMusic = /*#__PURE__*/ createIcon(MusicNote01Icon);
export const IconNumbers = /*#__PURE__*/ createIcon(TextNumberSignIcon);
export const IconPalette = /*#__PURE__*/ createIcon(PaintBoardIcon);
export const IconPencil = /*#__PURE__*/ createIcon(PencilEdit01Icon);
export const IconPhoto = /*#__PURE__*/ createIcon(Image01Icon);
export const IconPhotoOff = /*#__PURE__*/ createIcon(ImageOffIcon);
export const IconPlayerPause = /*#__PURE__*/ createIcon(PauseIcon);
export const IconPlayerPlay = /*#__PURE__*/ createIcon(PlayIcon);
export const IconPlayerStop = /*#__PURE__*/ createIcon(StopIcon);
export const IconPlug = /*#__PURE__*/ createIcon(Plug01Icon);
export const IconPlus = /*#__PURE__*/ createIcon(Add01Icon);
export const IconQuestionMark = /*#__PURE__*/ createIcon(HelpCircleIcon);
export const IconRefresh = /*#__PURE__*/ createIcon(Refresh01Icon);
export const IconRotate = /*#__PURE__*/ createIcon(Rotate01Icon);
export const IconSchool = /*#__PURE__*/ createIcon(GraduationCapIcon);
export const IconSearch = /*#__PURE__*/ createIcon(Search01Icon);
export const IconSearchOff = /*#__PURE__*/ createIcon(SearchSlashIcon);
export const IconSelector = /*#__PURE__*/ createIcon(UnfoldMoreIcon);
export const IconSend = /*#__PURE__*/ createIcon(Sent02Icon);
export const IconSettings = /*#__PURE__*/ createIcon(Settings01Icon);
export const IconSitemap = /*#__PURE__*/ createIcon(HierarchyIcon);
export const IconSlash = /*#__PURE__*/ createIcon(SlashIcon);
export const IconTicket = /*#__PURE__*/ createIcon(Ticket01Icon);
export const IconTrash = /*#__PURE__*/ createIcon(Delete02Icon);
export const IconTrophy = /*#__PURE__*/ createIcon(TrophyIcon);
export const IconUser = /*#__PURE__*/ createIcon(UserIcon);
export const IconUserCog = /*#__PURE__*/ createIcon(UserSettings01Icon);
export const IconUserOff = /*#__PURE__*/ createIcon(UserBlock01Icon);
export const IconUserPlus = /*#__PURE__*/ createIcon(UserAdd01Icon);
export const IconUserX = /*#__PURE__*/ createIcon(UserXIcon);
export const IconUsers = /*#__PURE__*/ createIcon(UsersIcon);
export const IconUsersGroup = /*#__PURE__*/ createIcon(UserGroupIcon);
export const IconWand = /*#__PURE__*/ createIcon(MagicWand01Icon);
export const IconWifiOff = /*#__PURE__*/ createIcon(WifiOff01Icon);
export const IconWorld = /*#__PURE__*/ createIcon(Globe02Icon);
export const IconX = /*#__PURE__*/ createIcon(Cancel01Icon);
export const IconZoomCheck = /*#__PURE__*/ createIcon(SearchCheckIcon);
