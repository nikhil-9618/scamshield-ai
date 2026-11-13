'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DistributionSlice, RiskLevel, ScamCategory, TrendPoint } from '@scamshield/shared-types';
import { RISK_STYLES } from '@/lib/utils';

const tooltipStyle = {
  backgroundColor: '#151F30',
  border: '1px solid rgba(148,163,184,0.2)',
  borderRadius: 12,
  fontSize: 12,
  color: '#F8FAFC',
};

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
        <defs>
          <linearGradient id="scansFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366F1" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#EF4444" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#EF4444" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => value.slice(5)}
          tick={{ fill: '#94A3B8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} labelFormatter={(value) => `Date: ${value}`} />
        <Area type="monotone" dataKey="scans" name="All scans" stroke="#6366F1" strokeWidth={2} fill="url(#scansFill)" />
        <Area type="monotone" dataKey="highRisk" name="High / critical" stroke="#EF4444" strokeWidth={2} fill="url(#riskFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function RiskDonut({ data }: { data: DistributionSlice<RiskLevel>[] }) {
  const total = data.reduce((sum, slice) => sum + slice.count, 0);
  if (total === 0) {
    return <p className="py-12 text-center text-sm text-muted">No scored scans yet.</p>;
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie data={data.filter((slice) => slice.count > 0)} dataKey="count" nameKey="label" innerRadius={52} outerRadius={76} paddingAngle={2}>
            {data
              .filter((slice) => slice.count > 0)
              .map((slice) => (
                <Cell key={slice.key} fill={RISK_STYLES[slice.key].ring} stroke="#101827" strokeWidth={2} />
              ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="grid w-full grid-cols-2 gap-2 text-xs">
        {data.map((slice) => (
          <li key={slice.key} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white/[0.02] px-2 py-1.5">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: RISK_STYLES[slice.key].ring }} aria-hidden />
              {slice.label.replace(' risk', '')}
            </span>
            <span className="font-mono text-ink">{slice.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CategoryBars({ data }: { data: DistributionSlice<ScamCategory>[] }) {
  if (data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted">Category data appears after your first completed scan.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke="rgba(148,163,184,0.1)" />
        <XAxis type="number" allowDecimals={false} tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={128}
          tick={{ fill: '#94A3B8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(148,163,184,0.06)' }} />
        <Bar dataKey="count" name="Scans" fill="#06B6D4" radius={[0, 4, 4, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
