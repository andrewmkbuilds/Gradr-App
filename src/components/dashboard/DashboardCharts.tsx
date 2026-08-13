import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { Surface, SurfaceHeader } from "@/components/ui/surface";

export interface ActivityPoint {
  label: string;
  applications: number;
  interviews: number;
}

export interface FunnelPoint {
  label: string;
  value: number;
  chart: number;
}

const axisProps = {
  stroke: "hsl(var(--border))",
  tick: { fill: "hsl(var(--muted-foreground))", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="elev-4 rounded-lg px-3 py-2 text-xs">
      <p className="mb-1 font-medium text-foreground">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="capitalize">{p.name}</span>
          <span className="ml-auto tabular-nums text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Color-safe legend: every series carries a distinct shape as well as a hue so
 * the chart stays decodable for color-vision deficiencies and in print.
 */
function ChartLegend({
  items,
}: {
  items: { label: string; color: string; shape: "circle" | "square" | "diamond" | "triangle" }[];
}) {
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 shrink-0"
            style={{
              background: it.color,
              borderRadius: it.shape === "circle" ? "9999px" : it.shape === "square" ? "2px" : 0,
              transform: it.shape === "diamond" ? "rotate(45deg)" : undefined,
              clipPath: it.shape === "triangle" ? "polygon(50% 0%, 100% 100%, 0% 100%)" : undefined,
            }}
          />
          <span>{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Wraps a chart in a keyboard-navigable region: arrow keys step through data
 * points, Home/End jump to the ends, and each step is announced politely.
 * A visually hidden table mirrors the chart for screen readers.
 */
function AccessibleChart({
  title,
  description,
  rows,
  columns,
  describePoint,
  children,
}: {
  title: string;
  description: string;
  rows: { label: string; values: (string | number)[] }[];
  columns: string[];
  describePoint: (row: { label: string; values: (string | number)[] }) => string;
  children: ReactNode;
}) {
  const [index, setIndex] = useState(-1);
  const [announcement, setAnnouncement] = useState("");
  const regionRef = useRef<HTMLDivElement>(null);

  function step(next: number) {
    if (!rows.length) return;
    const clamped = Math.max(0, Math.min(rows.length - 1, next));
    setIndex(clamped);
    setAnnouncement(describePoint(rows[clamped]));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    if (e.key === "Home") return step(0);
    if (e.key === "End") return step(rows.length - 1);
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    step(index < 0 ? (dir > 0 ? 0 : rows.length - 1) : index + dir);
  }

  return (
    <div
      ref={regionRef}
      role="application"
      tabIndex={0}
      aria-roledescription="chart"
      aria-label={`${title}. ${description} Use arrow keys to read each data point.`}
      onKeyDown={onKeyDown}
      onBlur={() => setIndex(-1)}
      className="focus-visible:ring-ring rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {children}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {index >= 0 && (
        <p className="mt-2 rounded-md bg-secondary/60 px-2 py-1 text-[11px] text-foreground">
          {describePoint(rows[index])}
        </p>
      )}

      <table className="sr-only">
        <caption>{`${title} — ${description}`}</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            {columns.map((c) => (
              <th key={c} scope="col">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {r.values.map((v, i) => (
                <td key={columns[i]}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Eight-week search momentum: applications sent vs interviews reached. */
export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const empty = data.every((d) => d.applications === 0 && d.interviews === 0);
  return (
    <Surface level={2} className="h-full">
      <SurfaceHeader title="Search momentum" action={<span className="text-xs text-muted-foreground">Last 8 weeks</span>} />
      {empty ? (
        <div className="flex h-[180px] items-center justify-center text-center text-sm text-muted-foreground sm:h-[220px]">
          Track a job to start charting your momentum.
        </div>
      ) : (
        <AccessibleChart
          title="Search momentum"
          description="Applications sent and interviews reached per week over the last 8 weeks."
          columns={["Applications", "Interviews"]}
          rows={data.map((d) => ({ label: `Week of ${d.label}`, values: [d.applications, d.interviews] }))}
          describePoint={(r) => `${r.label}: ${r.values[0]} applications, ${r.values[1]} interviews.`}
        >
          <ChartLegend
            items={[
              { label: "Applications", color: "hsl(var(--chart-1))", shape: "circle" },
              { label: "Interviews", color: "hsl(var(--chart-2))", shape: "diamond" },
            ]}
          />
          <div className="h-[180px] w-full sm:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradApplications" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradInterviews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-2))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--chart-2))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" vertical={false} />
                <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={12} {...axisProps} />
                <YAxis allowDecimals={false} width={34} {...axisProps} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--primary) / 0.3)" }} />
                <Area
                  type="monotone" dataKey="applications" name="applications"
                  stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#gradApplications)"
                />
                <Area
                  type="monotone" dataKey="interviews" name="interviews"
                  stroke="hsl(var(--chart-2))" strokeWidth={2} strokeDasharray="5 3" fill="url(#gradInterviews)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </AccessibleChart>
      )}
    </Surface>
  );
}

/** Pipeline conversion, widest stage first. */
export function PipelineFunnelChart({ data }: { data: FunnelPoint[] }) {
  const empty = data.every((d) => d.value === 0);
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <Surface level={2} className="h-full">
      <SurfaceHeader title="Pipeline conversion" action={<span className="text-xs text-muted-foreground">All time</span>} />
      {empty ? (
        <div className="flex h-[180px] items-center justify-center text-center text-sm text-muted-foreground sm:h-[220px]">
          Nothing in the pipeline yet.
        </div>
      ) : (
        <AccessibleChart
          title="Pipeline conversion"
          description="Number of tracked jobs at each stage of your pipeline."
          columns={["Jobs", "Share"]}
          rows={data.map((d) => ({
            label: d.label,
            values: [d.value, total ? `${Math.round((d.value / total) * 100)}%` : "0%"],
          }))}
          describePoint={(r) => `${r.label}: ${r.values[0]} jobs, ${r.values[1]} of pipeline.`}
        >
          <div className="h-[180px] w-full sm:h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...axisProps} />
                <YAxis type="category" dataKey="label" width={66} {...axisProps} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--primary) / 0.06)" }} />
                <Bar dataKey="value" name="jobs" radius={[0, 6, 6, 0]} barSize={16}>
                  {data.map((d) => (
                    <Cell key={d.label} fill={`hsl(var(--chart-${d.chart}))`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </AccessibleChart>
      )}
    </Surface>
  );
}
