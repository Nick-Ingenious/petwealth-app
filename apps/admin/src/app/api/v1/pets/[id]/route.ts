import { getPet, notFound, updatePet } from "@petwealth/api";
import { apiRoute } from "@/lib/api-route";

const checkId = (id: string) => {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Pet");
};

export const GET = apiRoute<{ id: string }>(({ staff, params }) => {
  checkId(params.id);
  return getPet(staff, params.id);
});

export const PATCH = apiRoute<{ id: string }>(async ({ staff, req, params }) => {
  checkId(params.id);
  return updatePet(staff, params.id, await req.json());
});
