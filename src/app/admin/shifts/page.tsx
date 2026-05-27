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
}

interface Assignment {
  id: string;
  shift_id: string;
  waiter_id: string;
  status: string;
  role_in_shift: string;
  waiters: {
    full_name: string;
    role: string;
  };
}

const shiftTypeLabels: Record<string, string> = {
  morning: 'בוקר',
  evening: 'ערב',
  closing: 'סגירה',
  double: 'כפולה',
};

const roleLabels: Record<string, string> = {
  waiter: 'מלצר',
  bartender: 'ברמן',
  hostess: 'מארחת',
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  return `${days[date.getDay()]} · ${date.getDate()}/${date.getMonth() + 1}`;
}

function formatTime(timeStr: string): string {
  return timeStr.substring(0, 5);
}

export default function AdminShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // טופס יצירת משמרת
  const [newShift, setNewShift] = useState({
    shift_date: '',
    shift_type: 'evening',
    start_time: '20:00',
    end_time: '02:00',
    required_waiters: 3,
    required_bartenders: 1,
    required_hostesses: 1,
    notes: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      const { data: shiftsData } = await supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', new Date().toISOString().split('T')[0])
        .order('shift_date', { ascending: true });

      const { data: assignmentsData } = await supabase
        .from('shift_assignments')
        .select('id, shift_id, waiter_id, status, role_in_shift, waiters(full_name, role)');

      setShifts((shiftsData || []) as Shift[]);
      setAssignments((assignmentsData || []) as unknown as Assignment[]);
    } catch (err) {
      console.error(err);
      setError('שגיאה בטעינה');
    } finally {
      setIsLoading(false);
    }
  }

  async function createShift(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading('create');
    setError(null);
    try {
      const res = await fetch('/api/admin/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newShift),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'שגיאה');

      setShowCreateForm(false);
      setNewShift({
        shift_date: '',
        shift_type: 'evening',
        start_time: '20:00',
        end_time: '02:00',
        required_waiters: 3,
        required_bartenders: 1,
        required_hostesses: 1,
        notes: '',
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteShift(shiftId: string) {
    if (!confirm('בטוח/ה למחוק את המשמרת?')) return;
    setActionLoading(shiftId);
    try {
      const res = await fetch(`/api/admin/shifts?id=${shiftId}`, {
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

  async function handleApproval(assignmentId: string, action: 'approve' | 'reject') {
    setActionLoading(assignmentId);
    setError(null);
    try {
      const res = await fetch('/api/admin/shifts/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignmentId, action }),
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

  function getShiftAssignments(shiftId: string) {
    return assignments.filter(a => a.shift_id === shiftId);
  }

  if (isLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a href="/" className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg hover:bg-slate-800 transition">
              🍷
            </a>
            <div>
              <h1 className="font-semibold text-slate-900 leading-tight">ניהול משמרות</h1>
              <p className="text-xs text-slate-500">צור משמרות ואשר בקשות</p>
            </div>
          </div>
          <a href="/admin" className="text-sm text-slate-500 hover:text-slate-900">
            ← דשבורד
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* כפתור + טופס יצירת משמרת */}
        <div className="mb-6">
          {!showCreateForm ? (
            <button
              onClick={() => setShowCreateForm(true)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-lg transition"
            >
              + צור משמרת חדשה
            </button>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-slate-900">משמרת חדשה</h3>
                <button onClick={() => setShowCreateForm(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>

              <form onSubmit={createShift} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">תאריך</label>
                    <input
                      type="date"
                      required
                      value={newShift.shift_date}
                      onChange={(e) => setNewShift({ ...newShift, shift_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">סוג</label>
                    <select
                      value={newShift.shift_type}
                      onChange={(e) => setNewShift({ ...newShift, shift_type: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    >
                      <option value="morning">בוקר</option>
                      <option value="evening">ערב</option>
                      <option value="closing">סגירה</option>
                      <option value="double">כפולה</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">שעת התחלה</label>
                    <input
                      type="time"
                      required
                      value={newShift.start_time}
                      onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">שעת סיום</label>
                    <input
                      type="time"
                      required
                      value={newShift.end_time}
                      onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">🍷 מלצרים</label>
                    <input
                      type="number"
                      min="0"
                      value={newShift.required_waiters}
                      onChange={(e) => setNewShift({ ...newShift, required_waiters: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">🍸 ברמנים</label>
                    <input
                      type="number"
                      min="0"
                      value={newShift.required_bartenders}
                      onChange={(e) => setNewShift({ ...newShift, required_bartenders: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">👋 מארחות</label>
                    <input
                      type="number"
                      min="0"
                      value={newShift.required_hostesses}
                      onChange={(e) => setNewShift({ ...newShift, required_hostesses: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">הערות (אופציונלי)</label>
                  <input
                    type="text"
                    value={newShift.notes}
                    onChange={(e) => setNewShift({ ...newShift, notes: e.target.value })}
                    placeholder="למשל: עומס צפוי, אירוע מיוחד..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={actionLoading === 'create'}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-sm font-medium py-2.5 rounded-lg transition"
                >
                  {actionLoading === 'create' ? 'יוצר...' : 'צור משמרת'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* רשימת משמרות */}
        {shifts.length === 0 ? (
          <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center">
            <div className="text-4xl mb-3">📅</div>
            <p className="text-sm text-slate-600">עדיין אין משמרות</p>
            <p className="text-xs text-slate-500 mt-1">צור משמרת חדשה כדי שמלצרים יוכלו לבקש</p>
          </div>
        ) : (
          <div className="space-y-4">
            {shifts.map((shift) => {
              const shiftAssignments = getShiftAssignments(shift.id);
              const pending = shiftAssignments.filter(a => a.status === 'requested');
              const approved = shiftAssignments.filter(a => a.status === 'approved');
              const totalRequired = shift.required_waiters + shift.required_bartenders + shift.required_hostesses;

              return (
                <div key={shift.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-slate-900">{formatDate(shift.shift_date)}</p>
                        <p className="text-sm text-slate-500 mt-0.5">
                          {formatTime(shift.start_time)} - {formatTime(shift.end_time)} · {shiftTypeLabels[shift.shift_type]}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-slate-600">
                          <strong>{approved.length}</strong>/{totalRequired}
                        </span>
                        <button
                          onClick={() => deleteShift(shift.id)}
                          disabled={actionLoading === shift.id}
                          className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                        >
                          🗑️ מחק
                        </button>
                      </div>
                    </div>

                    {shift.notes && (
                      <p className="text-xs text-slate-500 mt-2 bg-slate-50 rounded p-2">{shift.notes}</p>
                    )}
                  </div>

                  <div className="p-4">
                    {/* בקשות ממתינות */}
                    {pending.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-amber-700 mb-2">
                          ⏳ ממתינים לאישור ({pending.length})
                        </p>
                        <div className="space-y-2">
                          {pending.map((a) => (
                            <div key={a.id} className="flex justify-between items-center bg-amber-50 rounded-lg p-2.5">
                              <div>
                                <p className="text-sm font-medium text-slate-900">{a.waiters?.full_name}</p>
                                <p className="text-xs text-slate-500">{roleLabels[a.role_in_shift] || a.role_in_shift}</p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleApproval(a.id, 'approve')}
                                  disabled={actionLoading === a.id}
                                  className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-md font-medium"
                                >
                                  ✓ אשר
                                </button>
                                <button
                                  onClick={() => handleApproval(a.id, 'reject')}
                                  disabled={actionLoading === a.id}
                                  className="text-xs bg-red-100 hover:bg-red-200 disabled:opacity-50 text-red-700 px-3 py-1.5 rounded-md font-medium"
                                >
                                  ✗ דחה
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* מאושרים */}
                    {approved.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-green-700 mb-2">
                          ✅ משובצים ({approved.length})
                        </p>
                        <div className="space-y-1">
                          {approved.map((a) => (
                            <div key={a.id} className="flex justify-between items-center bg-green-50 rounded-lg px-2.5 py-1.5">
                              <p className="text-sm text-slate-900">{a.waiters?.full_name}</p>
                              <p className="text-xs text-slate-500">{roleLabels[a.role_in_shift] || a.role_in_shift}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {pending.length === 0 && approved.length === 0 && (
                      <p className="text-sm text-slate-400 text-center py-2">עדיין אף אחד לא ביקש</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
