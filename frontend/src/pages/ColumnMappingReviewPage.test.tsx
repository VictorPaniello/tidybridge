import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as client from "../api/client";
import { ApiError } from "../api/client";
import { ColumnMappingReviewPage } from "./ColumnMappingReviewPage";

describe("ColumnMappingReviewPage", () => {
  it("loads the current resolution and saves edits", async () => {
    vi.spyOn(client, "getColumnMapping").mockResolvedValue({
      field_resolutions: [{ raw_column: "Full Name", target_field: "full_name", type: "string" }],
      dedup_key_fields: [],
    });
    const save = vi.spyOn(client, "saveColumnMapping").mockResolvedValue({
      field_resolutions: [{ raw_column: "Full Name", target_field: "name", type: "string" }],
      dedup_key_fields: [],
    });

    render(<ColumnMappingReviewPage fingerprint="abc123" />);
    await screen.findByDisplayValue("full_name");

    fireEvent.change(screen.getByDisplayValue("full_name"), { target: { value: "name" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        "abc123",
        expect.objectContaining({
          field_resolutions: [{ raw_column: "Full Name", target_field: "name", type: "string" }],
        }),
      ),
    );
  });

  it("falls back to the upload's own resolution when nothing's saved yet (404)", async () => {
    // The exact case mapping_is_default=true covers: GET
    // /column-mappings/{fingerprint} genuinely 404s until an engineer
    // explicitly saves something for this shape (see main.py's
    // get_column_mapping docstring) - this must not just render empty.
    vi.spyOn(client, "getColumnMapping").mockRejectedValue(
      new ApiError(404, "No saved mapping for this shape yet"),
    );

    render(
      <ColumnMappingReviewPage
        fingerprint="abc123"
        initialResolution={{
          field_resolutions: [
            { raw_column: "Customer", target_field: "full_name", type: "string" },
          ],
          dedup_key_fields: ["email"],
        }}
      />,
    );

    await screen.findByDisplayValue("full_name");
    expect(screen.getByText("Customer")).toBeInTheDocument();
  });
});
