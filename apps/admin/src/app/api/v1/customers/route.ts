import { listCustomers } from "@petwealth/api";
import { apiRoute, searchParamsOf } from "@/lib/api-route";

export const GET = apiRoute(({ staff, req }) => listCustomers(staff, searchParamsOf(req)));
