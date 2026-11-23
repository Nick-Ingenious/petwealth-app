/**
 * Carrier-neutral shipping interface. Services depend only on this, so FedEx
 * can be swapped, mocked in tests, or joined by another carrier later.
 */

export interface Address {
  name: string;
  company?: string | null;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
}

export interface ReturnShipmentRequest {
  /** Our RMA number, printed on the label / shown under the QR code. */
  rmaNumber: string;
  /** The customer (pickup / drop-off origin). */
  from: Address;
  /** The lab. */
  to: Address;
  /** The customer's account email — FedEx Returns ties the RMA to it. */
  customerEmail: string;
  kitCount: number;
  weightLbs: number;
}

export type LabelFormat = "qr_png" | "pdf";

export interface CreatedShipment {
  trackingNumber: string;
  label: { format: LabelFormat; mimeType: string; contentBase64: string };
  /** The carrier's own id for the return (FedEx Returns rmaId), for support lookups. */
  carrierReference?: string;
}

export type TrackStatus = "label_created" | "in_transit" | "out_for_delivery" | "delivered" | "exception" | "unknown";

export interface TrackingUpdate {
  trackingNumber: string;
  status: TrackStatus;
  description: string | null;
  occurredAt: Date | null;
  pickedUpAt: Date | null;
  deliveredAt: Date | null;
}

export interface Carrier {
  readonly name: "fedex" | "test";
  createReturnShipment(req: ReturnShipmentRequest): Promise<CreatedShipment>;
  track(trackingNumbers: string[]): Promise<TrackingUpdate[]>;
}

/** `retryable` = worth trying again later (timeouts, 5xx, rate limits). */
export class CarrierError extends Error {
  override name = "CarrierError";
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
