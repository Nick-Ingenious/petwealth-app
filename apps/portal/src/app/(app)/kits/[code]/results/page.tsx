import { notFound } from "next/navigation";
import { getMyLabReport } from "@petwealth/api";
import { requireCustomer } from "@/lib/auth";
import { ReportView } from "./report-view";

export const metadata = { title: "Results" };

export default async function ResultsPage({ params }: PageProps<"/kits/[code]/results">) {
  const { code } = await params;
  const raw = decodeURIComponent(code);
  const ctx = await requireCustomer({ next: `/kits/${encodeURIComponent(raw)}/results` });
  const report = await getMyLabReport(ctx, raw);
  if (!report) notFound();
  return <ReportView report={report} />;
}
