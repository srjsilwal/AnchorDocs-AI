import { Menu, PanelRight } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";

interface ThreadHeaderProps {
  title: string;
  panelOpen: boolean;
  canToggleSources: boolean;
  onToggleSources: () => void;
  onOpenSidebar: () => void;
}

export function ThreadHeader({
  title,
  panelOpen,
  canToggleSources,
  onToggleSources,
  onOpenSidebar,
}: ThreadHeaderProps) {
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between gap-4 border-b border-line bg-paper pl-4 pr-[18px] lg:pl-[31px]">
      <div className="flex min-w-0 items-center gap-1.5">
        <IconButton
          aria-label="Open navigation"
          onClick={onOpenSidebar}
          className="lg:hidden"
        >
          <Menu className="size-[17px]" strokeWidth={1.8} aria-hidden="true" />
        </IconButton>
        <h1 className="m-0 truncate font-ui text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h1>
      </div>
      <IconButton
        aria-label={panelOpen ? "Hide sources" : "Show sources"}
        aria-expanded={panelOpen}
        aria-controls="sources-panel"
        disabled={!canToggleSources}
        onClick={onToggleSources}
      >
        <PanelRight className="size-[17px]" strokeWidth={1.7} aria-hidden="true" />
      </IconButton>
    </header>
  );
}
