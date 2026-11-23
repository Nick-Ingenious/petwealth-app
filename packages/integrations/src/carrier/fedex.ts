/**
 * FedEx REST API adapter (developer.fedex.com): OAuth, Ship (return labels), Track.
 *
 * Verified against the FedEx sandbox (OAuth, return label PDF, Track) on
 * 2026-11-23. The sandbox test account is not enabled for FedEx Ground, so
 * previews use FEDEX_RETURN_SERVICE_TYPE=FEDEX_2_DAY.
 *
 * Return codes: the customer app shows a QR code that FedEx counters scan to
 * print the label. QR ("label-less") returns require FedEx Returns Technology
 * to be enabled on the account; until it is, `returnLabelMode: "label"` creates
 * a standard printable return label (PDF).
 */
import { CarrierError, type Address, type Carrier, type CreatedShipment, type ReturnShipmentRequest, type TrackStatus, type TrackingUpdate } from "./types";

export interface FedExConfig {
  apiKey: string;
  secretKey: string;
  accountNumber: string;
  environment: "sandbox" | "production";
  /** FedEx service for sample returns, e.g. FEDEX_GROUND, FEDEX_2_DAY, PRIORITY_OVERNIGHT. */
  returnServiceType: string;
  returnLabelMode: "label" | "qr";
  fetch?: typeof fetch;
}

const BASE_URL = { sandbox: "https://apis-sandbox.fedex.com", production: "https://apis.fedex.com" } as const;
const TIMEOUT_MS = 15_000;
const TRACK_BATCH = 30; // FedEx Track API limit per request

/** FedEx latestStatusDetail.code → our status. */
const STATUS_BY_CODE: Record<string, TrackStatus> = {
  OC: "label_created", // shipment information sent to FedEx
  IN: "label_created",
  PU: "in_transit", // picked up
  IT: "in_transit",
  AR: "in_transit",
  AF: "in_transit",
  DP: "in_transit",
  OW: "in_transit",
  PX: "in_transit",
  OD: "out_for_delivery",
  DL: "delivered",
  DE: "exception", // delivery exception
  SE: "exception", // shipment exception
  CA: "exception", // cancelled
  RS: "exception", // return to shipper
};

function toFedExParty(a: Address) {
  return {
    contact: { personName: a.name.slice(0, 70), phoneNumber: a.phone.replace(/[^\d]/g, "").slice(-10), ...(a.company ? { companyName: a.company } : {}) },
    address: {
      streetLines: [a.line1, a.line2].filter(Boolean),
      city: a.city,
      stateOrProvinceCode: a.region,
      postalCode: a.postalCode,
      countryCode: a.country,
    },
  };
}

export class FedExCarrier implements Carrier {
  readonly name = "fedex" as const;
  private token: { value: string; expiresAt: number } | null = null;
  private readonly http: typeof fetch;

  constructor(private readonly cfg: FedExConfig) {
    this.http = cfg.fetch ?? fetch;
  }

