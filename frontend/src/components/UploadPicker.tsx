import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import type { IngestionRun } from "../api/types";

// How many recent uploads the menu lists - the full list is one click away
// in Upload history, so this stays a quick "this batch" switcher.
const MAX_OPTIONS = 10;

function when(run: IngestionRun): string {
  return new Date(run.created_at).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Records-page filter for one upload: a themed listbox instead of a native
// <select> (whose open list the OS draws, unstyled, every upload ever).
// No library: one open menu at a time, so click-outside + arrow keys is
// all it needs. `runs` is every upload, newest first; the menu shows only
// recent ones that actually created records (a re-upload where every row
// was skipped has nothing to show).
export function UploadPicker({
  runs,
  value,
  onChange,
  disabled,
}: {
  runs: IngestionRun[];
  value: string | null;
  onChange: (runId: string | null) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const reduce = useReducedMotion();

  const options: (IngestionRun | null)[] = [
    null, // "All uploads"
    ...runs.filter((r) => r.rows_clean + r.rows_flagged > 0).slice(0, MAX_OPTIONS),
  ];
  // Looked up in every run, not just the options, so an older upload
  // opened from Upload history still shows its name here.
  const selected = runs.find((r) => r.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function openMenu() {
    const current = options.findIndex((o) => (o?.id ?? null) === (selected?.id ?? null));
    setActive(Math.max(current, 0));
    setOpen(true);
  }

  function choose(option: IngestionRun | null) {
    onChange(option?.id ?? null);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative w-full sm:w-72" onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Filter by upload"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        // Focus stays on this button; screen readers follow the highlight.
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-1.5 text-sm text-left transition hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        <span className="truncate">
          {selected ? (
            <>
              <span className="font-medium">{selected.source_file}</span>
              <span className="text-muted-foreground"> · {when(selected)}</span>
            </>
          ) : (
            "All uploads"
          )}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute left-0 z-20 mt-1 w-full sm:w-80 overflow-hidden rounded-lg border border-border bg-card shadow-lg"
          >
            <ul id={listId} role="listbox" aria-label="Uploads" className="max-h-80 overflow-y-auto py-1">
              {options.map((option, i) => {
                const isSelected = (option?.id ?? null) === (selected?.id ?? null);
                return (
                  <li
                    key={option?.id ?? "all"}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(option)}
                    className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${
                      i === active ? "bg-secondary" : ""
                    }`}
                  >
                    <span className="mt-0.5 w-4 shrink-0 text-primary">{isSelected ? "✓" : ""}</span>
                    {option ? (
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{option.source_file}</span>
                        <span className="block text-xs text-muted-foreground">
                          {when(option)} ·{" "}
                          <span className="text-primary">{option.rows_clean} clean</span>
                          {option.rows_flagged > 0 && (
                            <>
                              {" · "}
                              <span className="text-amber-700 dark:text-amber-400">
                                {option.rows_flagged} flagged
                              </span>
                            </>
                          )}
                        </span>
                      </span>
                    ) : (
                      <span className="font-medium">All uploads</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <Link
              to="/uploads"
              className="block border-t border-border px-3 py-2 text-xs text-ring hover:bg-secondary"
            >
              See every upload in Upload history →
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
