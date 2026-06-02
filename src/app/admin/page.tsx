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

const roleLabels: Record<string, string> = {
  waiter: 'מלצר',
  bartender: 'ברמן',
  hostess: 'מארחת',
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
  
  // מודאל שיבוץ
  const [scheduleModal, setScheduleModal] = useState<{
    waiterId: string;
    waiterName: string;
    date: string;
  } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const today = new Date().toISOString().split('T')[0];

      const [statsRes, categoriesRes, availabilityRes, assignmentsRes, shiftsRes, waitersRes] = await Promise.all([
        supabase.from('admin_dashboard_stats').select('*').order('rank'),
        supabase.from('category_weakness').select('*').limit(5),
        supabase.from('weekly_availability').select('*'),
        supabase.from('waiter_assignments').select('*'),
        supabase.from('shifts').select('*').gte('shift_date', today).order('shift_date'),
        supabase.from('waiters').select('id, full_name, role').eq('is_active', true).order('full_name'),
      ]);

      setWaiterStats((statsRes.data || []) as WaiterStat[]);
      setCategories((categoriesRes.data || []) as CategoryWeakness[]);
      setAvailability((availabilityRes.data || []) as AvailabilityRow[]);
      setAssignments((assignmentsRes.data || []) as Assignment[]);
      setShifts((shiftsRes.data || []) as Shift[]);
      setWaiters((waitersRes.data || []) as Waiter[]);
    } catch (err) {
      console.error(err);
      setError('שגיאה בטעינה');
    } finally {
      setIsLoading(false);
    }
  }

  // האם מלצר זמין ביום הזה?
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

  // האם מלצר משובץ למשמרת ביום הזה?
  function getWaiterAssignment(waiterId: string, dateStr: string): Assignment | null {
    return assignments.find(a => 
      a.waiter_id === waiterId && 
      a.shift_date === dateStr && 
      a.status === 'approved'
    ) || null;
  }

  // משמרות זמינות ביום מסוים
  function getShiftsForDate(dateStr: string): Shift[] {
    return shifts.filter(s => s.shift_date === dateStr);
  }

  // שיבוץ מלצר למשמרת
  async function assignWaiter(shiftId: string) {
    if (!scheduleModal) return;
    setActionLoading(shiftId);
    setError(null);
    
    try {
      const supabase = createClient();
      
      // מציאת ה-role של המלצר
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
              <p className="text-xs text-slate-500">סקירה, זמינות ושיבוץ צוות</p>
            </div>
          </div>
          <div className="flex gap-3">
            <a href="/admin/shifts" className="text-sm text-slate-500 hover:text-slate-900">
              ניהול משמרות
            </a>
            <span className="text-slate-300">·</span>
            <a href="/" className="text-sm text-slate-500 hover:text-slate-900">
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
