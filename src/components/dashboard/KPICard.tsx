interface KPICardProps {
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}

export function KPICard({ label, value, trend, trendValue }: KPICardProps) {
  const trendColor = trend === 'up' 
    ? 'text-green-600' 
    : trend === 'down' 
    ? 'text-red-600' 
    : 'text-slate-500';

  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        {trend && trendValue && (
          <span className={`text-xs ${trendColor}`}>
            {trendIcon} {trendValue}
          </span>
        )}
      </div>
    </div>
  );
}
