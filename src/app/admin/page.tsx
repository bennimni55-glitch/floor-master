'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface WaiterStat {
  id: string;
  full_name: string;
  role: string;
  email: string;
  total_points: number;
  streak_days: number;
  total_quiz_attempts: number;
  correct_answers: number;
  quiz_accuracy_pct: number | null;
  simulations_completed: number;
  avg_simulation_score: number | null;
  helper_questions_asked: number;
  last_activity: string | null;
  rank: number;
}

interface CategoryWeakness {
  category: string;
  total_attempts: number;
  correct: number;
  success_rate_pct: number;
}

interface AvailabilityRow {
  waiter_id: string;
  full_name: string;
  role: string;
  availability_id: string | null;
  date: string | null;
  all_day: boolean | null;
  start_time: string | null;
  end_time: string | null;
}

interface Assignment {
  assignment_id: string;
  waiter_id: string;
  shift_id: string;
  status: string;
  shift_date: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  waiter_name: string;
}

interface Shift {
  id: string;
  shift_date: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  required_waiters: number;
  required_bartenders: number;
  required_hostesses: number;
}

interface Waiter {
  id: string;
  full_name: string;
  role: string;
}

interface DayShift {
  clock_id: string;
  waiter_id: string;
  full_name: string;
  role: string;
  clock_date: string;
  clock_in: string;
  clock_out: string | null;
  hours_worked: number | null;
  status: string;
}

interface ActiveShift {
  shift_id: string;
  waiter_id: string;
  waiter_name: string;
  role: string;
  clock_in: string;
  minutes_active: number;
}

interface TipResult {
  waiter_id: string;
  full_name: string;
  role: string;
  hours: number;
  tip_amount: number;
  is_runner: boolean;
  confirmed_at?: string | null;
}

const RUNNER_RATE = 50;

const roleLabels: Record<string, string> = {
  waiter: 'מלצר',
  bartender: 'ברמן',
  hostess: 'מארחת',
  runner: 'ראנר',
  manager: 'מנהל',
  admin: 'מנהל ראשי',
};

const shiftTypeLabels: Record<string, string> = {
  morning: 'בוקר',
  evening: 'ערב',
  closing: 'סגירה',
  double: 'כפולה',
};

const categoryLabels: Record<string, string> = {
  procedures: 'נהלים',
  menu: 'תפריט',
  sales: 'מכירות',
  service: 'שירות',
  allergens: 'אלרגנים',
  cocktails: 'קוקטיילים',
  wine: 'יינות',
};

function getNext7Days(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }
  return days;
}

function dateToISOString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDayShortLabel(d: Date): string {
  const days = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  return days[d.getDay()];
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'אף פעם';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `לפני ${diffMins} דק׳`;
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays === 1) return 'אתמול';
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  return date.toLocaleDateString('he-IL');
}

