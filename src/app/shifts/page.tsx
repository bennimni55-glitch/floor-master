'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Shift {
  id: string;
  shift_date: string;
  shift_type: string;
  start_time: string;
  end_time: string;
  required_waiters: number;
  required_bartenders: number;
  required_hostesses: number;
  notes: string | null;
  pending_requests: number;
  approved_count: number;
  i_requested: boolean;
  my_status: string | null;
}

interface Constraint {
  id: string;
  constraint_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  status: string;
  created_at: string;
}

const shiftTypeLabels: Record<string, string> = {
  morning: 'בוקר',
  evening: 'ערב',
  closing: 'סגירה',
  double: 'כפולה',
};

const statusLabels: Record<string, { text: string; color: string }> = {
  requested: { text: '⏳ ממתין לאישור', color: 'bg-amber-100 text-amber-800' },
  approved: { text: '✅ אושר', color: 'bg-green-100 text-green-800' },
  rejected: { text: '❌ נדחה', color: 'bg-red-100 text-red-800' },
  pending: { text: '⏳ ממתין', color: 'bg-amber-100 text-amber-800' },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return `${days[date.getDay()]} · ${date.getDate()}/${date.getMonth() + 1}`;
}

function formatTime(timeStr: string): string {
  return timeStr.substring(0, 5);
}

