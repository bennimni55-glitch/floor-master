'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface Waiter {
  id: string;
  full_name: string;
  role: string;
}

interface RosterEntry {
  shift_role: string;
  role_number: number | null;
}

const roleLabels: Record<string, string> = {
  waiter: 'מלצר/ית',
  bartender: 'ברמן/ית',
  hostess: 'מארח/ת',
  runner: 'ראנר/ית',
};

// אפשרויות התפקיד במשמרת
const SHIFT_ROLES: { value: string; label: string; hasNumber?: boolean; color: string }[] = [
  { value: 'regular', label: 'רגיל', color: 'bg-slate-100 text-slate-600' },
  { value: 'opening', label: '🌅 פתיחה', color: 'bg-amber-500 text-white' },
  { value: 'closing', label: '🌙 סגירה', color: 'bg-indigo-600 text-white' },
  { value: 'backup', label: '➕ תגבור', hasNumber: true, color: 'bg-green-600 text-white' },
  { value: 'standby', label: '⏸️ סטנד ביי', color: 'bg-orange-400 text-white' },
];

function roleDisplay(entry: RosterEntry): string {
  const r = SHIFT_ROLES.find((x) => x.value === entry.shift_role);
  if (!r) return 'רגיל';
  if (r.value === 'backup' && entry.role_number) return `➕ תגבור ${entry.role_number}`;
  return r.label;
}

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

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
  const [constraints, setConstraints] = useState<Record<string, Set<string>>>({});
  const [roster, setRoster] = useState<Record<string, Record<string, RosterEntry>>>({});
  const [weekStart] = useState<Date>(getWeekStart());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay());
  const [saving, setSaving] = useState<string | null>(null);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const load = useCallback(async () => {
    const supabase = createClient();
    const startStr = toDateStr(weekDates[0]);
    const endStr = toDateStr(weekDates[6]);

    const { data: waiterRows } = await supabase
      .from('waiters')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name');
    setWaiters(waiterRows || []);

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

    const { data: ros } = await supabase
      .from('daily_roster')
      .select('waiter_id, roster_date, shift_role, role_number')
      .gte('roster_date', startStr)
      .lte('roster_date', endStr);

    const rMap: Record<string, Record<string, RosterEntry>> = {};
    (ros || []).forEach((r) => {
      if (!rMap[r.roster_date]) rMap[r.roster_date] = {};
      rMap[r.roster_date][r.waiter_id] = {
        shift_role: r.shift_role || 'regular',
        role_number: r.role_number,
      };
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
  const rosteredToday = roster[selectedDateStr] || {};

  const availableWaiters = waiters.filter((w) => !blockedToday.has(w.id));
  const blockedWaiters = waiters.filter((w) => blockedToday.has(w.id));

  // הפרדה למלצרים וברמנים
  const availWaitersList = availableWaiters.filter((w) => w.role === 'waiter' || w.role === 'hostess' || w.role === 'runner');
  const availBartendersList = availableWaiters.filter((w) => w.role === 'bartender');

  async function toggleAssignment(waiterId: string) {
    const supabase = createClient();
    const isAssigned = !!rosteredToday[waiterId];
    setSaving(waiterId);

    if (isAssigned) {
      await supabase
        .from('daily_roster')
        .delete()
        .eq('roster_date', selectedDateStr)
        .eq('waiter_id', waiterId);
      setRoster((prev) => {
        const next = { ...prev };
        const day = { ...(next[selectedDateStr] || {}) };
        delete day[waiterId];
        next[selectedDateStr] = day;
        return next;
      });
    } else {
      await supabase
        .from('daily_roster')
        .insert({ roster_date: selectedDateStr, waiter_id: waiterId, shift_role: 'regular' });
      setRoster((prev) => {
        const next = { ...prev };
        const day = { ...(next[selectedDateStr] || {}) };
        day[waiterId] = { shift_role: 'regular', role_number: null };
        next[selectedDateStr] = day;
        return next;
      });
    }
    setSaving(null);
  }

  async function setRole(waiterId: string, shiftRole: string, roleNumber: number | null) {
    const supabase = createClient();
    setSaving(waiterId);
    await supabase
      .from('daily_roster')
      .update({ shift_role: shiftRole, role_number: roleNumber })
      .eq('roster_date', selectedDateStr)
      .eq('waiter_id', waiterId);
    setRoster((prev) => {
      const next = { ...prev };
      const day = { ...(next[selectedDateStr] || {}) };
      day[waiterId] = { shift_role: shiftRole, role_number: roleNumber };
      next[selectedDateStr] = day;
      return next;
    });
    setSaving(null);
  }

  function renderWaiterCard(w: Waiter) {
    const entry = rosteredToday[w.id];
    const assigned = !!entry;
    return (
      <div
        key={w.id}
        className={`rounded-lg border p-3 transition ${
          assigned ? 'border-rose-500 bg-rose-50' : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-800">{w.full_name}</div>
          <button
            onClick={() => toggleAssignment(w.id)}
            disabled={saving === w.id}
            className="text-xl"
          >
            {saving === w.id ? '⏳' : assigned ? '✅' : '➕'}
          </button>
        </div>

        {assigned && (
          <div className="mt-3 border-t border-rose-100 pt-3">
            <div className="mb-2 text-xs font-medium text-slate-500">
              תפקיד: <span className="font-bold text-rose-700">{roleDisplay(entry)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SHIFT_ROLES.map((sr) => {
                if (sr.value === 'backup') {
                  // כפתורי תגבור 1-4
                  return [1, 2, 3, 4].map((n) => {
                    const active = entry.shift_role === 'backup' && entry.role_number === n;
                    return (
                      <button
                        key={`backup-${n}`}
                        onClick={() => setRole(w.id, 'backup', n)}
                        disabled={saving === w.id}
                        className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                          active ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-green-100'
                        }`}
                      >
                        תגבור {n}
                      </button>
                    );
                  });
                }
                const active = entry.shift_role === sr.value;
                return (
                  <button
                    key={sr.value}
                    onClick={() => setRole(w.id, sr.value, null)}
                    disabled={saving === w.id}
                    className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                      active ? sr.color : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}
                  >
                    {sr.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  const assignedList = waiters.filter((w) => rosteredToday[w.id]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📅 סידור עבודה שבועי</h1>
            <p className="text-sm text-slate-500">שבץ עובדים וסמן תפקיד (פתיחה/סגירה/תגבור)</p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
          >
            ← חזרה לדשבורד
          </Link>
        </div>

        {loading ? (
          <div className="rounded-xl bg-white p-12 text-center text-slate-400 shadow-sm">טוען...</div>
        ) : (
          <>
            <div className="mb-6 grid grid-cols-7 gap-2">
              {weekDates.map((d, i) => {
                const ds = toDateStr(d);
                const availCount = waiters.length - (constraints[ds]?.size || 0);
                const assignedCount = Object.keys(roster[ds] || {}).length;
                const isSelected = i === selectedDay;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(i)}
                    className={`rounded-xl border-2 p-3 text-center transition ${
                      isSelected ? 'border-rose-600 bg-rose-50 shadow-md' : 'border-slate-200 bg-white hover:border-rose-300'
                    }`}
                  >
                    <div className="text-xs font-medium text-slate-500">{DAYS_HE[i]}</div>
                    <div className="text-lg font-bold text-slate-800">{d.getDate()}/{d.getMonth() + 1}</div>
                    <div className="mt-1 text-[11px] text-green-600">{availCount} זמינים</div>
                    {assignedCount > 0 && (
                      <div className="text-[11px] font-semibold text-rose-600">✓ {assignedCount} משובצים</div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">
                {DAYS_HE[selectedDay]} · {selectedDate.getDate()}/{selectedDate.getMonth() + 1}
              </h2>

              {/* מלצרים */}
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-bold text-blue-700">
                  🍽️ מלצרים ({availWaitersList.length})
                </h3>
                {availWaitersList.length === 0 ? (
                  <p className="text-sm text-slate-400">אין מלצרים זמינים</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {availWaitersList.map(renderWaiterCard)}
                  </div>
                )}
              </div>

              {/* ברמנים */}
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-bold text-purple-700">
                  🍸 ברמנים ({availBartendersList.length})
                </h3>
                {availBartendersList.length === 0 ? (
                  <p className="text-sm text-slate-400">אין ברמנים זמינים</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {availBartendersList.map(renderWaiterCard)}
                  </div>
                )}
              </div>

              {/* חסומים */}
              {blockedWaiters.length > 0 && (
                <div className="mb-2">
                  <h3 className="mb-2 text-sm font-semibold text-red-700">🔴 לא זמינים ({blockedWaiters.length})</h3>
                  <div className="flex flex-wrap gap-2">
                    {blockedWaiters.map((w) => (
                      <span key={w.id} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-600">
                        {w.full_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* סיכום */}
              {assignedList.length > 0 && (
                <div className="mt-5 rounded-lg bg-rose-50 p-4">
                  <div className="mb-2 text-sm font-semibold text-rose-800">
                    סיכום {DAYS_HE[selectedDay]}: {assignedList.length} משובצים
                  </div>
                  <div className="space-y-1">
                    {assignedList.map((w) => (
                      <div key={w.id} className="flex items-center gap-2 text-xs text-rose-700">
                        <span className="font-medium">{w.full_name}</span>
                        <span className="text-rose-500">· {roleDisplay(rosteredToday[w.id])}</span>
                      </div>
                    ))}
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
