import { randomInt } from "node:crypto";
import QRCode from "qrcode";
import type { Carrier, CreatedShipment, ReturnShipmentRequest, TrackingUpdate } from "./types";

const MINUTE = 60_000;

/**
 * Development/test carrier — NEVER used in production (see getCarrier).
 *
 * Produces a real, scannable QR code and simulates tracking from the label's
 * age, which is encoded in the tracking number, so it is stateless:
 *   < 10 min  label_created
 *   < 30 min  in_transit (picked up at +10 min)
 *   ≥ 30 min  delivered  (at +30 min)
 */
export class TestCarrier implements Carrier {
  readonly name = "test" as const;

  constructor(private readonly now: () => number = Date.now) {}

  async createReturnShipment(req: ReturnShipmentRequest): Promise<CreatedShipment> {
    const trackingNumber = `TEST${Math.floor(this.now() / 1000)}${String(randomInt(1000)).padStart(3, "0")}`;
    const png = await QRCode.toBuffer(`PETWEALTH-TEST-RETURN|${req.rmaNumber}|${trackingNumber}`, { width: 512, margin: 2 });
    return { trackingNumber, label: { format: "qr_png", mimeType: "image/png", contentBase64: png.toString("base64") } };
  }

  async track(trackingNumbers: string[]): Promise<TrackingUpdate[]> {
    return trackingNumbers.map((trackingNumber) => {
      const created = Number(/^TEST(\d{10})/.exec(trackingNumber)?.[1]) * 1000;
      if (!created) {
        return { trackingNumber, status: "unknown", description: "Not a test tracking number", occurredAt: null, pickedUpAt: null, deliveredAt: null };
      }
      const age = this.now() - created;
      const pickedUpAt = age >= 10 * MINUTE ? new Date(created + 10 * MINUTE) : null;
      const deliveredAt = age >= 30 * MINUTE ? new Date(created + 30 * MINUTE) : null;
      const status = deliveredAt ? "delivered" : pickedUpAt ? "in_transit" : "label_created";
      return {
        trackingNumber,
        status,
        description: { delivered: "Delivered to lab", in_transit: "Picked up by FedEx", label_created: "Label created" }[status],
        occurredAt: deliveredAt ?? pickedUpAt ?? new Date(created),
        pickedUpAt,
        deliveredAt,
      };
    });
  }
}
