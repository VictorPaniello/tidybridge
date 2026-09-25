import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ClientRecord } from "../api/types";
import { UploadResultsTable } from "./UploadResultsTable";

const record: ClientRecord = {
  id: "1",
  ingestion_run_id: null,
  source_file: "test.csv",
  fields: { full_name: "Jane Doe", email: "jane@example.com" },
  has_issues: false,
  issues: null,
  created_at: "2026-01-01T00:00:00Z",
};

describe("UploadResultsTable", () => {
  it("renders one column per distinct field across the upload's records", () => {
    render(<UploadResultsTable records={[record]} />);
    expect(screen.getByText("Full Name")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows a review affordance when mappingIsDefault is true", () => {
    render(<UploadResultsTable records={[]} mappingIsDefault fingerprint="abc123" />);
    expect(screen.getByText(/review the field names/i)).toBeInTheDocument();
  });

  it("shows no review affordance when mappingIsDefault is false", () => {
    render(<UploadResultsTable records={[]} mappingIsDefault={false} fingerprint="abc123" />);
    expect(screen.queryByText(/review the field names/i)).not.toBeInTheDocument();
  });
});
