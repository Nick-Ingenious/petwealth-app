import { describe, expect, it } from "vitest";
import {
  KIT_STATUSES,
  KitTransitionError,
  allowedNextStatuses,
  assertKitTransition,
  canTransitionKit,
  notificationForStatus,
  type KitStatus,
} from "./kit-lifecycle";

describe("kit lifecycle", () => {
  it("defines transitions for every status", () => {
    for (const s of KIT_STATUSES) expect(allowedNextStatuses(s)).toBeDefined();
  });

  it("only transitions to known statuses and never to itself", () => {
    for (const from of KIT_STATUSES) {
      for (const to of allowedNextStatuses(from)) {
        expect(KIT_STATUSES).toContain(to);
        expect(to).not.toBe(from);
      }
    }
  });

  it("walks the happy path end to end", () => {
    const path: KitStatus[] = [
      "ordered",
      "label_created",
      "shipped",
      "delivered",
      "activated",
      "assigned",
      "sample_collected",
      "in_transit",
      "received_at_lab",
      "processing",
      "completed",
    ];
    for (let i = 1; i < path.length; i++) {
      expect(() => assertKitTransition(path[i - 1]!, path[i]!)).not.toThrow();
    }
  });

  it("lets the lab receive a kit from any post-shipment state", () => {
    for (const from of ["shipped", "delivered", "activated", "assigned", "sample_collected", "in_transit"] as const) {
      expect(canTransitionKit(from, "received_at_lab")).toBe(true);
    }
  });

  it("blocks skipping the lab and re-receiving", () => {
    expect(canTransitionKit("ordered", "completed")).toBe(false);
    expect(canTransitionKit("in_transit", "completed")).toBe(false);
    expect(() => assertKitTransition("received_at_lab", "received_at_lab")).toThrow(/already/);
    expect(() => assertKitTransition("completed", "received_at_lab")).toThrow(KitTransitionError);
  });

  it("treats cancelled as terminal", () => {
    expect(allowedNextStatuses("cancelled")).toHaveLength(0);
  });

  it("every status is reachable from ordered", () => {
    const seen = new Set<KitStatus>(["ordered"]);
    const queue: KitStatus[] = ["ordered"];
    while (queue.length) {
      for (const next of allowedNextStatuses(queue.shift()!)) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect([...seen].sort()).toEqual([...KIT_STATUSES].sort());
  });

  it("maps customer notifications", () => {
    expect(notificationForStatus("shipped")).toBe("kit_shipped");
    expect(notificationForStatus("received_at_lab")).toBe("kit_received");
    expect(notificationForStatus("completed")).toBe("results_ready");
    expect(notificationForStatus("processing")).toBeNull();
  });
});
