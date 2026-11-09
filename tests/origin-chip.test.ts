import { describe, expect, it } from "bun:test";
import { originChipHref, originChipName } from "../src/lib/origin-chip";

describe("origin chip", () => {
  it("links only http(s) origin URLs", () => {
    expect(originChipHref("https://anpla.pipedrive.com/activities/list#dialog/activity/1")).toBe(
      "https://anpla.pipedrive.com/activities/list#dialog/activity/1",
    );
    expect(originChipHref("http://example.com")).toBe("http://example.com");
    expect(originChipHref("pipedrive-cadencia://83/D3")).toBeNull();
    expect(originChipHref(null)).toBeNull();
    expect(originChipHref("")).toBeNull();
  });

  it("labels cadence tasks as 'Pipedrive · cadência'", () => {
    expect(originChipName("pipedrive_cadencia")).toBe("Pipedrive · cadência");
    expect(originChipName("pipedrive")).toBe("Pipedrive");
    expect(originChipName("email")).toBe("Outlook");
    expect(originChipName("meeting")).toBe("Fireflies");
  });
});
