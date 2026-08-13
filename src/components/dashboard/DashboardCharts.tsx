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

/** Eight-week search momentum: applications sent vs interviews reached. */
export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const empty = data.every((d) => d.applications === 0 && d.interviews === 0);
  return (
    <Surface level={2} className="h-full">
      <SurfaceHeader title="Search momentum" action={<span className="text-xs text-muted-foreground">Last 8 weeks</span>} />
      <div className="h-[220px] w-full">
        {empty ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Track a job to start charting your momentum.
          </div>
        ) : (
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
              <XAxis dataKey="label" {...axisProps} />
              <YAxis allowDecimals={false} width={40} {...axisProps} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--primary) / 0.3)" }} />
              <Area
                type="monotone" dataKey="applications" name="applications"
                stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#gradApplications)"
              />
              <Area
                type="monotone" dataKey="interviews" name="interviews"
                stroke="hsl(var(--chart-2))" strokeWidth={2} fill="url(#gradInterviews)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Surface>
  );
}

/** Pipeline conversion, widest stage first. */
export function PipelineFunnelChart({ data }: { data: FunnelPoint[] }) {
  const empty = data.every((d) => d.value === 0);
  return (
    <Surface level={2} className="h-full">
      <SurfaceHeader title="Pipeline conversion" action={<span className="text-xs text-muted-foreground">All time</span>} />
      <div className="h-[220px] w-full">
        {empty ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Nothing in the pipeline yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border-subtle))" horizontal={false} />
              <XAxis type="number" allowDecimals={false} {...axisProps} />
              <YAxis type="category" dataKey="label" width={74} {...axisProps} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--primary) / 0.06)" }} />
              <Bar dataKey="value" name="jobs" radius={[0, 6, 6, 0]} barSize={18}>
                {data.map((d) => (
                  <Cell key={d.label} fill={`hsl(var(--chart-${d.chart}))`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Surface>
  );
}
