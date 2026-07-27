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

interface DayReq {
  waiters_needed: number;
  bartenders_needed: number;
}

const SHIFT_ROLES: { value: string; label: string; color: string }[] = [
  { value: 'regular', label: 'רגיל', color: 'bg-slate-100 text-slate-600' },
  { value: 'opening', label: '🌅 פתיחה', color: 'bg-amber-500 text-white' },
  { value: 'closing', label: '🌙 סגירה', color: 'bg-indigo-600 text-white' },
  { value: 'standby', label: '⏸️ סטנד ביי', color: 'bg-orange-400 text-white' },
];

function roleDisplay(entry: RosterEntry): string {
  if (entry.shift_role === 'backup') return `➕ תגבור ${entry.role_number || ''}`.trim();
  const r = SHIFT_ROLES.find((x) => x.value === entry.shift_role);
  return r ? r.label : 'רגיל';
}

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function getWeekStart(offsetWeeks: number = 0): Date {
  const now = new Date();
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = il.getDay();
  il.setDate(il.getDate() - day + offsetWeeks * 7);
  il.setHours(0, 0, 0, 0);
  return il;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export default function AdminRosterPage() {
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState<number>(1); // ברירת מחדל: השבוע הבא (שאליו מגישים)
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  // submissions[waiterId] = Set<dayIndex>
  const [submissions, setSubmissions] = useState<Record<string, Set<number>>>({});
  const [roster, setRoster] = useState<Record<string, Record<string, RosterEntry>>>({});
  const [reqs, setReqs] = useState<Record<string, DayReq>>({});
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);

  const weekStart = getWeekStart(weekOffset);
  const weekStartStr = toDateStr(weekStart);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const startStr = toDateStr(weekDates[0]);
    const endStr = toDateStr(weekDates[6]);

    const { data: waiterRows } = await supabase
      .from('waiters')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name');
    setWaiters(waiterRows || []);

    // הגשות זמינות לשבוע הזה
    const { data: subs } = await supabase
      .from('availability_submissions')
      .select('waiter_id, available_days')
      .eq('week_start', startStr);
    const sMap: Record<string, Set<number>> = {};
    (subs || []).forEach((s) => {
      sMap[s.waiter_id] = new Set(s.available_days);
    });
    setSubmissions(sMap);

    // שיבוצים קיימים
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

    // דרישות
    const { data: reqRows } = await supabase
      .from('day_requirements')
      .select('requirement_date, waiters_needed, bartenders_needed')
      .gte('requirement_date', startStr)
      .lte('requirement_date', endStr);
    const qMap: Record<string, DayReq> = {};
    (reqRows || []).forEach((q) => {
      qMap[q.requirement_date] = {
        waiters_needed: q.waiters_needed,
        bartenders_needed: q.bartenders_needed,
      };
    });
    setReqs(qMap);

    setLoading(false);
  }, [weekStartStr]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedDate = weekDates[selectedDay];
  const selectedDateStr = toDateStr(selectedDate);
  const rosteredToday = roster[selectedDateStr] || {};
  const dayReq = reqs[selectedDateStr] || { waiters_needed: 0, bartenders_needed: 0 };

  // זמינים = מי שהגיש והיום מסומן אצלו
  const isBartender = (w: Waiter) => w.role === 'bartender';
  const availToday = waiters.filter((w) => submissions[w.id]?.has(selectedDay));
  const availWaitersList = availToday.filter((w) => !isBartender(w));
  const availBartendersList = availToday.filter(isBartender);
  const notSubmitted = waiters.filter((w) => !submissions[w.id]);

  async function saveReq(field: 'waiters_needed' | 'bartenders_needed', val: number) {
    const supabase = createClient();
    const newReq = { ...dayReq, [field]: val };
    setReqs((p) => ({ ...p, [selectedDateStr]: newReq }));
    await supabase.from('day_requirements').upsert(
      {
        requirement_date: selectedDateStr,
        waiters_needed: newReq.waiters_needed,
        bartenders_needed: newReq.bartenders_needed,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'requirement_date' }
    );
  }

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

  // ============ 🪄 הצעת סידור אוטומטית ============
  async function suggestDraft() {
    setDraftMsg(null);
    const supabase = createClient();

    // 1. היסטוריית פתיחות (30 יום אחורה) לרוטציה - מי שפתח לאחרונה יורד בעדיפות
    const thirtyAgo = new Date();
    thirtyAgo.setDate(thirtyAgo.getDate() - 30);
    const { data: hist } = await supabase
      .from('daily_roster')
      .select('waiter_id, roster_date, shift_role')
      .gte('roster_date', toDateStr(thirtyAgo))
      .eq('shift_role', 'opening');
    const lastOpened: Record<string, string> = {};
    (hist || []).forEach((h) => {
      if (!lastOpened[h.waiter_id] || h.roster_date > lastOpened[h.waiter_id]) {
        lastOpened[h.waiter_id] = h.roster_date;
      }
    });

    // 2. ספירת שיבוצים בשבוע הנוכחי (בטיוטה) לאיזון עומס
    const weekCount: Record<string, number> = {};

    const newRoster: Record<string, Record<string, RosterEntry>> = {};
    let totalAssigned = 0;
    const gaps: string[] = [];

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const ds = toDateStr(weekDates[dayIdx]);
      const req = reqs[ds];
      if (!req || (req.waiters_needed === 0 && req.bartenders_needed === 0)) continue;

      const dayAvail = waiters.filter((w) => submissions[w.id]?.has(dayIdx));

      const pickGroup = (group: Waiter[], needed: number): Waiter[] => {
        // מיון: פחות שיבוצים השבוע קודם, אחר כך מי שפתח מזמן/מעולם
        const sorted = [...group].sort((a, b) => {
          const ca = weekCount[a.id] || 0;
          const cb = weekCount[b.id] || 0;
          if (ca !== cb) return ca - cb;
          const la = lastOpened[a.id] || '0000';
          const lb = lastOpened[b.id] || '0000';
          return la.localeCompare(lb);
        });
        return sorted.slice(0, needed);
      };

      const wGroup = dayAvail.filter((w) => !isBartender(w));
      const bGroup = dayAvail.filter(isBartender);
      const pickedW = pickGroup(wGroup, req.waiters_needed);
      const pickedB = pickGroup(bGroup, req.bartenders_needed);

      if (pickedW.length < req.waiters_needed)
        gaps.push(`${DAYS_HE[dayIdx]}: חסרים ${req.waiters_needed - pickedW.length} מלצרים`);
      if (pickedB.length < req.bartenders_needed)
        gaps.push(`${DAYS_HE[dayIdx]}: חסרים ${req.bartenders_needed - pickedB.length} ברמנים`);

      const dayMap: Record<string, RosterEntry> = {};

      const assignRoles = (picked: Waiter[]) => {
        picked.forEach((w, idx) => {
          let entry: RosterEntry;
          if (idx === 0) {
            entry = { shift_role: 'opening', role_number: null };
            lastOpened[w.id] = ds; // מעדכן רוטציה גם בתוך השבוע
          } else if (idx === picked.length - 1 && picked.length > 1) {
            entry = { shift_role: 'closing', role_number: null };
          } else {
            entry = { shift_role: 'backup', role_number: idx };
          }
          dayMap[w.id] = entry;
          weekCount[w.id] = (weekCount[w.id] || 0) + 1;
          totalAssigned++;
        });
      };

      assignRoles(pickedW);
      assignRoles(pickedB);
      newRoster[ds] = dayMap;
    }

    // 3. שמירה: מוחקים את השבוע ומכניסים את הטיוטה
    const startStr = toDateStr(weekDates[0]);
    const endStr = toDateStr(weekDates[6]);
    await supabase
      .from('daily_roster')
      .delete()
      .gte('roster_date', startStr)
      .lte('roster_date', endStr);

    const rows: { roster_date: string; waiter_id: string; shift_role: string; role_number: number | null }[] = [];
    Object.entries(newRoster).forEach(([ds, dayMap]) => {
      Object.entries(dayMap).forEach(([wid, e]) => {
        rows.push({ roster_date: ds, waiter_id: wid, shift_role: e.shift_role, role_number: e.role_number });
      });
    });
    if (rows.length > 0) {
      await supabase.from('daily_roster').insert(rows);
    }

    setRoster(newRoster);
    setDraftMsg(
      `🪄 טיוטה נוצרה: ${totalAssigned} שיבוצים.` +
        (gaps.length > 0 ? ` ⚠️ פערים: ${gaps.join(' · ')}` : ' כל הדרישות מולאו!') +
        ' עבור על הימים, שנה מה שצריך - הכל ניתן לעריכה.'
    );
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
          <button onClick={() => toggleAssignment(w.id)} disabled={saving === w.id} className="text-xl">
            {saving === w.id ? '⏳' : assigned ? '✅' : '➕'}
          </button>
        </div>
        {assigned && (
          <div className="mt-3 border-t border-rose-100 pt-3">
            <div className="mb-2 text-xs font-medium text-slate-500">
              תפקיד: <span className="font-bold text-rose-700">{roleDisplay(entry)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SHIFT_ROLES.map((sr) => (
                <button
                  key={sr.value}
                  onClick={() => setRole(w.id, sr.value, null)}
                  disabled={saving === w.id}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                    entry.shift_role === sr.value ? sr.color : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {sr.label}
                </button>
              ))}
              {[1, 2, 3, 4].map((n) => (
                <button
                  key={`b${n}`}
                  onClick={() => setRole(w.id, 'backup', n)}
                  disabled={saving === w.id}
                  className={`rounded px-2 py-1 text-[11px] font-medium transition ${
                    entry.shift_role === 'backup' && entry.role_number === n
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-green-100'
                  }`}
                >
                  תגבור {n}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const assignedList = waiters.filter((w) => rosteredToday[w.id]);
  const assignedWaitersCount = assignedList.filter((w) => !isBartender(w)).length;
  const assignedBartendersCount = assignedList.filter(isBartender).length;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📅 סידור עבודה</h1>
            <p className="text-sm text-slate-500">מבוסס הגשות זמינות · הזמינים = מי שהגיש</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset(0)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                weekOffset === 0 ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 shadow-sm'
              }`}
            >
              השבוע
            </button>
            <button
              onClick={() => setWeekOffset(1)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                weekOffset === 1 ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 shadow-sm'
              }`}
            >
              שבוע הבא
            </button>
            <Link
              href="/admin"
              className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100"
            >
              ← דשבורד
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-xl bg-white p-12 text-center text-slate-400 shadow-sm">טוען...</div>
        ) : (
          <>
            {/* מי לא הגיש */}
            {notSubmitted.length > 0 && (
              <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
                <div className="text-sm font-bold text-orange-700 mb-1">
                  ⚠️ טרם הגישו זמינות לשבוע זה ({notSubmitted.length})
                </div>
                <div className="text-xs text-orange-600">
                  {notSubmitted.map((w) => w.full_name).join(' · ')}
                </div>
              </div>
            )}

            {/* כפתור טיוטה */}
            <div className="mb-4 flex items-center gap-3 flex-wrap">
              <button
                onClick={suggestDraft}
                className="rounded-xl bg-gradient-to-l from-purple-600 to-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-md hover:shadow-lg transition"
              >
                🪄 הצע סידור אוטומטי לשבוע
              </button>
              <span className="text-xs text-slate-500">
                (מציע לפי זמינות + דרישות + רוטציית פתיחות. דורס את השיבוץ הקיים בשבוע - הכל ניתן לעריכה אחרי)
              </span>
            </div>
            {draftMsg && (
              <div className="mb-4 rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-purple-800">
                {draftMsg}
              </div>
            )}

            {/* ימי השבוע */}
            <div className="mb-6 grid grid-cols-7 gap-2">
              {weekDates.map((d, i) => {
                const ds = toDateStr(d);
                const availCount = waiters.filter((w) => submissions[w.id]?.has(i)).length;
                const assignedCount = Object.keys(roster[ds] || {}).length;
                const r = reqs[ds];
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
                    {r && (r.waiters_needed > 0 || r.bartenders_needed > 0) && (
                      <div className="text-[11px] text-slate-500">צריך {r.waiters_needed}+{r.bartenders_needed}</div>
                    )}
                    {assignedCount > 0 && (
                      <div className="text-[11px] font-semibold text-rose-600">✓ {assignedCount}</div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-lg font-bold text-slate-800">
                  {DAYS_HE[selectedDay]} · {selectedDate.getDate()}/{selectedDate.getMonth() + 1}
                </h2>
                {/* דרישות כמות ליום */}
                <div className="flex items-center gap-3 text-sm">
                  <label className="flex items-center gap-1.5">
                    🍽️ מלצרים:
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={dayReq.waiters_needed}
                      onChange={(e) => saveReq('waiters_needed', parseInt(e.target.value) || 0)}
                      className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-center"
                    />
                  </label>
                  <label className="flex items-center gap-1.5">
                    🍸 ברמנים:
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={dayReq.bartenders_needed}
                      onChange={(e) => saveReq('bartenders_needed', parseInt(e.target.value) || 0)}
                      className="w-14 rounded-lg border border-slate-300 px-2 py-1 text-center"
                    />
                  </label>
                </div>
              </div>

              {/* התקדמות מול דרישה */}
              {(dayReq.waiters_needed > 0 || dayReq.bartenders_needed > 0) && (
                <div className="mb-4 flex gap-4 text-xs">
                  <span className={assignedWaitersCount >= dayReq.waiters_needed ? 'text-green-600 font-bold' : 'text-orange-600 font-bold'}>
                    מלצרים: {assignedWaitersCount}/{dayReq.waiters_needed}
                  </span>
                  <span className={assignedBartendersCount >= dayReq.bartenders_needed ? 'text-green-600 font-bold' : 'text-orange-600 font-bold'}>
                    ברמנים: {assignedBartendersCount}/{dayReq.bartenders_needed}
                  </span>
                </div>
              )}

              {/* מלצרים זמינים */}
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-bold text-blue-700">🍽️ מלצרים שהגישו ליום זה ({availWaitersList.length})</h3>
                {availWaitersList.length === 0 ? (
                  <p className="text-sm text-slate-400">אף מלצר לא הגיש זמינות ליום זה</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{availWaitersList.map(renderWaiterCard)}</div>
                )}
              </div>

              {/* ברמנים זמינים */}
              <div className="mb-6">
                <h3 className="mb-2 text-sm font-bold text-purple-700">🍸 ברמנים שהגישו ליום זה ({availBartendersList.length})</h3>
                {availBartendersList.length === 0 ? (
                  <p className="text-sm text-slate-400">אף ברמן לא הגיש זמינות ליום זה</p>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{availBartendersList.map(renderWaiterCard)}</div>
                )}
              </div>

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
