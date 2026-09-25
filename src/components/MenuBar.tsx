import { useEffect, useMemo, useRef, useState } from "react";

export type MenuAction =
  | "file.open"
  | "file.save"
  | "file.saveAll"
  | "file.close"
  | "file.exit"
  | "edit.undo"
  | "edit.redo"
  | "edit.cut"
  | "edit.copy"
  | "edit.paste"
  | "edit.find"
  | "selection.all"
  | "selection.line"
  | "selection.cursorAbove"
  | "selection.cursorBelow"
  | "view.explorer"
  | "view.search"
  | "view.source"
  | "view.panel"
  | "view.minimap"
  | "go.line"
  | "go.nextEditor"
  | "go.previousEditor"
  | "run.current"
  | "run.trace"
  | "run.stopTrace"
  | "run.output"
  | "terminal.toggle"
  | "terminal.clear"
  | "terminal.focus"
  | "help.shortcuts"
  | "help.about";

type Props = {
  onAction: (action: MenuAction) => void;
  hasProject: boolean;
  hasActiveFile: boolean;
  hasOpenFiles: boolean;
  traceRunning: boolean;
};

type MenuItem = {
  label: string;
  action?: MenuAction;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
};

type MenuDefinition = {
  name: string;
  items: MenuItem[];
};

export default function MenuBar({ onAction, hasProject, hasActiveFile, hasOpenFiles, traceRunning }: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);

  const menus = useMemo<MenuDefinition[]>(() => [
    {
      name: "File",
      items: [
        { label: "Open Folder...", action: "file.open", shortcut: "Ctrl+O" },
        { label: "Save", action: "file.save", shortcut: "Ctrl+S", disabled: !hasActiveFile },
        { label: "Save All", action: "file.saveAll", shortcut: "Ctrl+Shift+S", disabled: !hasOpenFiles },
        { separator: true, label: "" },
        { label: "Close Editor", action: "file.close", shortcut: "Ctrl+W", disabled: !hasActiveFile },
        { separator: true, label: "" },
        { label: "Exit", action: "file.exit" }
      ]
    },
    {
      name: "Edit",
      items: [
        { label: "Undo", action: "edit.undo", shortcut: "Ctrl+Z", disabled: !hasActiveFile },
        { label: "Redo", action: "edit.redo", shortcut: "Ctrl+Y", disabled: !hasActiveFile },
        { separator: true, label: "" },
        { label: "Cut", action: "edit.cut", shortcut: "Ctrl+X", disabled: !hasActiveFile },
        { label: "Copy", action: "edit.copy", shortcut: "Ctrl+C", disabled: !hasActiveFile },
        { label: "Paste", action: "edit.paste", shortcut: "Ctrl+V", disabled: !hasActiveFile },
        { separator: true, label: "" },
        { label: "Find", action: "edit.find", shortcut: "Ctrl+F", disabled: !hasActiveFile }
      ]
    },
    {
      name: "Selection",
      items: [
        { label: "Select All", action: "selection.all", shortcut: "Ctrl+A", disabled: !hasActiveFile },
        { label: "Select Line", action: "selection.line", disabled: !hasActiveFile },
        { separator: true, label: "" },
        { label: "Add Cursor Above", action: "selection.cursorAbove", shortcut: "Ctrl+Alt+Ã¢â€ â€˜", disabled: !hasActiveFile },
        { label: "Add Cursor Below", action: "selection.cursorBelow", shortcut: "Ctrl+Alt+Ã¢â€ â€œ", disabled: !hasActiveFile }
      ]
    },
    {
      name: "View",
      items: [
        { label: "Explorer", action: "view.explorer", shortcut: "Ctrl+Shift+E" },
        { label: "Search", action: "view.search", shortcut: "Ctrl+Shift+F" },
        { label: "Source Control", action: "view.source", shortcut: "Ctrl+Shift+G" },
        { separator: true, label: "" },
        { label: "Toggle Panel", action: "view.panel", shortcut: "Ctrl+`", disabled: !hasProject },
        { label: "Toggle Minimap", action: "view.minimap", disabled: !hasActiveFile }
      ]
    },
    {
      name: "Go",
      items: [
        { label: "Go to Line...", action: "go.line", shortcut: "Ctrl+G", disabled: !hasActiveFile },
        { separator: true, label: "" },
        { label: "Next Editor", action: "go.nextEditor", shortcut: "Ctrl+PageDown", disabled: !hasOpenFiles },
        { label: "Previous Editor", action: "go.previousEditor", shortcut: "Ctrl+PageUp", disabled: !hasOpenFiles }
      ]
    },
    {
      name: "Run",
      items: [
        { label: "Run Current File", action: "run.current", shortcut: "F5", disabled: !hasActiveFile || !hasProject },
        { label: "Trace Current File", action: "run.trace", disabled: !hasActiveFile || !hasProject || traceRunning },
        { label: "Stop Trace", action: "run.stopTrace", disabled: !traceRunning },
        { label: "Show Output", action: "run.output", disabled: !hasProject }
      ]
    },
    {
      name: "Terminal",
      items: [
        { label: "Toggle Terminal", action: "terminal.toggle", shortcut: "Ctrl+`", disabled: !hasProject },
        { label: "Focus Terminal", action: "terminal.focus", disabled: !hasProject },
        { label: "Clear Terminal", action: "terminal.clear", disabled: !hasProject }
      ]
    },
    {
      name: "Help",
      items: [
        { label: "Keyboard Shortcuts", action: "help.shortcuts" },
        { separator: true, label: "" },
        { label: "About XENRA", action: "help.about" }
      ]
    }
  ], [hasActiveFile, hasOpenFiles, hasProject, traceRunning]);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", escape);
    };
  }, []);

  const execute = (item: MenuItem) => {
    if (!item.action || item.disabled) return;
    setOpenMenu(null);
    onAction(item.action);
  };

  return (
    <nav className="menu-strip" aria-label="Application menu" ref={rootRef}>
      {menus.map((menu) => (
        <div className="menu-root" key={menu.name}>
          <button
            className={openMenu === menu.name ? "menu-trigger open" : "menu-trigger"}
            type="button"
            aria-haspopup="menu"
            aria-expanded={openMenu === menu.name}
            onClick={() => setOpenMenu((current) => current === menu.name ? null : menu.name)}
          >
            {menu.name}
          </button>

          {openMenu === menu.name && (
            <div className="menu-popup" role="menu">
              {menu.items.map((item, index) => item.separator ? (
                <div className="menu-separator" key={`separator-${index}`} />
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  key={`${menu.name}-${item.label}`}
                  disabled={item.disabled}
                  onClick={() => execute(item)}
                >
                  <span>{item.label}</span>
                  {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
