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
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const day = days[date.getDay()];
  return `${day} · ${date.getDate()}/${date.getMonth() + 1}`;
}

function formatTime(timeStr: string): string {
  return timeStr.substring(0, 5);
}

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadShifts();
  }, []);

  async function loadShifts() {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: dbError } = await supabase
        .from('available_shifts')
        .select('*')
        .order('shift_date', { ascending: true });

      if (dbError) throw dbError;
      setShifts((data || []) as Shift[]);
    } catch (err) {
      console.error(err);
      setError('שגיאה בטעינת המשמרות');
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
      await loadShifts();
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
      await loadShifts();
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

  // קיבוץ - המשמרות שלי קודם
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
              <p className="text-xs text-slate-500">בקש משמרות פנויות</p>
            </div>
          </div>
          <a href="/" className="text-sm text-slate-500 hover:text-slate-900">
            ← חזרה
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* המשמרות שלי */}
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

        {/* משמרות פנויות */}
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
      </main>
    </div>
  );
}
