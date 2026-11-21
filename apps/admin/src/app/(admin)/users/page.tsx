import { ShieldCheck } from "lucide-react";
import { can, listStaff } from "@petwealth/api";
import { ROLE_KEYS, ROLE_LABEL, type RoleKey } from "@petwealth/domain";
import { Badge, Card, CardBody, CardHeader, PageHeader, TBody, TD, TH, THead, TR, Table } from "@petwealth/ui";
import { requireStaff } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/format";
import { InviteForm, UserRowControls } from "./user-controls";

export const metadata = { title: "User Management" };

export default async function UsersPage() {
  const staff = await requireStaff("staff.view");
  const users = await listStaff(staff);
  const manage = can(staff, "staff.manage");
  const assignable: RoleKey[] = ROLE_KEYS.filter((r) => r !== "super_admin" || staff.role === "super_admin");
  return (
    <>
      <PageHeader icon={<ShieldCheck className="size-6" />} title="User Management" description={`${users.length} staff users`} />
      {manage ? (
        <Card className="mb-6">
          <CardHeader title="Invite a teammate" description="Staff sign in with their PetWealth Google account. Invitations are tied to the email address." />
          <CardBody><InviteForm assignableRoles={assignable} /></CardBody>
        </Card>
      ) : null}
      <Card className="overflow-hidden">
        <Table>
          <THead><tr><TH>Name</TH><TH>Role</TH><TH>Status</TH><TH>Added</TH><TH>Last sign-in</TH>{manage ? <TH className="text-right">Actions</TH> : null}</tr></THead>
          <TBody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD>
                  <p className="font-medium">{u.name ?? u.email}</p>
                  <p className="text-xs text-ink-subtle">{u.email}</p>
                </TD>
                <TD><Badge tone={u.role === "super_admin" ? "brand" : "neutral"}>{ROLE_LABEL[u.role]}</Badge></TD>
                <TD><Badge tone={u.status === "active" ? "success" : u.status === "invited" ? "warning" : "danger"}>{u.status}</Badge></TD>
                <TD className="whitespace-nowrap text-ink-muted">{formatDate(u.createdAt)}</TD>
                <TD className="whitespace-nowrap text-ink-muted">{formatDateTime(u.lastLoginAt)}</TD>
                {manage ? (
                  <TD>{u.id === staff.staffId ? <p className="text-right text-xs text-ink-subtle">You</p> : <UserRowControls id={u.id} role={u.role} status={u.status} assignableRoles={assignable} />}</TD>
                ) : null}
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
