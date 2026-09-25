import type { SVGProps } from "react";

const common = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
};

type Props = SVGProps<SVGSVGElement>;

export const FolderIcon = (p: Props) => <svg {...common} {...p}><path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 9h18"/></svg>;
export const FileIcon = (p: Props) => <svg {...common} {...p}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg>;
export const ChevronIcon = (p: Props) => <svg {...common} {...p}><path d="m9 18 6-6-6-6"/></svg>;
export const SaveIcon = (p: Props) => <svg {...common} {...p}><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4"/><path d="M8 20v-6h8v6"/></svg>;
export const PlayIcon = (p: Props) => <svg {...common} {...p}><path d="m8 5 11 7-11 7z"/></svg>;
export const FolderOpenIcon = (p: Props) => <svg {...common} {...p}><path d="M3 7h6l2 2h9l-2 10H4z"/><path d="M3 7V5h6l2 2h6v2"/></svg>;
export const PlusFileIcon = (p: Props) => <svg {...common} {...p}><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 14h6M12 11v6"/></svg>;
export const PlusFolderIcon = (p: Props) => <svg {...common} {...p}><path d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 14h6M12 11v6"/></svg>;
export const RenameIcon = (p: Props) => <svg {...common} {...p}><path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>;
export const TrashIcon = (p: Props) => <svg {...common} {...p}><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="m7 7 1 13h8l1-13"/></svg>;
export const RefreshIcon = (p: Props) => <svg {...common} {...p}><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9M5.5 15A7 7 0 0 0 18 17.5l2-2.5"/></svg>;
export const CloseIcon = (p: Props) => <svg {...common} {...p}><path d="m7 7 10 10M17 7 7 17"/></svg>;
export const TerminalIcon = (p: Props) => <svg {...common} {...p}><path d="m5 7 5 5-5 5"/><path d="M12 17h7"/></svg>;
export const CodeIcon = (p: Props) => <svg {...common} {...p}><path d="m9 18-6-6 6-6M15 6l6 6-6 6"/></svg>;
export const SearchIcon = (p: Props) => <svg {...common} {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
export const BranchIcon = (p: Props) => <svg {...common} {...p}><circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M8 9c6 0 6-1 8-2"/></svg>;
