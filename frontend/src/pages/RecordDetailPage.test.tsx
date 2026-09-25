import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecordFieldsList } from "./RecordDetailPage";

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
