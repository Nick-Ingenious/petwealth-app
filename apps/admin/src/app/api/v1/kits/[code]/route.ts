import { getKit, notFound } from "@petwealth/api";
import { parseKitCode } from "@petwealth/domain";
import { apiRoute } from "@/lib/api-route";

export const GET = apiRoute<{ code: string }>(({ staff, params }) => {
  const parsed = parseKitCode(decodeURIComponent(params.code));
  if (!parsed) throw notFound("Kit");
  return getKit(staff, parsed.code);
});
