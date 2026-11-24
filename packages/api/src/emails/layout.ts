import { portalUrl } from "../portal-url";

/**
 * Shared shell for transactional email, following the brand email guide: stone
 * page (#F8F2EA), 520 content column in a white rounded card, purple caps
 * eyebrow, slate pill button with white text, Plus Jakarta Sans with safe
 * fallbacks. Table layout and inline styles so it holds up in Gmail and Outlook.
 */
export const FONT = "'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif";
const INK = "#1b2330";

/**
 * The logo is hosted on the portal rather than attached, so mail apps don't
 * show a paperclip on every email. 312x50 PNG, shown at half size for retina.
 */
export function logoUrl(): string {
  return `${portalUrl()}/brand/email-logo.png`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function paragraph(html: string, margin = "0 0 12px", size = "16px", color = "#3f3f46"): string {
  return `<tr><td style="padding:${margin};font-family:${FONT};font-size:${size};line-height:1.5;color:${color}">${html}</td></tr>`;
}

export function stepList(items: string[]): string {
  const rows = items
    .map(
      (html, i) => `
        <tr>
          <td valign="top" width="36" style="padding:0 0 12px">
            <div style="width:26px;height:26px;border-radius:13px;background:#CAB3FF;color:${INK};font-family:${FONT};font-size:13px;font-weight:700;line-height:26px;text-align:center">${i + 1}</div>
          </td>
          <td valign="top" style="padding:2px 0 12px;font-family:${FONT};font-size:16px;line-height:1.5;color:#3f3f46">${html}</td>
        </tr>`,
    )
    .join("");
  return `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>`;
}

export function button(label: string, href: string): string {
  return `
    <tr><td align="center" style="padding:16px 0 0">
      <a href="${escapeHtml(href)}" style="display:inline-block;background:${INK};color:#ffffff;font-family:${FONT};font-size:16px;font-weight:600;line-height:50px;padding:0 28px;border-radius:25px;text-decoration:none">${escapeHtml(label)}&nbsp;&rarr;</a>
    </td></tr>`;
}

export function layout({ preheader, eyebrow, headline, body }: { preheader: string; eyebrow: string; headline: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;background:#F8F2EA">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F2EA">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
      <tr><td style="padding:0 0 20px">
        <img src="${logoUrl()}" width="156" height="25" alt="Petwealth" style="display:block;width:156px;height:25px;border:0">
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:24px;padding:32px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 0 8px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#7D61C7">${escapeHtml(eyebrow)}</td></tr>
          <tr><td style="padding:0 0 16px;font-family:${FONT};font-size:28px;font-weight:700;line-height:1.2;letter-spacing:-0.5px;color:${INK}">${escapeHtml(headline)}</td></tr>
          ${body}
        </table>
      </td></tr>
      <tr><td align="center" style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:#71717a">
        Petwealth &middot; Love, backed by science.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
