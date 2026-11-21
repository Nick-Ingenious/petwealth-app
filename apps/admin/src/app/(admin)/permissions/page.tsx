import { KeyRound } from "lucide-react";
import { getPermissionMatrix } from "@petwealth/api";
import { PageHeader } from "@petwealth/ui";
import { requireStaff } from "@/lib/auth";
import { PermissionMatrix } from "./matrix";

export const metadata = { title: "Permissions" };

export default async function PermissionsPage() {
  const staff = await requireStaff("permissions.manage");
  const m = await getPermissionMatrix(staff);
  return (
    <>
      <PageHeader icon={<KeyRound className="size-6" />} title="Permissions" description="Control page and action access for each role." />
      <PermissionMatrix permissions={m.permissions} roles={m.roles} granted={m.granted} lockedRole={staff.role} />
    </>
  );
}
