import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "../api/client";
import { ApiError } from "../api/client";
import { ColumnMappingReviewPage } from "./ColumnMappingReviewPage";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("ColumnMappingReviewPage", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("loads the current resolution and saves edits", async () => {
    vi.spyOn(client, "getColumnMapping").mockResolvedValue({
      field_resolutions: [{ raw_column: "Full Name", target_field: "full_name", type: "string" }],
      dedup_key_fields: [],
    });
    const save = vi.spyOn(client, "saveColumnMapping").mockResolvedValue({
      field_resolutions: [{ raw_column: "Full Name", target_field: "name", type: "string" }],
      dedup_key_fields: [],
    });

    render(
      <MemoryRouter>
        <ColumnMappingReviewPage
          fingerprint="abc123"
          // Only used here as the "before" side of the change summary -
          // GET already succeeded above, so this isn't the 404 fallback.
          initialResolution={{
            field_resolutions: [
              { raw_column: "Full Name", target_field: "full_name", type: "string" },
            ],
            dedup_key_fields: [],
          }}
        />
      </MemoryRouter>,
    );
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

    // Success navigates back to records with a human-readable summary of
    // what changed, not just a local "Saved." message the engineer would
    // have to notice before the page (they thought) went nowhere.
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        "/",
        expect.objectContaining({
          state: {
            mappingSaveSummary: ['"Full Name" now maps to "name" (was "full_name")'],
          },
        }),
      ),
    );
  });

  it("shows an error and does not navigate away when saving fails", async () => {
    vi.spyOn(client, "getColumnMapping").mockResolvedValue({
      field_resolutions: [{ raw_column: "Full Name", target_field: "full_name", type: "string" }],
      dedup_key_fields: [],
    });
    vi.spyOn(client, "saveColumnMapping").mockRejectedValue(
      new ApiError(400, "invalid target_field 'name': must match ^[a-z][a-z0-9_]{0,99}$"),
    );

    render(
      <MemoryRouter>
        <ColumnMappingReviewPage fingerprint="abc123" />
      </MemoryRouter>,
    );
    await screen.findByDisplayValue("full_name");

    fireEvent.click(screen.getByText("Save"));

    await screen.findByText(
      "invalid target_field 'name': must match ^[a-z][a-z0-9_]{0,99}$",
    );
    expect(mockNavigate).not.toHaveBeenCalled();
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
      <MemoryRouter>
        <ColumnMappingReviewPage
          fingerprint="abc123"
          initialResolution={{
            field_resolutions: [
              { raw_column: "Customer", target_field: "full_name", type: "string" },
            ],
            dedup_key_fields: ["email"],
          }}
        />
      </MemoryRouter>,
    );

    await screen.findByDisplayValue("full_name");
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.getByText("← Back to records")).toBeInTheDocument();
  });
});
