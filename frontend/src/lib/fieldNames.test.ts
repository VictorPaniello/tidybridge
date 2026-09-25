import { describe, expect, it } from "vitest";
import { humanizeFieldName } from "./fieldNames";

describe("humanizeFieldName", () => {
  it("title-cases each underscore-separated word", () => {
    expect(humanizeFieldName("full_name")).toBe("Full Name");
    expect(humanizeFieldName("telephone")).toBe("Telephone");
  });

  it("ignores a leading/trailing/doubled underscore", () => {
    expect(humanizeFieldName("_amount__paid_")).toBe("Amount Paid");
  });
});
