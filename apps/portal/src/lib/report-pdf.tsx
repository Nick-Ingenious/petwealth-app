import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { CustomerLabReport, CustomerPathogenResult } from "@petwealth/api";
import { PANEL_LABEL, SPECIES_LABEL } from "@petwealth/domain";

/** Brand colors (see the petwealth-design skill). Built-in Helvetica stands in for Plus Jakarta Sans. */
const C = { ink: "#19242B", ink2: "#5B5346", ink3: "#8A7D6A", line: "#E7DDCD", card: "#FAF6EE", lilac: "#CAB3FF", lilacSoft: "#EFEAFE", clear: "#E3F1D2" };

const s = StyleSheet.create({
  page: { padding: 44, paddingBottom: 60, fontFamily: "Helvetica", fontSize: 10.5, color: C.ink, lineHeight: 1.4 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 26 },
  logo: { width: 117, height: 18.75 },
  small: { fontSize: 8.5, color: C.ink3 },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 22, marginBottom: 8 },
  meta: { flexDirection: "row", gap: 18, marginTop: 6 },
  metaLabel: { fontSize: 7.5, color: C.ink3, textTransform: "uppercase", letterSpacing: 0.8 },
  summary: { marginTop: 18, padding: 16, borderRadius: 10, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  big: { fontSize: 28, fontFamily: "Helvetica-Bold" },
  pill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 10, fontSize: 9.5 },
  card: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: C.line, marginBottom: 8 },
  cardHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  name: { fontSize: 11.5, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.line },
  footer: { position: "absolute", bottom: 28, left: 44, right: 44, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: C.ink3 },
});

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

function Detected({ p }: { p: CustomerPathogenResult }) {
  return (
    <View style={s.card} wrap={false}>
      <View style={s.cardHead}>
        <Text style={s.name}>
          {p.name}
          {p.commonName ? <Text style={{ fontFamily: "Helvetica", color: C.ink3 }}>{`  ${p.commonName}`}</Text> : null}
        </Text>
        <Text style={[s.pill, { backgroundColor: C.lilac }]}>Detected</Text>
      </View>
      {p.whatIsIt ? <Text>{p.whatIsIt}</Text> : null}
      {p.whyItMatters ? <Text style={{ marginTop: 3 }}>{p.whyItMatters}</Text> : null}
      {p.symptoms?.length ? (
        <Text style={{ marginTop: 5, color: C.ink2 }}>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>Signs to watch for: </Text>
          {p.symptoms.join(", ")}
        </Text>
      ) : null}
      {p.zoonotic ? (
        <Text style={{ marginTop: 5, color: C.ink2 }}>Can pass between pets and people. Wash your hands after handling your pet or their waste.</Text>
      ) : null}
    </View>
  );
}

function Report({ r, logo }: { r: CustomerLabReport; logo: Buffer | null }) {
  const pet = r.petName ?? "Your pet";
  const total = r.detected.length + r.notDetected.length;
  const clear = r.status === "clean";
  const panel = PANEL_LABEL[r.panel];
  return (
    <Document title={`${pet} ${panel} results`} author="Petwealth">
      <Page size="LETTER" style={s.page}>
        <View style={s.header} fixed>
          {logo ? <Image src={logo} style={s.logo} /> : <Text style={{ fontFamily: "Helvetica-Bold" }}>Petwealth</Text>}
          <Text style={s.small}>Love, backed by science.</Text>
        </View>

        <Text style={s.h1}>{`${pet}'s ${panel} results`}</Text>
        <View style={s.meta}>
          {[
            ["Pet", pet],
            ["Test", `${SPECIES_LABEL[r.species].adjective} ${panel} panel`],
            ["Kit", r.kitCode],
            ["Released", dateFmt.format(r.releasedAt)],
          ].map(([label, value]) => (
            <View key={label}>
              <Text style={s.metaLabel}>{label}</Text>
              <Text>{value}</Text>
            </View>
          ))}
        </View>

        <View style={s.summary}>
          <View style={s.summaryRow}>
            <Text style={s.big}>
              {`${r.detected.length} `}
              <Text style={{ fontSize: 14, fontFamily: "Helvetica", color: C.ink3 }}>{`of ${total} pathogens found`}</Text>
            </Text>
            <Text style={[s.pill, { backgroundColor: clear ? C.clear : C.lilac }]}>{clear ? "Clear" : "Needs attention"}</Text>
          </View>
          <Text style={{ marginTop: 8 }}>
            {r.aiSummary
              ? r.aiSummary.summary
              : clear
                ? `None of the ${total} pathogens on this ${panel.toLowerCase()} panel were found.`
                : `We found ${r.detected.map((d) => d.name).join(", ")}. Share this report with your vet so you can decide on next steps together.`}
          </Text>
        </View>

        {r.aiSummary && r.aiSummary.nextSteps.some((x) => x.trim()) ? (
          <View wrap={false}>
            <Text style={s.h2}>Your next steps</Text>
            {r.aiSummary.nextSteps
              .map((x) => x.trim())
              .filter(Boolean)
              .map((step, i) => (
                <Text key={i} style={{ marginBottom: 3 }}>{`${i + 1}. ${step}`}</Text>
              ))}
            <Text style={{ marginTop: 4, color: C.ink2 }}>{r.aiSummary.vetReason}</Text>
          </View>
        ) : null}

        {r.detected.length ? (
          <>
            <Text style={s.h2}>What we found</Text>
            {r.detected.map((p) => (
              <Detected key={p.name} p={p} />
            ))}
          </>
        ) : null}

        <Text style={s.h2}>{`Not detected (${r.notDetected.length})`}</Text>
        {r.notDetected.map((p) => (
          <View key={p.name} style={s.row} wrap={false}>
            <Text>{p.name}</Text>
            <Text style={{ color: C.ink3 }}>Not detected</Text>
          </View>
        ))}

        <View style={[s.summary, { backgroundColor: C.lilacSoft, borderColor: C.lilacSoft }]} wrap={false}>
          <Text>{`Tested by PCR at the Petwealth lab. Your vet knows ${r.petName ?? "your pet"} best, so share this report at your next visit.`}</Text>
        </View>

        <View style={s.footer} fixed>
          <Text>{`Petwealth · ${r.kitCode}`}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function renderReportPdf(report: CustomerLabReport, logo: Buffer | null): Promise<Buffer> {
  return renderToBuffer(<Report r={report} logo={logo} />);
}
