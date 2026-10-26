import { describe, expect, it } from "vitest";

import type { EnrollmentProgram } from "../enrollment/types";
import { parseBookingOutcome } from "./types";
import { bookingSubmissionSchema, keepAvailableChoices, NO_GROUP, previewPrograms, type BookingValues } from "./validation";

const group = (id: string, full = false) => ({ id, name: id, full, seatsLeft: null, slots: [] });
const T = "11111111-1111-4111-8111-111111111111";
const G1 = "22222222-2222-4222-8222-222222222222";
const G2 = "33333333-3333-4333-8333-333333333333";
const programs: EnrollmentProgram[] = [
  { levelId: "preparatory-3", levelName: "Prep 3", trackId: null, trackName: null, groups: [group(G1), group(G2, true)] },
  { levelId: "secondary-2", levelName: "Sec 2", trackId: T, trackName: "Science", groups: [] },
];
const base: BookingValues = { fullName: "A", studentPhone: "", parentPhone: "", levelId: "", trackId: "", groupId: "", participationType: "" };

describe("booking choices", () => {
  it("keeps offered choices and clears ones the form no longer offers", () => {
    const form = { programs, groupOptional: false };
    expect(keepAvailableChoices({ ...base, levelId: "preparatory-3", groupId: G1 }, form)).toMatchObject({ levelId: "preparatory-3", groupId: G1 });
    expect(keepAvailableChoices({ ...base, levelId: "preparatory-3", groupId: G2 }, form).groupId).toBe("");
    expect(keepAvailableChoices({ ...base, levelId: "secondary-2", trackId: "other" }, form).trackId).toBe("");
    expect(keepAvailableChoices({ ...base, levelId: "secondary-3", trackId: T }, form)).toMatchObject({ levelId: "", trackId: "", fullName: "A" });
  });

  it("keeps the explicit no-group choice only when the form allows it", () => {
    const values = { ...base, levelId: "preparatory-3", groupId: NO_GROUP };
    expect(keepAvailableChoices(values, { programs, groupOptional: true }).groupId).toBe(NO_GROUP);
    expect(keepAvailableChoices(values, { programs, groupOptional: false }).groupId).toBe("");
  });
});

describe("booking submission", () => {
  const valid = {
    yearId: G1, revision: 2, retryKey: G2, fullName: " Mona ", studentPhone: "0101 234 5678", parentPhone: "+201012345679",
    levelId: "preparatory-3", trackId: null, groupId: "", participationType: "",
  };

  it("normalizes names, phones and empty choices", () => {
    expect(bookingSubmissionSchema.parse(valid)).toMatchObject({
      fullName: "Mona", studentPhone: "+201012345678", groupId: null, participationType: null,
    });
  });

  it("refuses client-supplied identities and invalid phones", () => {
    expect(bookingSubmissionSchema.safeParse({ ...valid, academyId: G1 }).success).toBe(false);
    expect(bookingSubmissionSchema.safeParse({ ...valid, profileId: G1 }).success).toBe(false);
    expect(bookingSubmissionSchema.safeParse({ ...valid, studentPhone: "123" }).success).toBe(false);
  });

  it("maps database outcomes without exposing anything else", () => {
    expect(parseBookingOutcome({ result: "validation", field: "parent_phone" })).toEqual({
      result: "validation", fieldErrors: { parentPhone: expect.any(String) },
    });
    expect(parseBookingOutcome({ result: "group_full", academy: {} })).toEqual({ result: "group_full" });
    expect(parseBookingOutcome({ result: "registered" })).toEqual({ result: "error" });
    expect(parseBookingOutcome({ result: "unknown" })).toEqual({ result: "error" });
  });
});

describe("booking preview", () => {
  const catalog = [
    { id: "sec-1", name: "Sec 1", tracks: [], groups: [{ id: G1, name: "A", trackId: null, capacity: 20, seatsLeft: 0, slots: [] }] },
    { id: "sec-2", name: "Sec 2", tracks: [{ id: T, name: "Science" }], groups: [{ id: G2, name: "B", trackId: null, capacity: null, seatsLeft: null, slots: [{ weekday: 3, startsAt: "17:00", location: null }] }] },
  ];
  const settings = { allowWithoutGroup: false, excludedLevelIds: [], excludedTrackIds: [], excludedGroupIds: [] };

  it("offers every level and track not excluded, level-wide groups under every track", () => {
    expect(previewPrograms(catalog, settings)).toEqual([
      { levelId: "sec-1", levelName: "Sec 1", trackId: null, trackName: null, groups: [{ ...group(G1, true), name: "A", seatsLeft: 0 }] },
      { levelId: "sec-2", levelName: "Sec 2", trackId: T, trackName: "Science", groups: [{ ...group(G2), name: "B", slots: [{ weekday: 3, startsAt: "17:00", location: null }] }] },
    ]);
  });

  it("omits programs without groups unless registration without a group is allowed", () => {
    expect(previewPrograms(catalog, { ...settings, excludedGroupIds: [G1, G2] })).toEqual([]);
    expect(previewPrograms(catalog, { ...settings, excludedLevelIds: ["sec-1"], excludedTrackIds: [T] })).toEqual([]);
    expect(previewPrograms(catalog, { ...settings, excludedGroupIds: [G1, G2], allowWithoutGroup: true })).toHaveLength(2);
  });
});
