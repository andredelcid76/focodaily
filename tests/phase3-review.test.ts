import { describe, expect, it } from "bun:test";
import { analyticsWindow } from "../src/lib/analytics-summary";
import { dateInTimezone, timeInTimezone, zonedDateTime } from "../src/lib/date";

describe("meeting dates use the profile timezone", () => {
  it("09:00 in São Paulo is 12:00 UTC", () => {
    expect(zonedDateTime("2026-11-09", "09:00", "America/Sao_Paulo").toISOString()).toBe("2026-11-09T12:00:00.000Z");
  });
  it("a 22:30 São Paulo meeting keeps its São Paulo date, not the UTC one", () => {
    const start = zonedDateTime("2026-11-09", "22:30", "America/Sao_Paulo");
    expect(start.toISOString()).toBe("2026-11-10T01:30:00.000Z");
    expect(dateInTimezone(start, "America/Sao_Paulo")).toBe("2026-11-09");
    expect(timeInTimezone(start, "America/Sao_Paulo")).toBe("22:30");
  });
});

describe("analytics window per period", () => {
  const today = "2026-11-07";
  it("today reads only today, with 14 days of daily context", () => {
    expect(analyticsWindow("today", today)).toEqual({ start: "2026-11-07", end: "2026-11-07", seriesStart: "2026-10-25" });
  });
  it("yesterday reads only yesterday", () => {
    expect(analyticsWindow("yesterday", today)).toEqual({ start: "2026-11-06", end: "2026-11-06", seriesStart: "2026-10-25" });
  });
  it("30 days starts 29 days ago and stays open-ended", () => {
    expect(analyticsWindow("30d", today)).toEqual({ start: "2026-10-09", end: null, seriesStart: "2026-10-09" });
  });
  it("all has no bounds", () => {
    expect(analyticsWindow("all", today)).toEqual({ start: null, end: null, seriesStart: null });
  });
});
