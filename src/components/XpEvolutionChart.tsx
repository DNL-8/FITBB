import { useReducedMotion } from 'motion/react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface XpEvolutionPoint {
  shortLabel: string;
  fullDate: string;
  totalXp: number;
  dailyXp: number;
  sessions: number;
}

export default function XpEvolutionChart({ series }: { series: XpEvolutionPoint[] }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="w-full h-64 sm:h-72 min-w-0 pt-1">
      <ResponsiveContainer width="100%" height="100%" debounce={80}>
        <LineChart
          data={series}
          margin={{ top: 10, right: 12, left: 0, bottom: 4 }}
        >
          <CartesianGrid
            stroke="#27272A"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="shortLabel"
            stroke="#71717A"
            tick={{ fill: '#A1A1AA', fontSize: 11, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={{ stroke: '#27272A' }}
            interval={4}
          />
          <YAxis
            stroke="#71717A"
            tick={{ fill: '#A1A1AA', fontSize: 11, fontFamily: 'JetBrains Mono' }}
            tickLine={false}
            axisLine={false}
            width={52}
            allowDecimals={false}
            domain={['dataMin', 'auto']}
            tickFormatter={(value: number) =>
              value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value)
            }
          />
          <Tooltip
            cursor={{ stroke: 'rgba(249, 115, 22, 0.45)', strokeWidth: 1.5 }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const point = payload[0]?.payload as {
                fullDate: string;
                totalXp: number;
                dailyXp: number;
                sessions: number;
              };
              return (
                <div className="rounded-md bg-[#111113] border border-[#27272A] px-3.5 py-2.5 text-xs space-y-1">
                  <div className="font-semibold text-zinc-300 font-mono-tabular tabular-nums">
                    {point.fullDate}
                  </div>
                  <div className="font-bold text-orange-400 font-mono-tabular tabular-nums text-sm">
                    {point.totalXp.toLocaleString('pt-BR')} XP total
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono-tabular tabular-nums">
                    {point.dailyXp > 0
                      ? `+${point.dailyXp.toLocaleString('pt-BR')} XP em ${point.sessions} treino(s)`
                      : 'Nenhum treino registrado neste dia'}
                  </div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="totalXp"
            name="Total XP"
            stroke="#F97316"
            strokeWidth={2.5}
            isAnimationActive={!reduceMotion}
            animationDuration={400}
            dot={{ r: 2.5, fill: '#F97316', strokeWidth: 0 }}
            activeDot={{
              r: 5,
              fill: '#F97316',
              stroke: '#09090B',
              strokeWidth: 2,
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
