/**
 * FedEx REST API adapter (developer.fedex.com): OAuth, Returns, Ship, Track.
 *
 * Return codes are label-less: the customer shows a QR code at a FedEx counter
 * and FedEx prints the label there. That is the FedEx Returns API
 * (`/returns/v1/rma`, "FedEx Returns Technology"), configured with our retailer
 * id, the lab's ship-to address id and a return SKU. The QR is simply our RMA
 * number; FedEx looks the return up by it when scanned. Same flow and settings
 * as the old Petwealth backend.
 *
 * Without the Returns settings (e.g. a sandbox that isn't enrolled), the Ship
 * API creates a printable PDF return label instead. Production requires the
 * Returns settings (see getCarrier).
 *
 * Ship + Track verified against the FedEx sandbox on 2026-11-23. The sandbox
 * test account can't ship Ground, so previews use FEDEX_RETURN_SERVICE_TYPE=FEDEX_2_DAY.
 */
import QRCode from "qrcode";
import { CarrierError, type Address, type Carrier, type CreatedShipment, type ReturnShipmentRequest, type TrackStatus, type TrackingUpdate } from "./types";

export interface FedExReturnsConfig {
  /** FedEx Returns retailer id (FEDEX_RETAILER_ID). */
  retailerId: number;
  /** Where returns go, as set up in the FedEx Returns portal, e.g. "TXLAB". */
  shipToAddressId: string;
  /** Return item SKU from the FedEx Returns portal, e.g. "7681814_DEFAULT_ITEM". */
  sku: string;
}

export interface FedExConfig {
  apiKey: string;
  secretKey: string;
  accountNumber: string;
  environment: "sandbox" | "production";
  /** Ship API service for printed return labels, e.g. FEDEX_GROUND, FEDEX_2_DAY. */
  returnServiceType: string;
  /** Label-less QR returns via FedEx Returns. Absent → printed PDF labels. */
  returns?: FedExReturnsConfig;
  fetch?: typeof fetch;
}

const BASE_URL = { sandbox: "https://apis-sandbox.fedex.com", production: "https://apis.fedex.com" } as const;
const TIMEOUT_MS = 15_000;
const TRACK_BATCH = 30; // FedEx Track API limit per request

/**
 * Petwealth's fixed details on every FedEx return authorization (same values
 * as the old backend). Counter drop-off doesn't need the customer's home
 * address, so FedEx gets the company address instead; Petwealth pays.
 */
const RETURNS_DEFAULTS = {
  shippingService: "FDXE",
  returnReason: "Diagnostic sample return to laboratory",
  phoneNumber: "5172621115",
  address: { streetLines: ["30 Skyline Dr"], city: "Plainview", stateOrProvinceCode: "NY", postalCode: "11803", countryCode: "US", residential: false },
} as const;

/** FedEx Returns codes meaning "this RMA number already exists". */
const DUPLICATE_RMA_CODES = new Set(["ERR-RMA-0011", "RMA.NUMBER.ALREADY.IN.USE"]);

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

type FedExError = { code?: string; message?: string };

interface ReturnRma {
  rmaId?: string;
  rmaNumber?: string;
  status?: string;
  retailerId?: number;
  customer?: { contact?: { emailAddress?: string } };
  shipments?: { rmaId?: string; trackingNo?: string; label?: { trackingNumber?: string } }[];
}

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

/** FedEx reports errors in several shapes, sometimes on HTTP 200 (Returns API). */
function errorsIn(json: unknown): FedExError[] {
  const j = json as { error?: FedExError; errors?: FedExError[]; output?: { errors?: FedExError[] } } | null;
  return [...(j?.errors ?? []), ...(j?.output?.errors ?? []), ...(j?.error ? [j.error] : [])];
}

/** The FedEx error code carried by a CarrierError, if any. */
export function fedexErrorCode(e: unknown): string | undefined {
  return e instanceof CarrierError ? (e.details as FedExError[] | undefined)?.[0]?.code : undefined;
}

const normEmail = (e: string | undefined) => (e ?? "").trim().toLowerCase();

export class FedExCarrier implements Carrier {
  readonly name = "fedex" as const;
  private token: { value: string; expiresAt: number } | null = null;
  private readonly http: typeof fetch;

  constructor(private readonly cfg: FedExConfig) {
    this.http = cfg.fetch ?? fetch;
  }

