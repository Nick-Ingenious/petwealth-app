import { receiveKit } from "@petwealth/api";
import { apiRoute } from "@/lib/api-route";

export const POST = apiRoute<{ code: string }>(({ staff, params }) =>
  receiveKit(staff, { kitCode: decodeURIComponent(params.code) }),
);
