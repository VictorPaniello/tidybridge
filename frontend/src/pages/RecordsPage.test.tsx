import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import * as auth from "../auth/AuthContext";
import { RecordsPage } from "./RecordsPage";

describe("RecordsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(api, "listRecords").mockResolvedValue([]);
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

  it("renders dynamic column headers based on fields present in records", async () => {
    vi.spyOn(api, "listRecords").mockResolvedValue([
      {
        id: "rec-1",
        ingestion_run_id: "run-1",
        source_file: "test.csv",
        has_issues: false,
        issues: [],
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
    expect(screen.getByRole("button", { name: /customer_name/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deal_size/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /custom_field/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /status/i })).toBeInTheDocument();
    expect(screen.getByText("5000")).toBeInTheDocument();
    expect(screen.getByText("Special")).toBeInTheDocument();
  });
});
