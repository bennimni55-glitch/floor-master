'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Waiter {
  id: string;
  full_name: string;
  role: string;
}

const roleLabels: Record<string, string> = {
  waiter: 'מלצר/ית',
  bartender: 'ברמן/ית',
  hostess: 'מארח/ת',
  runner: 'ראנר/ית',
};

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

// תאריך יום ראשון של השבוע הנוכחי (שעון ישראל)
function getWeekStart(): Date {
  const now = new Date();
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = il.getDay();
  il.setDate(il.getDate() - day);
  il.setHours(0, 0, 0, 0);
  return il;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AdminRosterPage() {
  const [loading, setLoading] = useState(true);
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  // constraintsByDate[dateStr] = Set<waiter_id> שחסמו את היום
  const [constraints, setConstraints] = useState<Record<string, Set<string>>>({});
  // rosterByDate[dateStr] = Set<waiter_id> שמשובצים
  const [roster, setRoster] = useState<Record<string, Set<string>>>({});
  const [weekStart] = useState<Date>(getWeekStart());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
  const [saving, setSaving] = useState<string | null>(null);

  // 7 ימי השבוע כתאריכים
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const load = useCallback(async () => {
    const supabase = createClient();
    const startStr = toDateStr(weekDates[0]);
    const endStr = toDateStr(weekDates[6]);

    // עובדים פעילים
    const { data: waiterRows } = await supabase
      .from('waiters')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name');
    setWaiters(waiterRows || []);

    // אילוצים בשבוע הזה
    const { data: cons } = await supabase
      .from('availability_constraints')
      .select('waiter_id, constraint_date')
      .gte('constraint_date', startStr)
      .lte('constraint_date', endStr);

    const cMap: Record<string, Set<string>> = {};
    (cons || []).forEach((c) => {
      if (!cMap[c.constraint_date]) cMap[c.constraint_date] = new Set();
      cMap[c.constraint_date].add(c.waiter_id);
    });
    setConstraints(cMap);

    // שיבוצים בשבוע הזה
    const { data: ros } = await supabase
      .from('daily_roster')
      .select('waiter_id, roster_date')
      .gte('roster_date', startStr)
      .lte('roster_date', endStr);

    const rMap: Record<string, Set<string>> = {};
    (ros || []).forEach((r) => {
      if (!rMap[r.roster_date]) rMap[r.roster_date] = new Set();
      rMap[r.roster_date].add(r.waiter_id);
    });
    setRoster(rMap);

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedDate = weekDates[selectedDay];
  const selectedDateStr = toDateStr(selectedDate);
  const blockedToday = constraints[selectedDateStr] || new Set();
  const rosteredToday = roster[selectedDateStr] || new Set();

  // עובדים זמינים ביום הנבחר (לא חסמו)
  const availableWaiters = waiters.filter((w) => !blockedToday.has(w.id));
  const blockedWaiters = waiters.filter((w) => blockedToday.has(w.id));

  async function toggleAssignment(waiterId: string) {
    const supabase = createClient();
    const isAssigned = rosteredToday.has(waiterId);
    setSaving(waiterId);

    if (isAssigned) {
      // הסרה
      await supabase
        .from('daily_roster')
        .delete()
        .eq('roster_date', selectedDateStr)
        .eq('waiter_id', waiterId);
      setRoster((prev) => {
        const next = { ...prev };
        const s = new Set(next[selectedDateStr] || []);
        s.delete(waiterId);
        next[selectedDateStr] = s;
        return next;
      });
    } else {
      // הוספה
      await supabase
        .from('daily_roster')
        .insert({ roster_date: selectedDateStr, waiter_id: waiterId });
      setRoster((prev) => {
        const next = { ...prev };
        const s = new Set(next[selectedDateStr] || []);
        s.add(waiterId);
        next[selectedDateStr] = s;
        return next;
      });
    }
    setSaving(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        {/* כותרת */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📅 סידור עבודה שבועי</h1>
            <p className="text-sm text-slate-500">
              לחץ על יום כדי לראות מי זמין ולשבץ
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
          >
            ← חזרה לדשבורד
          </Link>
        </div>

        {loading ? (
          <div className="rounded-xl bg-white p-12 text-center text-slate-400 shadow-sm">
            טוען...
          </div>
        ) : (
          <>
            {/* שורת ימי השבוע */}
            <div className="mb-6 grid grid-cols-7 gap-2">
              {weekDates.map((d, i) => {
                const ds = toDateStr(d);
                const availCount = waiters.length - (constraints[ds]?.size || 0);
                const assignedCount = roster[ds]?.size || 0;
                const isSelected = i === selectedDay;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(i)}
                    className={`rounded-xl border-2 p-3 text-center transition ${
                      isSelected
                        ? 'border-rose-600 bg-rose-50 shadow-md'
                        : 'border-slate-200 bg-white hover:border-rose-300'
                    }`}
                  >
                    <div className="text-xs font-medium text-slate-500">{DAYS_HE[i]}</div>
                    <div className="text-lg font-bold text-slate-800">{d.getDate()}/{d.getMonth() + 1}</div>
                    <div className="mt-1 text-[11px] text-green-600">{availCount} זמינים</div>
                    {assignedCount > 0 && (
                      <div className="text-[11px] font-semibold text-rose-600">
                        ✓ {assignedCount} משובצים
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* היום הנבחר */}
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">
                {DAYS_HE[selectedDay]} · {selectedDate.getDate()}/{selectedDate.getMonth() + 1}
              </h2>

              {/* זמינים */}
              <div className="mb-5">
                <h3 className="mb-2 text-sm font-semibold text-green-700">
                  🟢 זמינים לעבודה ({availableWaiters.length})
                </h3>
                {availableWaiters.length === 0 ? (
                  <p className="text-sm text-slate-400">אף אחד לא זמין ביום זה</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {availableWaiters.map((w) => {
                      const assigned = rosteredToday.has(w.id);
                      return (
                        <button
                          key={w.id}
                          onClick={() => toggleAssignment(w.id)}
                          disabled={saving === w.id}
                          className={`flex items-center justify-between rounded-lg border p-3 text-right transition ${
                            assigned
                              ? 'border-rose-500 bg-rose-50'
                              : 'border-slate-200 bg-white hover:border-rose-300'
                          }`}
                        >
                          <div>
                            <div className="text-sm font-semibold text-slate-800">
                              {w.full_name}
                            </div>
                            <div className="text-xs text-slate-400">
                              {roleLabels[w.role] || w.role}
                            </div>
                          </div>
                          <div className="text-xl">
                            {saving === w.id ? '⏳' : assigned ? '✅' : '➕'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* חסומים */}
              {blockedWaiters.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-red-700">
                    🔴 לא זמינים ({blockedWaiters.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {blockedWaiters.map((w) => (
                      <span
                        key={w.id}
                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600"
                      >
                        {w.full_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* סיכום משובצים */}
              {rosteredToday.size > 0 && (
                <div className="mt-5 rounded-lg bg-rose-50 p-3">
                  <div className="text-sm font-semibold text-rose-800">
                    משובצים ל{DAYS_HE[selectedDay]}: {rosteredToday.size}
                  </div>
                  <div className="mt-1 text-xs text-rose-600">
                    {waiters
                      .filter((w) => rosteredToday.has(w.id))
                      .map((w) => w.full_name)
                      .join(' · ')}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
