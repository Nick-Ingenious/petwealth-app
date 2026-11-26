import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/** The picture shown when someone shares a portal link (iMessage, WhatsApp, Slack, email, social). */
export const alt = "Petwealth: Love, backed by science. At-home fecal, oral and respiratory tests for your pet.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asset = (path: string) => readFile(join(process.cwd(), "public", path));

/** Plus Jakarta Sans (the brand's body font) for the small line, from Google Fonts at build time. Null if unreachable. */
async function jakarta(): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch("https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500")).text();
    const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}
const dataUrl = (bytes: Buffer, type: string) => `data:${type};base64,${bytes.toString("base64")}`;

export default async function OpenGraphImage() {
  const [photo, wordmark, creolia, body] = await Promise.all([asset("home/hero-dog.jpg"), asset("home/wordmark-white.png"), asset("fonts/Creolia.otf"), jakarta()]);
  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", background: "#0E2A30" }}>
        {/* The dog at sunset, looking up, on the right. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={dataUrl(photo, "image/jpeg")} alt="" width={1200} height={800} style={{ position: "absolute", left: 0, top: -110, width: 1200, height: 800, objectFit: "cover" }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 1200,
            height: 630,
            display: "flex",
            // Darken the sky behind the text so it reads on any screen.
            backgroundImage: "linear-gradient(90deg, rgba(14,42,48,0.9), rgba(14,42,48,0.72) 42%, rgba(14,42,48,0) 58%)",
          }}
        />
        <div style={{ position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "72px 80px", width: 680 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUrl(wordmark, "image/png")} alt="" width={300} height={48} style={{ width: 300, height: 48 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: "Creolia", fontSize: 76, lineHeight: 1.05, letterSpacing: -2, color: "#FFFFFF" }}>Love, backed by science.</div>
            <div style={{ marginTop: 24, fontFamily: body ? "Plus Jakarta Sans" : "Creolia", fontSize: 28, lineHeight: 1.4, color: "rgba(255,255,255,0.88)" }}>
              At-home fecal, oral and respiratory tests for your pet, with results in the Petwealth app.
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Creolia", data: creolia, weight: 700, style: "normal" },
        ...(body ? [{ name: "Plus Jakarta Sans", data: body, weight: 500 as const, style: "normal" as const }] : []),
      ],
    },
  );
}