export default function ShiftsPage() {
  const [activeTab, setActiveTab] = useState<'shifts' | 'constraints'>('shifts');
  
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // טופס אילוץ חדש
  const [showConstraintForm, setShowConstraintForm] = useState(false);
  const [newConstraint, setNewConstraint] = useState({
    constraint_date: '',
    all_day: true,
    start_time: '20:00',
    end_time: '23:00',
    reason: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      const [shiftsRes, constraintsRes] = await Promise.all([
        supabase.from('available_shifts').select('*').order('shift_date', { ascending: true }),
        supabase
          .from('availability_constraints')
          .select('*')
          .gte('constraint_date', new Date().toISOString().split('T')[0])
          .order('constraint_date', { ascending: true }),
      ]);

      setShifts((shiftsRes.data || []) as Shift[]);
      setConstraints((constraintsRes.data || []) as Constraint[]);
    } catch (err) {
      console.error(err);
      setError('שגיאה בטעינה');
    } finally {
      setIsLoading(false);
    }
  }

  async function requestShift(shiftId: string) {
    setActionLoading(shiftId);
    setError(null);
    try {
      const res = await fetch('/api/shifts/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shift_id: shiftId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setActionLoading(null);
    }
  }

  async function cancelRequest(shiftId: string) {
    setActionLoading(shiftId);
    setError(null);
    try {
      const res = await fetch(`/api/shifts/request?shift_id=${shiftId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'שגיאה');
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setActionLoading(null);
    }
  }

  async function addConstraint(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading('add-constraint');
    setError(null);
    try {
      const res = await fetch('/api/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConstraint),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה');

      setShowConstraintForm(false);
      setNewConstraint({
        constraint_date: '',
        all_day: true,
        start_time: '20:00',
        end_time: '23:00',
        reason: '',
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteConstraint(constraintId: string) {
    if (!confirm('למחוק את האילוץ?')) return;
    setActionLoading(constraintId);
    try {
      const res = await fetch(`/api/availability?id=${constraintId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'שגיאה');
      }
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
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

  const myShifts = shifts.filter(s => s.i_requested);
  const availableShifts = shifts.filter(s => !s.i_requested);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a href="/" className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg hover:bg-slate-800 transition">
              🍷
            </a>
            <div>
              <h1 className="font-semibold text-slate-900 leading-tight">משמרות</h1>
              <p className="text-xs text-slate-500">בקש משמרות וסמן אילוצים</p>
            </div>
          </div>
          <a href="/" className="text-sm text-slate-500 hover:text-slate-900">
            ← חזרה
          </a>
        </div>

        {/* Tabs */}
        <div className="max-w-3xl mx-auto px-6">
          <div className="flex gap-1 border-b border-slate-100">
            <button
              onClick={() => setActiveTab('shifts')}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === 'shifts'
                  ? 'text-slate-900 border-slate-900'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              📅 משמרות פנויות
            </button>
            <button
              onClick={() => setActiveTab('constraints')}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === 'constraints'
                  ? 'text-slate-900 border-slate-900'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              🚫 האילוצים שלי {constraints.length > 0 && `(${constraints.length})`}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* Tab: Shifts */}
        {activeTab === 'shifts' && (
          <>
            {myShifts.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-3 px-1">
                  📋 המשמרות שלי ({myShifts.length})
                </h2>
                <div className="space-y-3">
                  {myShifts.map((shift) => {
                    const status = shift.my_status ? statusLabels[shift.my_status] : null;
                    const totalRequired = shift.required_waiters + shift.required_bartenders + shift.required_hostesses;
                    
                    return (
                      <div key={shift.id} className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-semibold text-slate-900">{formatDate(shift.shift_date)}</p>
                            <p className="text-sm text-slate-500 mt-0.5">
                              {formatTime(shift.start_time)} - {formatTime(shift.end_time)} · {shiftTypeLabels[shift.shift_type] || shift.shift_type}
                            </p>
                          </div>
                          {status && (
                            <span className={`text-xs px-2.5 py-1 rounded-md font-medium ${status.color}`}>
                              {status.text}
                            </span>
                          )}
                        </div>

                        {shift.notes && (
                          <p className="text-xs text-slate-500 mb-3 bg-slate-50 rounded p-2">{shift.notes}</p>
                        )}

                        <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                          <p className="text-xs text-slate-500">
                            {shift.approved_count}/{totalRequired} שובצו
                          </p>
                          {shift.my_status === 'requested' && (
                            <button
                              onClick={() => cancelRequest(shift.id)}
                              disabled={actionLoading === shift.id}
                              className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                            >
                              {actionLoading === shift.id ? 'מבטל...' : '🚫 בטל בקשה'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <h2 className="text-sm font-semibold text-slate-900 mb-3 px-1">
                ✋ משמרות פנויות לבקשה ({availableShifts.length})
              </h2>

              {availableShifts.length === 0 ? (
                <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center">
                  <div className="text-4xl mb-3">📅</div>
                  <p className="text-sm text-slate-600">אין משמרות פנויות כרגע</p>
                  <p className="text-xs text-slate-500 mt-1">המנהל עדיין לא פרסם משמרות חדשות</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {availableShifts.map((shift) => {
                    const totalRequired = shift.required_waiters + shift.required_bartenders + shift.required_hostesses;
                    const slotsLeft = totalRequired - shift.approved_count;
                    
                    return (
                      <div key={shift.id} className="bg-white rounded-xl border border-slate-200 p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-semibold text-slate-900">{formatDate(shift.shift_date)}</p>
                            <p className="text-sm text-slate-500 mt-0.5">
                              {formatTime(shift.start_time)} - {formatTime(shift.end_time)} · {shiftTypeLabels[shift.shift_type] || shift.shift_type}
                            </p>
                          </div>
                          <div className="text-left">
                            <p className="text-xs text-slate-500">דרושים</p>
                            <p className="text-lg font-bold text-slate-900">{slotsLeft}</p>
                          </div>
                        </div>

                        <div className="flex gap-3 text-xs text-slate-600 mb-3">
                          {shift.required_waiters > 0 && (
                            <span>🍷 {shift.required_waiters} מלצרים</span>
                          )}
                          {shift.required_bartenders > 0 && (
                            <span>🍸 {shift.required_bartenders} ברמנים</span>
                          )}
                          {shift.required_hostesses > 0 && (
                            <span>👋 {shift.required_hostesses} מארחות</span>
                          )}
                        </div>

                        {shift.notes && (
                          <p className="text-xs text-slate-500 mb-3 bg-slate-50 rounded p-2">{shift.notes}</p>
                        )}

                        {shift.pending_requests > 0 && (
                          <p className="text-xs text-amber-600 mb-3">
                            ⏳ {shift.pending_requests} עוד מלצרים ביקשו
                          </p>
                        )}

                        <button
                          onClick={() => requestShift(shift.id)}
                          disabled={actionLoading === shift.id}
                          className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-sm font-medium py-2.5 rounded-lg transition"
                        >
                          {actionLoading === shift.id ? 'שולח...' : '✋ אני רוצה את המשמרת'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab: Constraints */}
        {activeTab === 'constraints' && (
          <>
            {!showConstraintForm ? (
              <button
                onClick={() => setShowConstraintForm(true)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-lg transition mb-4"
              >
                + הוסף אילוץ חדש
              </button>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold text-slate-900">אילוץ חדש</h3>
                  <button onClick={() => setShowConstraintForm(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>

                <form onSubmit={addConstraint} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">תאריך</label>
                    <input
                      type="date"
                      required
                      value={newConstraint.constraint_date}
                      onChange={(e) => setNewConstraint({ ...newConstraint, constraint_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="all_day"
                      checked={newConstraint.all_day}
                      onChange={(e) => setNewConstraint({ ...newConstraint, all_day: e.target.checked })}
                      className="rounded"
                    />
                    <label htmlFor="all_day" className="text-sm text-slate-700">לא יכול/ה כל היום</label>
                  </div>

                  {!newConstraint.all_day && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">משעה</label>
                        <input
                          type="time"
                          value={newConstraint.start_time}
                          onChange={(e) => setNewConstraint({ ...newConstraint, start_time: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">עד שעה</label>
                        <input
                          type="time"
                          value={newConstraint.end_time}
                          onChange={(e) => setNewConstraint({ ...newConstraint, end_time: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">סיבה (אופציונלי)</label>
                    <input
                      type="text"
                      value={newConstraint.reason}
                      onChange={(e) => setNewConstraint({ ...newConstraint, reason: e.target.value })}
                      placeholder="למשל: לימודים, חתונה, רופא..."
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={actionLoading === 'add-constraint'}
                    className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-sm font-medium py-2.5 rounded-lg transition"
                  >
                    {actionLoading === 'add-constraint' ? 'שולח...' : 'הוסף אילוץ'}
                  </button>
                </form>
              </div>
            )}

            {constraints.length === 0 ? (
              <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center">
                <div className="text-4xl mb-3">📅</div>
                <p className="text-sm text-slate-600">אין אילוצים עתידיים</p>
                <p className="text-xs text-slate-500 mt-1">סמן ימים שלא יכול/ה לעבוד</p>
              </div>
            ) : (
              <div className="space-y-3">
                {constraints.map((c) => {
                  const status = statusLabels[c.status];
                  return (
                    <div key={c.id} className="bg-white rounded-xl border border-slate-200 p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold text-slate-900">{formatDate(c.constraint_date)}</p>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {c.all_day ? 'כל היום' : `${formatTime(c.start_time || '00:00')} - ${formatTime(c.end_time || '00:00')}`}
                          </p>
                        </div>
                        {status && (
                          <span className={`text-xs px-2.5 py-1 rounded-md font-medium ${status.color}`}>
                            {status.text}
                          </span>
                        )}
                      </div>

                      {c.reason && (
                        <p className="text-xs text-slate-500 mb-3 bg-slate-50 rounded p-2">סיבה: {c.reason}</p>
                      )}

                      <button
                        onClick={() => deleteConstraint(c.id)}
                        disabled={actionLoading === c.id}
                        className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                      >
                        {actionLoading === c.id ? 'מוחק...' : '🗑️ מחק אילוץ'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
