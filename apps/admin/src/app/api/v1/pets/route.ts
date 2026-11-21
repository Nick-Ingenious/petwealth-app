import { listPets } from "@petwealth/api";
import { apiRoute, searchParamsOf } from "@/lib/api-route";

export const GET = apiRoute(({ staff, req }) => listPets(staff, searchParamsOf(req)));
