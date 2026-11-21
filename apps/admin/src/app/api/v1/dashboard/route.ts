import { getDashboard } from "@petwealth/api";
import { apiRoute, searchParamsOf } from "@/lib/api-route";

export const GET = apiRoute(({ staff, req }) => getDashboard(staff, searchParamsOf(req)));
