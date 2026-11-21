"use client";

import { useMemo, useState, useTransition } from "react";
import { ROLE_LABEL, type Permission, type RoleKey } from "@petwealth/domain";
import { Badge, Button, Card, cn } from "@petwealth/ui";
import { saveRolePermissionsAction } from "./actions";

type Editable = Exclude<RoleKey, "super_admin">;
interface Props {
  permissions: Record<Permission, { module: string; label: string; kind: "page" | "action" }>;
  roles: Editable[];
  granted: Record<Editable, Permission[]>;
  lockedRole: RoleKey;
}

/** Role × permission grid with unsaved-change tracking. Super Admin is implicit and not shown. */
export function PermissionMatrix({ permissions, roles, granted, lockedRole }: Props) {
  const initial = useMemo(() => Object.fromEntries(roles.map((r) => [r, new Set(granted[r])])) as Record<Editable, Set<Permission>>, [roles, granted]);
  const [state, setState] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirtyRoles = roles.filter((r) => state[r].size !== initial[r].size || [...state[r]].some((p) => !initial[r].has(p)));
  const modules = Object.entries(permissions).reduce<Record<string, Permission[]>>((acc, [key, meta]) => {
    (acc[meta.module] ??= []).push(key as Permission);
    return acc;
  }, {});

  const toggle = (role: Editable, p: Permission) =>
    setState((s) => {
      const next = new Set(s[role]);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return { ...s, [role]: next };
    });

  const save = () =>
    start(async () => {
      const r = await saveRolePermissionsAction(dirtyRoles.map((role) => ({ role, permissions: [...state[role]] })));
      setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
    });

  return (
    <>
      <div className="sticky top-16 z-[5] -mx-1 mb-4 flex flex-wrap items-center justify-between gap-3 bg-canvas/90 px-1 py-2 backdrop-blur">
        <p className="text-sm text-ink-muted">
          <Badge tone="brand">Super Admin</Badge> always has every permission. You can&apos;t edit your own role.
        </p>
        <div className="flex items-center gap-3">
          {msg ? <span className={cn("text-sm", msg.ok ? "text-emerald-700" : "text-red-600")}>{msg.text}</span> : null}
          <Button variant="secondary" disabled={!dirtyRoles.length || pending} onClick={() => { setState(initial); setMsg(null); }}>Reset</Button>
          <Button disabled={!dirtyRoles.length || pending} onClick={save}>
            {pending ? "Saving…" : dirtyRoles.length ? `Save changes (${dirtyRoles.length})` : "Save changes"}
          </Button>
        </div>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-line bg-canvas/60">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-muted">Permission</th>
              {roles.map((r) => (
                <th key={r} scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {ROLE_LABEL[r]}
                  {r === lockedRole ? <span className="block text-[10px] normal-case text-ink-subtle">(your role)</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          {Object.entries(modules).map(([module, perms]) => (
            <tbody key={module} className="divide-y divide-line border-b border-line">
              <tr className="bg-canvas/40">
                <th colSpan={roles.length + 1} scope="colgroup" className="px-6 py-2 text-left text-xs font-semibold text-ink">{module}</th>
              </tr>
              {perms.map((p) => (
                <tr key={p}>
                  <th scope="row" className="px-6 py-3 text-left font-normal">
                    <span className="text-ink">{permissions[p].label}</span>
                    <span className="ml-2 font-mono text-xs text-ink-subtle">{p}</span>
                    <Badge tone={permissions[p].kind === "page" ? "info" : "neutral"} className="ml-2">{permissions[p].kind}</Badge>
                  </th>
                  {roles.map((r) => (
                    <td key={r} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        aria-label={`${ROLE_LABEL[r]}: ${permissions[p].label}`}
                        checked={state[r].has(p)}
                        disabled={r === lockedRole || pending}
                        onChange={() => toggle(r, p)}
                        className="size-4 accent-brand-600"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </Card>
    </>
  );
}
