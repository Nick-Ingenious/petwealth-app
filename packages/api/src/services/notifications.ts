/**
 * Email delivery.
 *
 *   services write a `notifications` row (channel "email", status "queued")
 *     └─► deliverQueuedEmails ──► render template ──► Resend ──► "sent" / "failed" / "skipped"
 *
 * Runs right after the event that queued the email (e.g. the FedEx code being
 * created) and again from the admin cron, which retries temporary failures.
 * Each send uses the notification id as its idempotency key, so a retry after a
 * timeout never emails the customer twice.
 */
import { and, asc, desc, eq, getDb, inArray, schema as s } from "@petwealth/db";
import { EmailError, getEmailSender, type EmailMessage, type EmailSender } from "@petwealth/integrations/email";
import { LOGO_ATTACHMENT } from "../emails/layout";
import { returnLabelReadyEmail } from "../emails/return-label-ready";

/** Give up on temporary failures after a day; the email would be stale by then. */
const RETRY_FOR_MS = 24 * 60 * 60 * 1000;

type NotificationRow = typeof s.notifications.$inferSelect;
type Rendered = { message: Omit<EmailMessage, "to" | "idempotencyKey"> } | { skip: string };

export function portalUrl(env: Record<string, string | undefined> = process.env): string {
  return (env.PORTAL_URL?.trim() || "https://app.petwealth.com").replace(/\/+$/, "");
}

async function render(row: NotificationRow): Promise<Rendered> {
  const db = getDb();
  if (row.template === "return_label_ready") {
    // The mailer this email is about: the one holding row.kitId, else the customer's latest.
    let shipmentId: string | undefined;
    if (row.kitId) {
      const [link] = await db
        .select({ shipmentId: s.shipmentKits.shipmentId })
        .from(s.shipmentKits)
        .innerJoin(s.shipments, eq(s.shipments.id, s.shipmentKits.shipmentId))
        .where(and(eq(s.shipmentKits.kitId, row.kitId), eq(s.shipments.direction, "return")))
        .orderBy(desc(s.shipments.createdAt))
        .limit(1);
      shipmentId = link?.shipmentId;
    } else {
      const latest = await db.query.shipments.findFirst({
        where: and(eq(s.shipments.customerId, row.customerId), eq(s.shipments.direction, "return")),
        orderBy: desc(s.shipments.createdAt),
      });
      shipmentId = latest?.id;
    }
    const shipment = shipmentId
      ? await db.query.shipments.findFirst({
          where: eq(s.shipments.id, shipmentId),
          with: { kits: { with: { kit: { with: { pet: true } } } }, label: true },
        })
      : undefined;
    if (!shipment?.rmaNumber) return { skip: "No return mailer found for this email" };
    if (!shipment.label) return { skip: "The mailer has no FedEx code yet" };

    const customer = await db.query.customers.findFirst({ where: eq(s.customers.id, row.customerId) });
    const kits = shipment.kits.map((sk) => ({ code: sk.kit.code ?? "", petName: sk.kit.pet?.name ?? null, panel: sk.kit.panel }));
    const first = kits.find((k) => k.code);
    const email = returnLabelReadyEmail({
      firstName: customer?.firstName ?? null,
      kits,
      rmaNumber: shipment.rmaNumber,
      label: {
        format: shipment.labelFormat === "pdf" ? "pdf" : "qr_png",
        mimeType: shipment.label.mimeType,
        contentBase64: shipment.label.contentBase64,
      },
      kitUrl: first ? `${portalUrl()}/kits/${encodeURIComponent(first.code)}` : portalUrl(),
    });
    return { message: { subject: email.subject, html: email.html, text: email.text, attachments: [LOGO_ATTACHMENT, ...email.attachments] } };
  }
  return { skip: `No email template for "${row.template}"` };
}

export type DeliveryResult = { sent: number; failed: number; skipped: number; retrying: number };

/** Send queued emails (all of them, or just `ids`). Never throws for a single bad email. */
export async function deliverQueuedEmails(opts: { sender?: EmailSender; ids?: string[]; limit?: number; now?: () => number } = {}): Promise<DeliveryResult> {
  const result: DeliveryResult = { sent: 0, failed: 0, skipped: 0, retrying: 0 };
  if (opts.ids && opts.ids.length === 0) return result;
  const db = getDb();
  const now = opts.now ?? Date.now;
  const sender = opts.sender ?? getEmailSender();
  const rows = await db
    .select()
    .from(s.notifications)
    .where(
      and(
        eq(s.notifications.channel, "email"),
        eq(s.notifications.status, "queued"),
        opts.ids ? inArray(s.notifications.id, opts.ids) : undefined,
      ),
    )
    .orderBy(asc(s.notifications.createdAt))
    .limit(opts.limit ?? 50);

  for (const row of rows) {
    // Only touch rows still queued, so two runs at once can't both record a result.
    const settle = (set: Partial<typeof s.notifications.$inferInsert>) =>
      db.update(s.notifications).set(set).where(and(eq(s.notifications.id, row.id), eq(s.notifications.status, "queued")));

    const customer = await db.query.customers.findFirst({ where: eq(s.customers.id, row.customerId) });
    if (!customer?.email) {
      await settle({ status: "skipped", error: "Customer has no email address" });
      result.skipped++;
      continue;
    }
    try {
      const rendered = await render(row);
      if ("skip" in rendered) {
        await settle({ status: "skipped", error: rendered.skip });
        result.skipped++;
        continue;
      }
      const { id } = await sender.send({ ...rendered.message, to: customer.email, idempotencyKey: `notification-${row.id}` });
      await settle({ status: "sent", providerMessageId: id, sentAt: new Date(now()), error: null });
      result.sent++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const retryable = e instanceof EmailError ? e.retryable : false;
      if (!(e instanceof EmailError)) console.error("[email] unexpected error", e);
      if (retryable && now() - row.createdAt.getTime() < RETRY_FOR_MS) {
        await settle({ error: message }); // stays queued; the cron tries again
        result.retrying++;
      } else {
        await settle({ status: "failed", error: message });
        result.failed++;
      }
    }
  }
  return result;
}