  private async request<T>(path: string, body: unknown, opts: { form?: boolean; returnsApi?: boolean } = {}): Promise<T> {
    let headers: Record<string, string>;
    if (opts.form) {
      headers = { "content-type": "application/x-www-form-urlencoded" };
    } else {
      const auth = `Bearer ${await this.accessToken()}`;
      headers = { "content-type": "application/json", authorization: auth, "x-locale": "en_US" };
      // The Returns API wants the token in x-authorization as well.
      if (opts.returnsApi) Object.assign(headers, { "x-authorization": auth, "x-content-type": "application/json" });
    }
    let res: Response;
    try {
      res = await this.http(`${BASE_URL[this.cfg.environment]}${path}`, {
        method: "POST",
        headers,
        body: opts.form ? new URLSearchParams(body as Record<string, string>).toString() : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new CarrierError(`FedEx unreachable: ${e instanceof Error ? e.message : String(e)}`, true);
    }
    const json = (await res.json().catch(() => ({}))) as T;
    const errors = errorsIn(json);
    if (!res.ok || (opts.returnsApi && errors.length)) {
      const msg = errors.length ? errors.map((e) => `${e.code}: ${e.message}`).join("; ") : `HTTP ${res.status}`;
      if (res.status === 401 && !opts.form) this.token = null;
      throw new CarrierError(`FedEx ${path} failed: ${msg}`, res.status >= 500 || res.status === 429 || res.status === 401, errors);
    }
    return json;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const res = await this.request<{ access_token: string; expires_in: number }>(
      "/oauth/token",
      { grant_type: "client_credentials", client_id: this.cfg.apiKey, client_secret: this.cfg.secretKey },
      { form: true },
    );
    this.token = { value: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
    return this.token.value;
  }

  async createReturnShipment(req: ReturnShipmentRequest): Promise<CreatedShipment> {
    return this.cfg.returns ? this.createQrReturn(req, this.cfg.returns) : this.createPrintedReturn(req);
  }

  // ── Label-less QR returns (FedEx Returns API) ────────────────────────────

  private async createQrReturn(req: ReturnShipmentRequest, ret: FedExReturnsConfig): Promise<CreatedShipment> {
    const email = normEmail(req.customerEmail);
    if (!email || email.length > 80) throw new CarrierError("FedEx Returns needs the customer's email (max 80 characters).", false);
    if (req.rmaNumber.length > 20) throw new CarrierError("FedEx RMA numbers are at most 20 characters.", false);

    let rma: ReturnRma | undefined;
    try {
      const res = await this.request<{ output?: { rma?: ReturnRma } }>(
        "/returns/v1/rma",
        {
          rmaNumber: req.rmaNumber,
          shippingService: RETURNS_DEFAULTS.shippingService,
          returnProgram: "LABEL",
          labelRequired: true, // FedEx prints the label at the counter
          emailNotification: false, // we tell the customer ourselves
          createItemIfNotExists: false,
          shippingCostResponsibility: "Retailer",
          shipToAddressId: ret.shipToAddressId,
          customer: {
            id: ret.retailerId,
            contact: { personName: req.from.name.slice(0, 70) || "Petwealth Customer", emailAddress: email, phoneNumber: RETURNS_DEFAULTS.phoneNumber },
            address: RETURNS_DEFAULTS.address,
          },
          orders: [
            {
              orderNumber: req.rmaNumber,
              orderDate: new Date().toISOString(),
              items: [{ sku: ret.sku, quantity: Math.max(1, req.kitCount), returnItemInfo: { returnReason: RETURNS_DEFAULTS.returnReason } }],
            },
          ],
        },
        { returnsApi: true },
      );
      rma = res.output?.rma;
    } catch (e) {
      if (!DUPLICATE_RMA_CODES.has(fedexErrorCode(e) ?? "")) throw e;
      // Already exists: either our own earlier attempt (e.g. a timeout after
      // FedEx created it) — reuse it — or someone else's, e.g. the old system.
      rma = await this.findRma(req.rmaNumber, ret);
      if (!rma || normEmail(rma.customer?.contact?.emailAddress) !== email) {
        throw new CarrierError(
          `RMA ${req.rmaNumber} is already used in FedEx Returns by a different return (probably the old system). Shipment numbering must start above the old system's highest RMA.`,
          false,
        );
      }
    }

    const shipment = rma?.shipments?.[0];
    const trackingNumber = shipment?.label?.trackingNumber ?? shipment?.trackingNo;
    if (!trackingNumber) throw new CarrierError("FedEx Returns response had no tracking number", true, rma);
    const png = await QRCode.toBuffer(req.rmaNumber, { errorCorrectionLevel: "M", width: 512, margin: 4 });
    return {
      trackingNumber,
      label: { format: "qr_png", mimeType: "image/png", contentBase64: png.toString("base64") },
      carrierReference: rma?.rmaId ?? shipment?.rmaId,
    };
  }

  /** Look up an RMA by number (FedEx may also store it with the prefix doubled). */
  private async findRma(rmaNumber: string, ret: FedExReturnsConfig): Promise<ReturnRma | undefined> {
    const res = await this.request<{ output?: { rmaspg?: { content?: ReturnRma[] } } }>(
      "/returns/v1/rma/details",
      { retailerId: ret.retailerId, rmaNumber, responseFilter: "Details", pageLimit: 10, page: 0 },
      { returnsApi: true },
    );
    return res.output?.rmaspg?.content?.find((r) => r.rmaNumber === rmaNumber && r.retailerId === ret.retailerId && !/cancel/i.test(r.status ?? ""));
  }

  // ── Printed return labels (Ship API) ─────────────────────────────────────

  private async createPrintedReturn(req: ReturnShipmentRequest): Promise<CreatedShipment> {
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
          returnShipmentDetail: { returnType: "PRINT_RETURN_LABEL", rma: { reason: `Petwealth sample return ${req.rmaNumber}` } },
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

  // ── Tracking ─────────────────────────────────────────────────────────────

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
