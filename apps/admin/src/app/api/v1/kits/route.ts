import { listKits } from "@petwealth/api";
import { apiRoute, searchParamsOf } from "@/lib/api-route";

export const GET = apiRoute(({ staff, req }) => listKits(staff, searchParamsOf(req)));
