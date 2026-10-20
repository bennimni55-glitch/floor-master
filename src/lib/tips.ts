// Pure tip-allocation logic, extracted so it can be unit-tested.
//
// Fixed-rate roles (runner always, hostess when enabled in settings) are paid
// hourly from the pool FIRST — but capped: if their pay would exceed the pool,
// everyone's fixed pay is scaled down proportionally so the total distributed
// never exceeds the tip pool. The remainder is split by hours between waiters
// and bartenders.

export interface TipShiftInput {
  waiter_id: string;
  full_name: string;
  role: string;
  hours_worked: number;
}

export interface TipSettings {
  runnerRate: number;
  includeHostess: boolean;
  hostessRate: number;
}

export interface TipResultRow {
  waiter_id: string;
  full_name: string;
  role: string;
  hours: number;
  tip_amount: number;
  is_runner: boolean; // fixed-rate participant (runner / hostess)
}

export interface TipAllocation {
  results: TipResultRow[];
  totalFixedPay: number;
  remainingForWaiters: number;
  hourlyRateWaiters: number;
  capped: boolean; // true when fixed pay was scaled down to fit the pool
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeTipDistribution(
  tipsAmount: number,
  completedShifts: TipShiftInput[],
  settings: TipSettings
): TipAllocation {
  const fixedRate = (role: string): number | null => {
    if (role === 'runner') return settings.runnerRate;
    if (role === 'hostess' && settings.includeHostess) return settings.hostessRate;
    return null;
  };

  const fixed = completedShifts.filter((s) => fixedRate(s.role) != null);
  const hourly = completedShifts.filter(
    (s) => s.role === 'waiter' || s.role === 'bartender'
  );

  const rawFixedPay = fixed.reduce(
    (sum, s) => sum + Number(s.hours_worked) * (fixedRate(s.role) as number),
    0
  );
  // Cap: fixed pay can never exceed the pool — scale proportionally if it would.
  const scale = rawFixedPay > tipsAmount && rawFixedPay > 0 ? tipsAmount / rawFixedPay : 1;
  const capped = scale < 1;

  const fixedResults: TipResultRow[] = fixed.map((s) => ({
    waiter_id: s.waiter_id,
    full_name: s.full_name,
    role: s.role,
    hours: Number(s.hours_worked),
    tip_amount: round2(Number(s.hours_worked) * (fixedRate(s.role) as number) * scale),
    is_runner: true,
  }));

  const totalFixedPay = round2(fixedResults.reduce((sum, r) => sum + r.tip_amount, 0));
  const remainingForWaiters = round2(Math.max(0, tipsAmount - totalFixedPay));

  const totalHourlyHours = hourly.reduce((sum, w) => sum + Number(w.hours_worked), 0);
  const hourlyRateWaiters =
    totalHourlyHours > 0 && remainingForWaiters > 0
      ? remainingForWaiters / totalHourlyHours
      : 0;

  const hourlyResults: TipResultRow[] = hourly.map((w) => ({
    waiter_id: w.waiter_id,
    full_name: w.full_name,
    role: w.role,
    hours: Number(w.hours_worked),
    tip_amount: round2(Number(w.hours_worked) * hourlyRateWaiters),
    is_runner: false,
  }));

  return {
    results: [...fixedResults, ...hourlyResults],
    totalFixedPay,
    remainingForWaiters,
    hourlyRateWaiters,
    capped,
  };
}