function getInitials(name: string): string {
  const parts = name.split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function formatTime(timeStr: string): string {
  const date = new Date(timeStr);
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export default function AdminDashboard() {
  const [waiterStats, setWaiterStats] = useState<WaiterStat[]>([]);
  const [categories, setCategories] = useState<CategoryWeakness[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Modal שיבוץ
  const [scheduleModal, setScheduleModal] = useState<{
    waiterId: string;
    waiterName: string;
    date: string;
  } | null>(null);

  // ===== טיפים =====
  const [tipsDate, setTipsDate] = useState<string>(dateToISOString(new Date()));
  const [dayShifts, setDayShifts] = useState<DayShift[]>([]);
  const [totalTips, setTotalTips] = useState<string>('');
  const [tipResults, setTipResults] = useState<TipResult[] | null>(null);
  const [savedDistribution, setSavedDistribution] = useState<boolean>(false);
  const [activeShifts, setActiveShifts] = useState<ActiveShift[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadDayShifts(tipsDate);
  }, [tipsDate]);

  async function loadData() {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const today = new Date().toISOString().split('T')[0];

      const [statsRes, categoriesRes, availabilityRes, assignmentsRes, shiftsRes, waitersRes, activeShiftsRes] = await Promise.all([
        supabase.from('admin_dashboard_stats').select('*').order('rank'),
        supabase.from('category_weakness').select('*').limit(5),
        supabase.from('weekly_availability').select('*'),
        supabase.from('waiter_assignments').select('*'),
        supabase.from('shifts').select('*').gte('shift_date', today).order('shift_date'),
        supabase.from('waiters').select('id, full_name, role').eq('is_active', true).order('full_name'),
        supabase.from('shift_clock')
          .select('id, waiter_id, clock_in, waiters!inner(full_name, role)')
          .is('clock_out', null)
          .order('clock_in', { ascending: false }),
      ]);

      setWaiterStats((statsRes.data || []) as WaiterStat[]);
      setCategories((categoriesRes.data || []) as CategoryWeakness[]);
      setAvailability((availabilityRes.data || []) as AvailabilityRow[]);
      setAssignments((assignmentsRes.data || []) as Assignment[]);
      setShifts((shiftsRes.data || []) as Shift[]);
      setWaiters((waitersRes.data || []) as Waiter[]);

      // עיבוד משמרות פעילות
      const now = new Date();
      const activeData: ActiveShift[] = (activeShiftsRes.data || []).map((s: { id: string; waiter_id: string; clock_in: string; waiters: { full_name: string; role: string } | { full_name: string; role: string }[] }) => {
        const clockIn = new Date(s.clock_in);
        const minutes = Math.floor((now.getTime() - clockIn.getTime()) / 60000);
        const waiter = Array.isArray(s.waiters) ? s.waiters[0] : s.waiters;
        return {
          shift_id: s.id,
          waiter_id: s.waiter_id,
          waiter_name: waiter?.full_name || 'לא ידוע',
          role: waiter?.role || 'waiter',
          clock_in: s.clock_in,
          minutes_active: minutes,
        };
      });
      setActiveShifts(activeData);
    } catch (err) {
      console.error(err);
      setError('שגיאה בטעינה');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDayShifts(date: string) {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('todays_shifts')
        .select('*')
        .eq('clock_date', date);
      
      setDayShifts((data || []) as DayShift[]);
      setTipResults(null);
      setSavedDistribution(false);

      // בדיקה אם כבר יש חלוקה שמורה ליום הזה
      const { data: existing } = await supabase
        .from('tip_distributions')
        .select('id, total_tips')
        .eq('distribution_date', date)
        .maybeSingle();
      
      if (existing) {
        setTotalTips(String(existing.total_tips));
        await loadSavedDistribution(existing.id);
      } else {
        setTotalTips('');
      }
    } catch (err) {
      console.error('Error loading day shifts:', err);
    }
  }

  async function loadSavedDistribution(distributionId: string) {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('tip_distribution_details')
        .select('waiter_id, role, hours_worked, tip_amount, confirmed_at, waiters(full_name)')
        .eq('distribution_id', distributionId);
      
      if (data && data.length > 0) {
        const results: TipResult[] = data.map((d: { waiter_id: string; role: string; hours_worked: number; tip_amount: number; confirmed_at: string | null; waiters: { full_name: string } | { full_name: string }[] }) => ({
          waiter_id: d.waiter_id,
          full_name: Array.isArray(d.waiters) ? d.waiters[0]?.full_name : d.waiters?.full_name || 'לא ידוע',
          role: d.role,
          hours: Number(d.hours_worked),
          tip_amount: Number(d.tip_amount),
          is_runner: d.role === 'runner',
          confirmed_at: d.confirmed_at,
        }));
        setTipResults(results);
        setSavedDistribution(true);
      }
    } catch (err) {
      console.error('Error loading distribution:', err);
    }
  }

  function calculateTips() {
    const tipsAmount = parseFloat(totalTips);
    if (isNaN(tipsAmount) || tipsAmount <= 0) {
      setError('הכנס סכום טיפים תקין');
      return;
    }

    // מסננים רק משמרות שהסתיימו (יש להן clock_out)
    const completed = dayShifts.filter(s => s.clock_out && s.hours_worked && s.hours_worked > 0);
    
    if (completed.length === 0) {
      setError('אין משמרות שהסתיימו ביום הזה');
      return;
    }

    setError(null);

    // שלב 1: ראנרים מקבלים 50 ₪ × שעות
    const runners = completed.filter(s => s.role === 'runner');
    const nonRunners = completed.filter(s => s.role !== 'runner' && (s.role === 'waiter' || s.role === 'bartender'));
    
    const runnerResults: TipResult[] = runners.map(r => ({
      waiter_id: r.waiter_id,
      full_name: r.full_name,
      role: r.role,
      hours: Number(r.hours_worked),
      tip_amount: Math.round(Number(r.hours_worked) * RUNNER_RATE * 100) / 100,
      is_runner: true,
    }));

    const totalRunnerPay = runnerResults.reduce((sum, r) => sum + r.tip_amount, 0);
    const remainingForWaiters = tipsAmount - totalRunnerPay;

    // שלב 2: יתרה מתחלקת לפי שעות בין מלצרים+ברמנים
    const totalWaiterHours = nonRunners.reduce((sum, w) => sum + Number(w.hours_worked), 0);
    
    let waiterResults: TipResult[] = [];
    if (totalWaiterHours > 0 && remainingForWaiters > 0) {
      const hourlyRate = remainingForWaiters / totalWaiterHours;
      waiterResults = nonRunners.map(w => ({
        waiter_id: w.waiter_id,
        full_name: w.full_name,
        role: w.role,
        hours: Number(w.hours_worked),
        tip_amount: Math.round(Number(w.hours_worked) * hourlyRate * 100) / 100,
        is_runner: false,
      }));
    } else {
      waiterResults = nonRunners.map(w => ({
        waiter_id: w.waiter_id,
        full_name: w.full_name,
        role: w.role,
        hours: Number(w.hours_worked),
        tip_amount: 0,
        is_runner: false,
      }));
    }

    setTipResults([...runnerResults, ...waiterResults]);
    setSavedDistribution(false);
  }

  async function saveDistribution() {
    if (!tipResults || tipResults.length === 0) return;
    
    setActionLoading('save-tips');
    setError(null);
    
    try {
      const supabase = createClient();
      const tipsAmount = parseFloat(totalTips);
      
      const runnerHours = tipResults.filter(r => r.is_runner).reduce((s, r) => s + r.hours, 0);
      const waiterHours = tipResults.filter(r => !r.is_runner).reduce((s, r) => s + r.hours, 0);
      const totalRunnerPay = tipResults.filter(r => r.is_runner).reduce((s, r) => s + r.tip_amount, 0);
      const remaining = tipsAmount - totalRunnerPay;
      const hourlyRate = waiterHours > 0 ? remaining / waiterHours : 0;

      // מחיקת חלוקה ישנה אם קיימת
      const { data: existing } = await supabase
        .from('tip_distributions')
        .select('id')
        .eq('distribution_date', tipsDate)
        .maybeSingle();
      
      if (existing) {
        await supabase.from('tip_distribution_details').delete().eq('distribution_id', existing.id);
        await supabase.from('tip_distributions').delete().eq('id', existing.id);
      }

      // יצירת חלוקה חדשה
      const { data: newDist, error: distError } = await supabase
        .from('tip_distributions')
        .insert({
          distribution_date: tipsDate,
          total_tips: tipsAmount,
          runner_rate: RUNNER_RATE,
          total_runner_hours: runnerHours,
          total_waiter_hours: waiterHours,
          total_runner_pay: totalRunnerPay,
          remaining_for_waiters: remaining,
          hourly_rate_waiters: hourlyRate,
        })
        .select()
        .single();

      if (distError) throw distError;

      // הוספת פרטים לכל מלצר
      const details = tipResults.map(r => ({
        distribution_id: newDist.id,
        waiter_id: r.waiter_id,
        role: r.role,
        hours_worked: r.hours,
        tip_amount: r.tip_amount,
      }));

      const { error: detailsError } = await supabase
        .from('tip_distribution_details')
        .insert(details);

      if (detailsError) throw detailsError;

      setSavedDistribution(true);
      alert('חלוקת הטיפים נשמרה בהצלחה ✅');
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'שגיאה בשמירה');
    } finally {
      setActionLoading(null);
    }
  }

  function isWaiterAvailable(waiterId: string, dateStr: string): { available: boolean; partial: boolean; times?: string } {
    const row = availability.find(a => a.waiter_id === waiterId && a.date === dateStr);
    if (!row || !row.availability_id) return { available: false, partial: false };
    if (row.all_day) return { available: true, partial: false };
    return { 
      available: true, 
      partial: true, 
      times: `${row.start_time?.substring(0, 5)}-${row.end_time?.substring(0, 5)}` 
    };
  }

  function getWaiterAssignment(waiterId: string, dateStr: string): Assignment | null {
    return assignments.find(a => 
      a.waiter_id === waiterId && 
      a.shift_date === dateStr && 
      a.status === 'approved'
    ) || null;
  }

  function getShiftsForDate(dateStr: string): Shift[] {
    return shifts.filter(s => s.shift_date === dateStr);
  }

  async function manualClockOut(shiftId: string, waiterName: string) {
    if (!confirm(`לסגור את המשמרת של ${waiterName}?\n\nהשעה הנוכחית תרשם כשעת הסיום.`)) return;
    
    setActionLoading(shiftId);
    setError(null);
    
    try {
      const supabase = createClient();
      const now = new Date();
      
      // קודם נשלוף את clock_in כדי לחשב hours_worked
      const { data: shiftData, error: fetchError } = await supabase
        .from('shift_clock')
        .select('clock_in')
        .eq('id', shiftId)
        .single();
      
      if (fetchError || !shiftData) throw new Error('לא נמצאה משמרת');
      
      const clockIn = new Date(shiftData.clock_in);
      const hoursWorked = Number(((now.getTime() - clockIn.getTime()) / 3600000).toFixed(2));
      
      const { error: updateError } = await supabase
        .from('shift_clock')
        .update({
          clock_out: now.toISOString(),
          hours_worked: hoursWorked,
        })
        .eq('id', shiftId);
      
      if (updateError) throw updateError;
      
      await loadData();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'שגיאה בסגירת משמרת');
    } finally {
      setActionLoading(null);
    }
  }

  function formatActiveTime(minutes: number): string {
    if (minutes < 60) return `${minutes} דק׳`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}:${mins.toString().padStart(2, '0')} שעות`;
  }

  async function assignWaiter(shiftId: string) {
    if (!scheduleModal) return;
    setActionLoading(shiftId);
    setError(null);
    
    try {
      const supabase = createClient();
      const waiter = waiters.find(w => w.id === scheduleModal.waiterId);
      
      const { error: insertError } = await supabase
        .from('shift_assignments')
        .insert({
          shift_id: shiftId,
          waiter_id: scheduleModal.waiterId,
          role_in_shift: waiter?.role || 'waiter',
          status: 'approved',
          requested_by_waiter: false,
          confirmed: true,
          confirmed_at: new Date().toISOString(),
        });

      if (insertError) throw insertError;
      
      setScheduleModal(null);
      await loadData();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'שגיאה בשיבוץ');
    } finally {
      setActionLoading(null);
    }
  }

  if (isLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const next7Days = getNext7Days();
  const totalWaiters = waiterStats.length;
  const activeThisWeek = waiterStats.filter(w => {
    if (!w.last_activity) return false;
    const lastActivity = new Date(w.last_activity);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return lastActivity > weekAgo;
  }).length;

  const totalQuizAttempts = waiterStats.reduce((sum, w) => sum + (w.total_quiz_attempts || 0), 0);
  const totalCorrect = waiterStats.reduce((sum, w) => sum + (w.correct_answers || 0), 0);
  const avgAccuracy = totalQuizAttempts > 0 ? Math.round((totalCorrect / totalQuizAttempts) * 100) : 0;
  const totalSimulations = waiterStats.reduce((sum, w) => sum + (w.simulations_completed || 0), 0);

  const completedDayShifts = dayShifts.filter(s => s.clock_out && s.hours_worked);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a href="/" className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg hover:bg-slate-800 transition">
              🍷
            </a>
            <div>
              <h1 className="font-semibold text-slate-900 leading-tight">דשבורד מנהל</h1>
              <p className="text-xs text-slate-500">סקירה, זמינות, שיבוץ וחלוקת טיפים</p>
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <a 
              href="/admin/team" 
              className="text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
            >
              👥 מצב הצוות
            </a>
            <a 
              href="/admin/training" 
              className="text-sm font-medium bg-rose-700 text-white hover:bg-rose-800 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
            >
              📚 מעקב הדרכות
            </a>
            <a href="/admin/shifts" className="text-sm text-slate-500 hover:text-slate-900 px-2">
              ניהול משמרות
            </a>
            <a href="/" className="text-sm text-slate-500 hover:text-slate-900 px-2">
              ← בית
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">סך הצוות</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-slate-900">{totalWaiters}</p>
              <p className="text-xs text-slate-500">פעילים</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">פעילים השבוע</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-slate-900">{activeThisWeek}</p>
              <p className="text-xs text-slate-500">/ {totalWaiters}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">דיוק קוויז ממוצע</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-slate-900">{avgAccuracy}%</p>
              <p className="text-xs text-slate-500">({totalQuizAttempts})</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">סימולציות</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-slate-900">{totalSimulations}</p>
              <p className="text-xs text-slate-500">הושלמו</p>
            </div>
          </div>
        </div>

        {/* ===== 🟢 מי במשמרת עכשיו ===== */}
        <div className={`bg-white rounded-xl border overflow-hidden mb-6 ${activeShifts.length > 0 ? 'border-green-300 shadow-sm' : 'border-slate-200'}`}>
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                {activeShifts.length > 0 && (
                  <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                )}
                <div>
                  <h3 className="font-semibold text-slate-900">
                    🟢 במשמרת עכשיו ({activeShifts.length})
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeShifts.length === 0 
                      ? 'אין מלצרים במשמרת ברגע זה' 
                      : 'מלצרים שלחצו "התחל משמרת" ועדיין לא סיימו'}
                  </p>
                </div>
              </div>
              <button
                onClick={loadData}
                className="text-xs text-slate-600 hover:text-slate-900 px-3 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 transition"
              >
                ↻ רענן
              </button>
            </div>
          </div>

          {activeShifts.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <div className="text-4xl mb-2">😴</div>
              <p className="text-sm">אף אחד לא במשמרת כרגע</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeShifts.map((shift) => {
                const isLong = shift.minutes_active > 480; // יותר מ-8 שעות
                return (
                  <div key={shift.shift_id} className="p-4 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-semibold">
                        {shift.waiter_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-slate-900">{shift.waiter_name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            shift.role === 'bartender' ? 'bg-purple-100 text-purple-700' :
                            shift.role === 'runner' ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {shift.role === 'bartender' ? 'ברמן/ית' : 
                             shift.role === 'runner' ? 'ראנר/ית' : 'מלצר/ית'}
                          </span>
                          {isLong && (
                            <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-700">
                              ⚠️ משמרת ארוכה
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          התחיל ב-{new Date(shift.clock_in).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })} · 
                          <span className="font-medium text-green-700"> {formatActiveTime(shift.minutes_active)}</span>
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => manualClockOut(shift.shift_id, shift.waiter_name)}
                      disabled={actionLoading === shift.shift_id}
                      className="text-sm bg-red-50 text-red-700 hover:bg-red-100 px-3 py-1.5 rounded-md transition border border-red-200 disabled:opacity-50"
                    >
                      {actionLoading === shift.shift_id ? '...' : '🚪 סגור משמרת'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ===== 💰 חלוקת טיפים יומית - חדש! ===== */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-slate-900">💰 חלוקת טיפים יומית</h3>
                <p className="text-xs text-slate-500 mt-0.5">ראנרים: 50₪/שעה · מלצרים+ברמנים: יתרה לפי שעות</p>
              </div>
              <input
                type="date"
                value={tipsDate}
                onChange={(e) => setTipsDate(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="p-5">
            {completedDayShifts.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <div className="text-4xl mb-2">⏰</div>
                <p className="text-sm">אין משמרות שהסתיימו ב-{new Date(tipsDate).toLocaleDateString('he-IL')}</p>
                <p className="text-xs mt-1">בחר תאריך אחר או חכה שמלצרים יסיימו את המשמרת</p>
              </div>
            ) : (
              <>
                {/* טבלת מי עבד */}
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-right p-3 font-medium text-slate-700">מלצר</th>
                        <th className="text-right p-3 font-medium text-slate-700">תפקיד</th>
                        <th className="text-right p-3 font-medium text-slate-700">כניסה</th>
                        <th className="text-right p-3 font-medium text-slate-700">יציאה</th>
                        <th className="text-right p-3 font-medium text-slate-700">שעות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {completedDayShifts.map((shift) => (
                        <tr key={shift.clock_id} className="border-t border-slate-100">
                          <td className="p-3 font-medium text-slate-900">{shift.full_name}</td>
                          <td className="p-3">
                            <span className={`text-xs px-2 py-1 rounded ${
                              shift.role === 'runner' 
                                ? 'bg-amber-100 text-amber-700' 
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {roleLabels[shift.role] || shift.role}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">{formatTime(shift.clock_in)}</td>
                          <td className="p-3 text-slate-600">{shift.clock_out ? formatTime(shift.clock_out) : '—'}</td>
                          <td className="p-3 font-semibold text-slate-900">
                            {Number(shift.hours_worked).toFixed(2)} שעות
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* שדה סכום + כפתור חישוב */}
                <div className="flex flex-wrap items-end gap-3 p-4 bg-slate-50 rounded-xl mb-4">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-slate-700 mb-1">סך הטיפים היומי (₪)</label>
                    <input
                      type="number"
                      value={totalTips}
                      onChange={(e) => setTotalTips(e.target.value)}
                      placeholder="לדוגמה: 1500"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <button
                    onClick={calculateTips}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-medium px-6 py-2 rounded-lg transition"
                  >
                    חשב חלוקה
                  </button>
                </div>

                {/* תוצאות */}
                {tipResults && tipResults.length > 0 && (
                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-semibold text-slate-900">📊 תוצאות החלוקה</h4>
                      {!savedDistribution ? (
                        <button
                          onClick={saveDistribution}
                          disabled={actionLoading === 'save-tips'}
                          className="bg-green-600 hover:bg-green-700 disabled:bg-slate-400 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition"
                        >
                          {actionLoading === 'save-tips' ? 'שומר...' : '💾 שמור חלוקה'}
                        </button>
                      ) : (
                        <span className="text-sm text-green-600 font-medium">✅ נשמר</span>
                      )}
                    </div>

                    <div className="space-y-2">
                      {tipResults.map((r) => (
                        <div key={r.waiter_id} className={`flex items-center justify-between p-3 rounded-lg ${
                          r.is_runner ? 'bg-amber-50' : 'bg-blue-50'
                        }`}>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-sm font-medium border border-slate-200">
                              {getInitials(r.full_name)}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900">{r.full_name}</p>
                              <p className="text-xs text-slate-500">
                                {roleLabels[r.role]} · {r.hours.toFixed(2)} שעות
                                {r.is_runner && ` × ${RUNNER_RATE}₪`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="text-xl font-bold text-slate-900">
                              ₪{r.tip_amount.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                            {savedDistribution && (
                              r.confirmed_at ? (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-md whitespace-nowrap">
                                  ✅ אושר {new Date(r.confirmed_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' })}
                                </span>
                              ) : (
                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-md whitespace-nowrap">
                                  🟡 ממתין
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* סיכום */}
                    <div className="mt-4 p-4 bg-slate-900 text-white rounded-xl">
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-slate-400 text-xs">סך טיפים</p>
                          <p className="text-lg font-bold">₪{parseFloat(totalTips).toLocaleString('he-IL')}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs">לראנרים</p>
                          <p className="text-lg font-bold">
                            ₪{tipResults.filter(r => r.is_runner).reduce((s, r) => s + r.tip_amount, 0).toLocaleString('he-IL', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs">למלצרים+ברמנים</p>
                          <p className="text-lg font-bold">
                            ₪{tipResults.filter(r => !r.is_runner).reduce((s, r) => s + r.tip_amount, 0).toLocaleString('he-IL', { minimumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* טבלת זמינות שבועית */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
          <div className="p-5 border-b border-slate-100">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">📅 לוח זמינות ושיבוץ - השבוע הקרוב</h3>
                <p className="text-xs text-slate-500 mt-0.5">לחץ/י על תא ירוק כדי לשבץ למשמרת</p>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-4 bg-green-100 border border-green-300 rounded"></span>
                  <span className="text-slate-600">זמין</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-4 bg-amber-100 border border-amber-300 rounded"></span>
                  <span className="text-slate-600">חלקי</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-4 bg-blue-100 border border-blue-300 rounded"></span>
                  <span className="text-slate-600">משובץ</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-4 bg-slate-50 border border-slate-200 rounded"></span>
                  <span className="text-slate-600">לא זמין</span>
                </div>
              </div>
            </div>
          </div>

          {waiters.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              <div className="text-4xl mb-2">👥</div>
              <p className="text-sm">אין מלצרים פעילים במערכת</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-slate-200">
                    <th className="text-right p-3 font-medium text-slate-700 sticky right-0 bg-slate-50 min-w-[140px]">
                      מלצר
                    </th>
                    {next7Days.map((day, i) => (
                      <th key={i} className="p-2 font-medium text-slate-700 text-center min-w-[90px]">
                        <div className="text-xs">{getDayShortLabel(day)}</div>
                        <div className="text-xs text-slate-500 font-normal">
                          {day.getDate()}/{day.getMonth() + 1}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {waiters.map((w) => (
                    <tr key={w.id} className="border-b border-slate-100 hover:bg-slate-25">
                      <td className="p-3 sticky right-0 bg-white">
                        <p className="font-medium text-slate-900">{w.full_name}</p>
                        <p className="text-xs text-slate-500">{roleLabels[w.role] || w.role}</p>
                      </td>
                      {next7Days.map((day, i) => {
                        const dateStr = dateToISOString(day);
                        const avail = isWaiterAvailable(w.id, dateStr);
                        const assignment = getWaiterAssignment(w.id, dateStr);
                        
                        let bgClass = 'bg-slate-50 border-slate-200';
                        let symbol = '—';
                        let textColor = 'text-slate-400';
                        let title = 'לא הצהיר זמינות';
                        let clickable = false;
                        
                        if (assignment) {
                          bgClass = 'bg-blue-100 border-blue-300';
                          symbol = '✓';
                          textColor = 'text-blue-700';
                          title = `משובץ למשמרת ${shiftTypeLabels[assignment.shift_type] || assignment.shift_type}`;
                        } else if (avail.available && avail.partial) {
                          bgClass = 'bg-amber-100 border-amber-300 hover:bg-amber-200 cursor-pointer';
                          symbol = '⏰';
                          textColor = 'text-amber-700';
                          title = `זמין ${avail.times} - לחץ לשיבוץ`;
                          clickable = true;
                        } else if (avail.available) {
                          bgClass = 'bg-green-100 border-green-300 hover:bg-green-200 cursor-pointer';
                          symbol = '✓';
                          textColor = 'text-green-700';
                          title = 'זמין כל היום - לחץ לשיבוץ';
                          clickable = true;
                        }
                        
                        return (
                          <td key={i} className="p-2 text-center">
                            <button
                              onClick={() => {
                                if (clickable) {
                                  setScheduleModal({
                                    waiterId: w.id,
                                    waiterName: w.full_name,
                                    date: dateStr,
                                  });
                                }
                              }}
                              disabled={!clickable}
                              title={title}
                              className={`inline-flex items-center justify-center w-12 h-12 ${bgClass} border-2 rounded-md ${textColor} font-medium transition`}
                            >
                              {symbol}
                            </button>
                            {avail.partial && avail.times && !assignment && (
                              <p className="text-[10px] text-amber-700 mt-0.5">
                                {avail.times}
                              </p>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Leaderboard + Categories */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">🏆 לוח מצטיינים</h3>
              <p className="text-xs text-slate-500 mt-0.5">דירוג לפי ניקוד מצטבר</p>
            </div>

            {waiterStats.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                <div className="text-4xl mb-2">👤</div>
                <p className="text-sm">עדיין אין מלצרים פעילים</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {waiterStats.map((waiter) => (
                  <div key={waiter.id} className="p-4 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-8 text-lg font-bold text-slate-400">
                        {waiter.rank === 1 ? '🥇' : waiter.rank === 2 ? '🥈' : waiter.rank === 3 ? '🥉' : `#${waiter.rank}`}
                      </div>
                      <div className="w-10 h-10 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {getInitials(waiter.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-slate-900 truncate">{waiter.full_name}</p>
                          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                            {roleLabels[waiter.role] || waiter.role}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span>🎯 {waiter.quiz_accuracy_pct || 0}%</span>
                          <span>🎮 {waiter.simulations_completed}</span>
                          <span>💡 {waiter.helper_questions_asked}</span>
                          <span className="text-slate-400">· {formatRelativeTime(waiter.last_activity)}</span>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-xl font-bold text-slate-900">{waiter.total_points || 0}</p>
                        <p className="text-xs text-slate-500">נקודות</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">⚠️ איפה הצוות נופל</h3>
              <p className="text-xs text-slate-500 mt-0.5">קטגוריות לחיזוק</p>
            </div>

            {categories.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                <div className="text-4xl mb-2">📊</div>
                <p className="text-sm">אין מספיק נתונים</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {categories.map((cat) => {
                  const isWeak = cat.success_rate_pct < 70;
                  const isStrong = cat.success_rate_pct >= 85;
                  return (
                    <div key={cat.category}>
                      <div className="flex justify-between items-center mb-1.5">
                        <p className="text-sm font-medium text-slate-900">
                          {categoryLabels[cat.category] || cat.category}
                        </p>
                        <p className={`text-sm font-semibold ${
                          isWeak ? 'text-red-600' : isStrong ? 'text-green-600' : 'text-amber-600'
                        }`}>
                          {cat.success_rate_pct}%
                        </p>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isWeak ? 'bg-red-500' : isStrong ? 'bg-green-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${cat.success_rate_pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {cat.correct}/{cat.total_attempts} נכון
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* מודאל שיבוץ */}
      {scheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setScheduleModal(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-semibold text-slate-900">שיבוץ למשמרת</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {scheduleModal.waiterName} · {new Date(scheduleModal.date).toLocaleDateString('he-IL')}
                </p>
              </div>
              <button onClick={() => setScheduleModal(null)} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
                ×
              </button>
            </div>

            {(() => {
              const dayShifts = getShiftsForDate(scheduleModal.date);
              
              if (dayShifts.length === 0) {
                return (
                  <div className="text-center py-6">
                    <div className="text-4xl mb-2">📅</div>
                    <p className="text-sm text-slate-600 mb-3">אין משמרות מוגדרות ביום הזה</p>
                    <a
                      href="/admin/shifts"
                      className="inline-block bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
                    >
                      + צור משמרת ידנית
                    </a>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 mb-2">בחר משמרת:</p>
                  {dayShifts.map((shift) => (
                    <button
                      key={shift.id}
                      onClick={() => assignWaiter(shift.id)}
                      disabled={actionLoading === shift.id}
                      className="w-full text-right bg-slate-50 hover:bg-slate-100 disabled:opacity-50 rounded-lg p-3 transition"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {shiftTypeLabels[shift.shift_type] || shift.shift_type}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {shift.start_time.substring(0, 5)} - {shift.end_time.substring(0, 5)}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        🍷 {shift.required_waiters} · 🍸 {shift.required_bartenders} · 👋 {shift.required_hostesses}
                      </p>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