  private async request<T>(path: string, body: unknown, form = false): Promise<T> {
    const headers: Record<string, string> = form
      ? { "content-type": "application/x-www-form-urlencoded" }
      : { "content-type": "application/json", authorization: `Bearer ${await this.accessToken()}`, "x-locale": "en_US" };
    let res: Response;
    try {
      res = await this.http(`${BASE_URL[this.cfg.environment]}${path}`, {
        method: "POST",
        headers,
        body: form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new CarrierError(`FedEx unreachable: ${e instanceof Error ? e.message : String(e)}`, true);
    }
    const json = (await res.json().catch(() => ({}))) as T & { errors?: { code: string; message: string }[] };
    if (!res.ok) {
      const msg = json.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") ?? `HTTP ${res.status}`;
      if (res.status === 401 && !form) this.token = null;
      throw new CarrierError(`FedEx ${path} failed — ${msg}`, res.status >= 500 || res.status === 429 || res.status === 401, json.errors);
    }
    return json;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await this.request<{ access_token: string; expires_in: number }>(
      "/oauth/token",
      { grant_type: "client_credentials", client_id: this.cfg.apiKey, client_secret: this.cfg.secretKey },
      true,
    );
    this.token = { value: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
    return this.token.value;
  }

  async createReturnShipment(req: ReturnShipmentRequest): Promise<CreatedShipment> {
    if (this.cfg.returnLabelMode === "qr") {
      throw new CarrierError(
        "FedEx QR returns need FedEx Returns Technology enabled on the account. Set FEDEX_RETURN_LABEL_MODE=label until it is.",
        false,
      );
    }
    const res = await this.request<{
      output?: {
        transactionShipments?: {
          masterTrackingNumber?: string;
          pieceResponses?: { trackingNumber?: string; packageDocuments?: { encodedLabel?: string; docType?: string }[] }[];
        }[];
      };
    }>("/ship/v1/shipments", {
      labelResponseOptions: "LABEL",
      accountNumber: { value: this.cfg.accountNumber },
      requestedShipment: {
        // On a return, the shipper is the customer and the recipient is the lab.
        shipper: toFedExParty(req.from),
        recipients: [toFedExParty(req.to)],
        shipDatestamp: new Date().toISOString().slice(0, 10),
        serviceType: this.cfg.returnServiceType,
        packagingType: "YOUR_PACKAGING",
        pickupType: "DROPOFF_AT_FEDEX_LOCATION",
        // FedEx only allows SENDER (or THIRD_PARTY) billing on return shipments;
        // "sender" here means our account, which pays for the return.
        shippingChargesPayment: { paymentType: "SENDER", payor: { responsibleParty: { accountNumber: { value: this.cfg.accountNumber } } } },
        shipmentSpecialServices: {
          specialServiceTypes: ["RETURN_SHIPMENT"],
          returnShipmentDetail: { returnType: "PRINT_RETURN_LABEL", rma: { reason: `PetWealth sample return ${req.rmaNumber}` } },
        },
        labelSpecification: { imageType: "PDF", labelStockType: "PAPER_85X11_TOP_HALF_LABEL" },
        requestedPackageLineItems: [
          {
            weight: { units: "LB", value: req.weightLbs },
            customerReferences: [{ customerReferenceType: "CUSTOMER_REFERENCE", value: req.rmaNumber }],
          },
        ],
      },
    });
    const shipment = res.output?.transactionShipments?.[0];
    const piece = shipment?.pieceResponses?.[0];
    const trackingNumber = piece?.trackingNumber ?? shipment?.masterTrackingNumber;
    const label = piece?.packageDocuments?.find((d) => d.encodedLabel)?.encodedLabel;
    if (!trackingNumber || !label) throw new CarrierError("FedEx response had no tracking number or label", false, res);
    return { trackingNumber, label: { format: "pdf", mimeType: "application/pdf", contentBase64: label } };
  }

  async track(trackingNumbers: string[]): Promise<TrackingUpdate[]> {
    const out: TrackingUpdate[] = [];
    for (let i = 0; i < trackingNumbers.length; i += TRACK_BATCH) {
      const batch = trackingNumbers.slice(i, i + TRACK_BATCH);
      const res = await this.request<{
        output?: {
          completeTrackResults?: {
            trackingNumber: string;
            trackResults?: {
              latestStatusDetail?: { code?: string; description?: string };
              dateAndTimes?: { type: string; dateTime: string }[];
              error?: { code: string; message: string };
            }[];
          }[];
        };
      }>("/track/v1/trackingnumbers", {
        includeDetailedScans: false,
        trackingInfo: batch.map((trackingNumber) => ({ trackingNumberInfo: { trackingNumber } })),
      });
      for (const r of res.output?.completeTrackResults ?? []) {
        const t = r.trackResults?.[0];
        const when = (type: string) => {
          const d = t?.dateAndTimes?.find((x) => x.type === type)?.dateTime;
          return d ? new Date(d) : null;
        };
        const code = t?.latestStatusDetail?.code ?? "";
        out.push({
          trackingNumber: r.trackingNumber,
          status: t?.error ? "unknown" : (STATUS_BY_CODE[code] ?? "unknown"),
          description: t?.error?.message ?? t?.latestStatusDetail?.description ?? null,
          occurredAt: when("ACTUAL_DELIVERY") ?? when("ACTUAL_PICKUP") ?? null,
          pickedUpAt: when("ACTUAL_PICKUP"),
          deliveredAt: when("ACTUAL_DELIVERY"),
        });
      }
    }
    return out;
  }
}
