import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UploadResultsTable } from "./UploadResultsTable";

describe("UploadResultsTable", () => {
  it("renders one column per distinct field across the upload's records", () => {
    render(
      <UploadResultsTable
        records={[
          {
            id: "1",
            fields: { full_name: "Jane Doe", email: "jane@example.com" },
            has_issues: false,
            issues: null,
          } as any
        ]}
      />,
    );
    expect(screen.getByText("full_name")).toBeInTheDocument();
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
