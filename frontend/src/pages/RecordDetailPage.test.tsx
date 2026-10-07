import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import type { ClientRecord } from "../api/types";
import { RecordDetailPage, RecordFieldsList } from "./RecordDetailPage";

describe("RecordFieldsList", () => {
  it("renders every key in fields, not just a fixed set", () => {
    render(<RecordFieldsList fields={{ full_name: "Jane Doe", age: "30" }} />);
    expect(screen.getByText("full_name")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("age")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("renders an em dash for a null value", () => {
    render(<RecordFieldsList fields={{ phone: null }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("RecordDetailPage approve", () => {
  const flagged: ClientRecord = {
    id: "r1",
    ingestion_run_id: "run-1",
    source_file: "test.csv",
    fields: { email: "not-an-email" },
    has_issues: true,
    issues: [{ field: "email", issue: "invalid email" }],
    approved_at: null,
    created_at: "2026-10-03T10:00:00Z",
  };

  it("approves a flagged record and refreshes the delivery status", async () => {
    vi.spyOn(api, "getRecord").mockResolvedValue(flagged);
    vi.spyOn(api, "getRecordWebhooks").mockResolvedValue([]);
    vi.spyOn(api, "getRecordProvisioning").mockResolvedValue([]);
    const webhookStatus = vi
      .spyOn(api, "getRecordWebhookStatus")
      .mockResolvedValueOnce({ status: "awaiting_review", attempt_number: 1, available_at: null })
      .mockResolvedValue({ status: "pending", attempt_number: 1, available_at: null });
    vi.spyOn(api, "getRecordProvisioningStatus").mockResolvedValue({
      status: "not_configured",
      attempt_number: null,
      available_at: null,
      remote_id: null,
    });
    const approve = vi
      .spyOn(api, "approveRecord")
      .mockResolvedValue({ ...flagged, approved_at: "2026-10-03T11:00:00Z" });

    render(
      <MemoryRouter initialEntries={["/records/r1"]}>
        <Routes>
          <Route path="/records/:id" element={<RecordDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Awaiting review")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByText(/Approved on/)).toBeInTheDocument();
    expect(approve).toHaveBeenCalledWith("r1");
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(await screen.findByText("Delivery pending")).toBeInTheDocument();
    expect(webhookStatus).toHaveBeenCalledTimes(2);
  });
});
