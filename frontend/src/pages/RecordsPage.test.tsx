import {
  act,
  fireEvent,
  render,
  screen,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import * as auth from "../auth/AuthContext";
import { RecordsPage } from "./RecordsPage";

describe("RecordsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(api, "listRecords").mockResolvedValue([]);
    vi.spyOn(api, "listIngestionRuns").mockResolvedValue([]);
    vi.spyOn(auth, "useAuth").mockReturnValue({
      user: {
        id: "u1",
        email: "user@example.com",
        is_active: true,
        is_superuser: false,
        is_verified: true,
        first_name: "Jane",
        last_name: "Doe",
        phone: null,
      },
      loading: false,
      needsProfile: false,
      loginWithPassword: vi.fn(),
      loginWithToken: vi.fn(),
      register: vi.fn(),
      updateProfile: vi.fn(),
      deleteAccount: vi.fn(),
      logout: vi.fn(),
    });
  });

  it("restores lastResult from sessionStorage so the review affordance stays visible", async () => {
    sessionStorage.setItem(
      "tidybridge_last_ingest_result",
      JSON.stringify({
        ingestion_run_id: "run-1",
        rows_total: 5,
        rows_clean: 5,
        rows_flagged: 0,
        rows_dropped_duplicates: 0,
        rows_skipped_existing: 0,
        mapping_is_default: true,
        fingerprint: "fp123",
        field_resolutions: [],
        dedup_key_fields: [],
        records: [
          {
            id: "rec-1",
            source_file: "test.csv",
            has_issues: false,
            issues: [],
            approved_at: null,
            created_at: new Date().toISOString(),
            fields: { full_name: "Jane Doe" },
          },
        ],
      }),
    );

    render(
      <MemoryRouter>
        <RecordsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/rows processed/i)).toBeInTheDocument();
    expect(screen.getByText("Review mapping")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Dismiss"));

    expect(screen.queryByText(/rows processed/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem("tidybridge_last_ingest_result")).toBeNull();
  });

  it("clicking the upload counts or the stat cards filters the table to match", async () => {
    sessionStorage.setItem(
      "tidybridge_last_ingest_result",
      JSON.stringify({
        ingestion_run_id: "run-1",
        rows_total: 2,
        rows_clean: 1,
        rows_flagged: 1,
        rows_dropped_duplicates: 0,
        rows_skipped_existing: 0,
        mapping_is_default: false,
        fingerprint: "fp123",
        field_resolutions: [],
        dedup_key_fields: [],
        records: [],
      }),
    );
    const base = {
      ingestion_run_id: "run-1",
      source_file: "test.csv",
      approved_at: null,
      created_at: new Date().toISOString(),
    };
    vi.spyOn(api, "listRecords").mockResolvedValue([
      { ...base, id: "clean", has_issues: false, issues: [], fields: { full_name: "Clean Row" } },
      {
        ...base,
        id: "flagged",
        has_issues: true,
        issues: [{ field: "email", issue: "invalid email format" }],
        fields: { full_name: "Flagged Row" },
      },
    ]);

    render(
      <MemoryRouter>
        <RecordsPage />
      </MemoryRouter>,
    );
    await screen.findByText("Clean Row");

    fireEvent.click(screen.getByRole("button", { name: "1 flagged" }));
    expect(screen.queryByText("Clean Row")).not.toBeInTheDocument();
    expect(screen.getByText("Flagged Row")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1 clean" }));
    expect(screen.getByText("Clean Row")).toBeInTheDocument();
    expect(screen.queryByText("Flagged Row")).not.toBeInTheDocument();
    // The stat cards filter too, and the active one is marked.
    const allCard = screen.getByRole("button", { name: /Total records/ });
    fireEvent.click(allCard);
    expect(allCard).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Clean Row")).toBeInTheDocument();
    expect(screen.getByText("Flagged Row")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Needs review\s*1/ }));
    expect(screen.queryByText("Clean Row")).not.toBeInTheDocument();
  });

  it("hides the upload preview table once the mapping is no longer default", async () => {
    // The full records table is already right below this banner - once
    // a mapping's been reviewed there's nothing left for this preview
    // to add, just a second copy of the same rows.
    sessionStorage.setItem(
      "tidybridge_last_ingest_result",
      JSON.stringify({
        ingestion_run_id: "run-1",
        rows_total: 1,
        rows_clean: 1,
        rows_flagged: 0,
        rows_dropped_duplicates: 0,
        rows_skipped_existing: 0,
        mapping_is_default: false,
        fingerprint: "fp123",
        field_resolutions: [],
        dedup_key_fields: [],
        records: [
          {
            id: "rec-1",
            source_file: "test.csv",
            has_issues: false,
            issues: [],
            approved_at: null,
            created_at: new Date().toISOString(),
            fields: { full_name: "Jane Doe" },
          },
        ],
      }),
    );

    render(
      <MemoryRouter>
        <RecordsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/rows processed/i)).toBeInTheDocument();
    expect(screen.queryByText("Review mapping")).not.toBeInTheDocument();
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
  });

  it("renders dynamic column headers based on fields present in records", async () => {
    vi.spyOn(api, "listRecords").mockResolvedValue([
      {
        id: "rec-1",
        ingestion_run_id: "run-1",
        source_file: "test.csv",
        has_issues: false,
        issues: [],
        approved_at: null,
        created_at: new Date().toISOString(),
        fields: {
          customer_name: "Acme Corp",
          deal_size: "5000",
          custom_field: "Special",
        },
      },
    ]);

    render(
      <MemoryRouter>
        <RecordsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Acme Corp");
    expect(screen.getByRole("button", { name: /customer name/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deal size/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /custom field/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /status/i })).toBeInTheDocument();
    expect(screen.getByText("5000")).toBeInTheDocument();
    expect(screen.getByText("Special")).toBeInTheDocument();
  });

  it("the mapping-saved banner disappears on its own after a few seconds", () => {
    // Fake timers from before the initial render - the dismiss timer is
    // scheduled during that render's effects, so it has to be fake from
    // the start, not swapped in afterwards (a setTimeout already
    // scheduled under real timers doesn't retroactively become fake).
    vi.useFakeTimers();
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { mappingSaveSummary: ["renamed a field"] } }]}
      >
        <RecordsPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Mapping saved.")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.queryByText("Mapping saved.")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("selects records via checkboxes and bulk-deletes them", async () => {
    vi.spyOn(api, "listRecords").mockResolvedValue([
      {
        id: "rec-1",
        ingestion_run_id: "run-1",
        source_file: "test.csv",
        has_issues: false,
        issues: [],
        approved_at: null,
        created_at: new Date().toISOString(),
        fields: { full_name: "Jane Doe" },
      },
      {
        id: "rec-2",
        ingestion_run_id: "run-1",
        source_file: "test.csv",
        has_issues: false,
        issues: [],
        approved_at: null,
        created_at: new Date().toISOString(),
        fields: { full_name: "John Smith" },
      },
    ]);
    const bulkDelete = vi
      .spyOn(api, "bulkDeleteRecords")
      .mockResolvedValue({ deleted_count: 1 });

    render(
      <MemoryRouter>
        <RecordsPage />
      </MemoryRouter>,
    );
    await screen.findByText("Jane Doe");

    fireEvent.click(screen.getByLabelText("Select record rec-1"));
    expect(screen.getByText("Delete (1)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete (1)"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));

    await screen.findByText("John Smith"); // still there
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
    expect(bulkDelete).toHaveBeenCalledWith(["rec-1"]);
  });

  it("shows Review only on flagged, unapproved rows, and Approved once approved", async () => {
    const base = {
      ingestion_run_id: "run-1",
      source_file: "test.csv",
      created_at: new Date().toISOString(),
    };
    vi.spyOn(api, "listRecords").mockResolvedValue([
      { ...base, id: "clean", has_issues: false, issues: [], approved_at: null, fields: { full_name: "Clean Row" } },
      {
        ...base,
        id: "flagged",
        has_issues: true,
        issues: [{ field: "email", issue: "invalid email format" }],
        approved_at: null,
        fields: { full_name: "Flagged Row" },
      },
      {
        ...base,
        id: "approved",
        has_issues: true,
        issues: [{ field: "email", issue: "invalid email format" }],
        approved_at: new Date().toISOString(),
        fields: { full_name: "Approved Row" },
      },
    ]);

    render(
      <MemoryRouter>
        <RecordsPage />
      </MemoryRouter>,
    );
    await screen.findByText("Clean Row");

    const review = screen.getAllByRole("link", { name: "Review" });
    expect(review).toHaveLength(1);
    expect(review[0]).toHaveAttribute("href", "/records/flagged");
    const approvedRow = screen.getByText("Approved Row").closest("tr")!;
    expect(within(approvedRow).getByText("Approved")).toBeInTheDocument();
  });

  it("splits flagged records into Needs review and Approved cards", async () => {
    const base = {
      ingestion_run_id: "run-1",
      source_file: "test.csv",
      created_at: new Date().toISOString(),
    };
    const issues = [{ field: "email", issue: "invalid email format" }];
    vi.spyOn(api, "listRecords").mockResolvedValue([
      { ...base, id: "c", has_issues: false, issues: [], approved_at: null, fields: { full_name: "Clean Row" } },
      { ...base, id: "n", has_issues: true, issues, approved_at: null, fields: { full_name: "Todo Row" } },
      { ...base, id: "a", has_issues: true, issues, approved_at: base.created_at, fields: { full_name: "Done Row" } },
    ]);

    render(
      <MemoryRouter>
        <RecordsPage />
      </MemoryRouter>,
    );
    await screen.findByText("Clean Row");

    const cases: [RegExp, string][] = [
      [/^Clean\s*1$/, "Clean Row"],
      [/^Needs review\s*1 \(33%\)$/, "Todo Row"],
      [/^Approved\s*1$/, "Done Row"],
    ];
    for (const [card, only] of cases) {
      fireEvent.click(screen.getByRole("button", { name: card }));
      for (const name of ["Clean Row", "Todo Row", "Done Row"]) {
        if (name === only) expect(screen.getByText(name)).toBeInTheDocument();
        else expect(screen.queryByText(name)).not.toBeInTheDocument();
      }
    }
  });

  it("the upload picker drives ?ingestion_run_id= and the records fetch", async () => {
    vi.spyOn(api, "listIngestionRuns").mockResolvedValue([
      {
        id: "run-old",
        source_file: "old.csv",
        rows_total: 1,
        rows_clean: 1,
        rows_flagged: 0,
        rows_dropped_duplicates: 0,
        rows_skipped_existing: 0,
        created_at: "2026-10-01T10:00:00Z",
      },
      {
        id: "run-new",
        source_file: "new.csv",
        rows_total: 5,
        rows_clean: 2,
        rows_flagged: 3,
        rows_dropped_duplicates: 0,
        rows_skipped_existing: 0,
        created_at: "2026-10-03T18:40:00Z",
      },
    ]);
    const listRecords = vi.spyOn(api, "listRecords").mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/?ingestion_run_id=run-old"]}>
        <RecordsPage />
      </MemoryRouter>,
    );

    const picker = (await screen.findByLabelText("Filter by upload")) as HTMLSelectElement;
    expect(picker.value).toBe("run-old"); // preselected from the URL
    // Newest first, after "All uploads".
    expect([...picker.options].map((o) => o.value)).toEqual(["", "run-new", "run-old"]);
    expect(listRecords).toHaveBeenLastCalledWith(undefined, "run-old");

    fireEvent.change(picker, { target: { value: "run-new" } });
    await vi.waitFor(() => expect(listRecords).toHaveBeenLastCalledWith(undefined, "run-new"));

    fireEvent.change(picker, { target: { value: "" } });
    await vi.waitFor(() => expect(listRecords).toHaveBeenLastCalledWith(undefined, undefined));
  });

  it("select-all toggles every currently visible record", async () => {
    vi.spyOn(api, "listRecords").mockResolvedValue([
      {
        id: "rec-1",
        ingestion_run_id: "run-1",
        source_file: "test.csv",
        has_issues: false,
        issues: [],
        approved_at: null,
        created_at: new Date().toISOString(),
        fields: { full_name: "Jane Doe" },
      },
      {
        id: "rec-2",
        ingestion_run_id: "run-1",
        source_file: "test.csv",
        has_issues: false,
        issues: [],
        approved_at: null,
        created_at: new Date().toISOString(),
        fields: { full_name: "John Smith" },
      },
    ]);

    render(
      <MemoryRouter>
        <RecordsPage />
      </MemoryRouter>,
    );
    await screen.findByText("Jane Doe");

    fireEvent.click(screen.getByLabelText("Select all"));
    expect(screen.getByText("Delete (2)")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Select all"));
    // The bulk-delete button exit-animates rather than unmounting
    // instantly - wait for that transition instead of asserting absence
    // synchronously.
    await waitForElementToBeRemoved(() => screen.queryByText("Delete (2)"));
  });
});
