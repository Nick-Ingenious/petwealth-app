import { listOrders } from "@petwealth/api";
import { apiRoute, searchParamsOf } from "@/lib/api-route";

export const GET = apiRoute(({ staff, req }) => listOrders(staff, searchParamsOf(req)));
