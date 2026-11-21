import { transitionKit } from "@petwealth/api";
import { apiRoute } from "@/lib/api-route";

export const POST = apiRoute<{ code: string }>(async ({ staff, req, params }) => {
  const body = (await req.json()) as { to?: string; note?: string };
  return transitionKit(staff, { kitCode: decodeURIComponent(params.code), to: body.to as never, note: body.note });
});
