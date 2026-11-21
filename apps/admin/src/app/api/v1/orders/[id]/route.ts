import { getOrder, notFound } from "@petwealth/api";
import { apiRoute } from "@/lib/api-route";

export const GET = apiRoute<{ id: string }>(({ staff, params }) => {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) throw notFound("Order");
  return getOrder(staff, params.id);
});
