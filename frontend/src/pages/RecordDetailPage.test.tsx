import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import * as api from "../api/client";
import type { ClientRecord } from "../api/types";
import { RecordDetailPage, RecordFieldsList } from "./RecordDetailPage";

describe("RecordFieldsList", () => {
  it("renders every key in fields, not just a fixed set", () => {
    render(<RecordFieldsList fields={{ full_name: "Jane Doe", age: "30" }} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Age")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
  });

  it("renders an em dash for a null value", () => {
    render(<RecordFieldsList fields={{ phone: null }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

const health = (on: { webhooks?: boolean; provisioning?: boolean } = {}) => ({
  status: "ok",
  extraction: true,
  webhooks: false,
  provisioning: false,
  github: false,
  ...on,
});

function renderDetail() {
  render(
    <MemoryRouter initialEntries={["/records/r1"]}>
      <Routes>
        <Route path="/records/:id" element={<RecordDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

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
    vi.spyOn(api, "getHealth").mockResolvedValue(health({ webhooks: true }));
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

describe("RecordDetailPage integrations", () => {
  const record: ClientRecord = {
    id: "r1",
    ingestion_run_id: "run-1",
    source_file: "factura.pdf",
    fields: { supplier_name: "Proveedor Ejemplo" },
    has_issues: false,
    issues: null,
    approved_at: null,
    created_at: "2026-10-28T10:00:00Z",
  };
  const notConfigured = { status: "not_configured" as const, attempt_number: null, available_at: null };

  function mockRecord(webhooks: Awaited<ReturnType<typeof api.getRecordWebhooks>> = []) {
    vi.spyOn(api, "getRecord").mockResolvedValue(record);
    vi.spyOn(api, "getRecordWebhooks").mockResolvedValue(webhooks);
    vi.spyOn(api, "getRecordProvisioning").mockResolvedValue([]);
    vi.spyOn(api, "getRecordWebhookStatus").mockResolvedValue(notConfigured);
    vi.spyOn(api, "getRecordProvisioningStatus").mockResolvedValue({
      ...notConfigured,
      remote_id: null,
    });
  }

  it("hides webhooks and provisioning where the server has neither", async () => {
    vi.spyOn(api, "getHealth").mockResolvedValue(health());
    mockRecord();
    renderDetail();
    // Invoices are titled by supplier, not "Unnamed record"
    expect(await screen.findByRole("heading", { name: "Proveedor Ejemplo" })).toBeInTheDocument();
    expect(screen.queryByText("Webhook deliveries")).not.toBeInTheDocument();
    expect(screen.queryByText("Provisioning")).not.toBeInTheDocument();
  });

  it("still shows a record's webhook history after the webhook is removed", async () => {
    vi.spyOn(api, "getHealth").mockResolvedValue(health());
    mockRecord([
      {
        id: 1,
        record_id: "r1",
        url: "https://example.com/hook",
        attempt_number: 1,
        attempted_at: "2026-10-28T10:00:00Z",
        status_code: 200,
        success: true,
        error: null,
      },
    ]);
    renderDetail();
    expect(await screen.findByText("Webhook deliveries")).toBeInTheDocument();
    expect(screen.queryByText("Provisioning")).not.toBeInTheDocument();
  });
});
