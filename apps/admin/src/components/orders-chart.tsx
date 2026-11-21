"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Point {
  bucket: string;
  orders: number;
  revenueCents: number;
}

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);
const day = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Revenue (area) with order count in the tooltip. */
export function OrdersChart({ data }: { data: Point[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="bucket" tickFormatter={day} tick={{ fontSize: 12, fill: "var(--color-ink-subtle)" }} tickLine={false} axisLine={false} minTickGap={24} />
          <YAxis tickFormatter={(v: number) => usd(v)} tick={{ fontSize: 12, fill: "var(--color-ink-subtle)" }} tickLine={false} axisLine={false} width={56} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid var(--color-line)", fontSize: 13 }}
            labelFormatter={(l) => day(String(l))}
            formatter={(value, _name, item) => [`${usd(Number(value))} · ${(item.payload as Point).orders} orders`, "Revenue"]}
          />
          <Area type="monotoneX" dataKey="revenueCents" stroke="var(--color-brand-600)" strokeWidth={2} fill="url(#rev)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
