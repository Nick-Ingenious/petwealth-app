/**
 * A US phone number as E.164 (+1XXXXXXXXXX), or null if it isn't one we can
 * text. Customers type numbers in any format; Shopify sends E.164.
 */
export function toUsE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  // NANP: area code and exchange can't start with 0 or 1.
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) ? `+1${national}` : null;
}
