import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { IngestionRun } from "../api/types";
import { UploadPicker } from "./UploadPicker";

function run(id: string, overrides: Partial<IngestionRun> = {}): IngestionRun {
  return {
    id,
    source_file: `${id}.csv`,
    rows_total: 2,
    rows_clean: 1,
    rows_flagged: 1,
    rows_dropped_duplicates: 0,
    rows_skipped_existing: 0,
    created_at: "2026-10-03T18:00:00Z",
    ...overrides,
  };
}

function renderPicker(runs: IngestionRun[], value: string | null = null) {
  const onChange = vi.fn();
  render(
    <MemoryRouter>
      <UploadPicker runs={runs} value={value} onChange={onChange} disabled={false} />
    </MemoryRouter>,
  );
  return { onChange, trigger: screen.getByRole("button", { name: "Filter by upload" }) };
}

describe("UploadPicker", () => {
  it("lists only the 10 most recent uploads that created records", () => {
    const runs = [
      run("skipped", { rows_clean: 0, rows_flagged: 0, rows_skipped_existing: 2 }),
      ...Array.from({ length: 12 }, (_, i) => run(`r${i}`)),
    ];
    const { trigger } = renderPicker(runs);

    fireEvent.click(trigger);
    const names = screen.getAllByRole("option").map((o) => o.textContent);

    expect(names).toHaveLength(11); // "All uploads" + 10
    expect(names.some((n) => n?.includes("skipped.csv"))).toBe(false);
    expect(names[1]).toContain("r0.csv");
    expect(names[10]).toContain("r9.csv");
    expect(screen.getByRole("link", { name: /Upload history/ })).toHaveAttribute("href", "/uploads");
  });

  it("shows an older selected upload's name even when it's not in the menu", () => {
    const runs = [...Array.from({ length: 10 }, (_, i) => run(`r${i}`)), run("ancient")];
    const { trigger } = renderPicker(runs, "ancient");
    expect(trigger).toHaveTextContent("ancient.csv");
  });

  it("works from the keyboard and closes on Escape", async () => {
    const { trigger, onChange } = renderPicker([run("a"), run("b")]);

    fireEvent.keyDown(trigger, { key: "ArrowDown" }); // opens on "All uploads"
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("b");

    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Escape" });
    // waitFor: the menu fades out before it unmounts.
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });

  it("closes when clicking outside", async () => {
    const { trigger } = renderPicker([run("a")]);
    fireEvent.click(trigger);
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });
});
