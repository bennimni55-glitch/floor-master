'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AvailabilitySubmission } from '@/components/shifts/AvailabilitySubmission';

// The roster (daily_roster + availability_submissions) is the single shift system.
// The old request flow (shifts / shift_assignments) was removed 2026-10-20 — it had
// been dead since June; its tables remain in the DB as archive only.

export default function ShiftsPage() {
  const [activeTab, setActiveTab] = useState<'roster' | 'constraints'>('roster');
  const [myWaiterId, setMyWaiterId] = useState<string | null>(null);
  const [myRoster, setMyRoster] = useState<{ roster_date: string; shift_role: string; role_number: number | null }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: waiterRow } = await supabase
          .from('waiters')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();
        if (waiterRow) {
          setMyWaiterId(waiterRow.id);
          const today = new Date().toISOString().split('T')[0];
          const { data: rosterRows } = await supabase
            .from('daily_roster')
            .select('roster_date, shift_role, role_number')
            .eq('waiter_id', waiterRow.id)
            .gte('roster_date', today)
            .order('roster_date', { ascending: true });
          setMyRoster(rosterRows || []);
        }
      }
    } catch (err) {
      console.error(err);
      setError('שגיאה בטעינה');
    } finally {
      setIsLoading(false);
    }
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
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a href="/" className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg hover:bg-slate-800 transition">
              🍷
            </a>
            <div>
              <h1 className="font-semibold text-slate-900 leading-tight">משמרות</h1>
              <p className="text-xs text-slate-500">הסידור שלך והגשת זמינות</p>
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
              onClick={() => setActiveTab('roster')}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === 'roster'
                  ? 'text-slate-900 border-slate-900'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              📋 המשמרות שלי {myRoster.length > 0 && `(${myRoster.length})`}
            </button>
            <button
              onClick={() => setActiveTab('constraints')}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
                activeTab === 'constraints'
                  ? 'text-slate-900 border-slate-900'
                  : 'text-slate-500 border-transparent hover:text-slate-700'
              }`}
            >
              🗓️ הגשת זמינות
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

        {/* Tab: My Roster */}
        {activeTab === 'roster' && (
          <>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">📋 המשמרות שלי</h2>
              <p className="text-sm text-slate-500">הימים שבהם שובצת לעבודה</p>
            </div>
            {myRoster.length === 0 ? (
              <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center">
                <div className="text-4xl mb-3">📅</div>
                <p className="text-sm text-slate-600">עדיין לא שובצת למשמרות</p>
                <p className="text-xs text-slate-500 mt-1">המנהל ישבץ אותך לפי הזמינות שלך</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myRoster.map((r) => {
                  const d = new Date(r.roster_date + 'T00:00:00');
                  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
                  return (
                    <div key={r.roster_date} className="bg-white border-2 border-green-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
                      <div>
                        <div className="text-lg font-bold text-slate-900">
                          יום {days[d.getDay()]}
                        </div>
                        <div className="text-sm text-slate-500">
                          {d.getDate()}/{d.getMonth() + 1}/{d.getFullYear()}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {(() => {
                          const roleMap: Record<string, { label: string; cls: string }> = {
                            opening: { label: '🌅 פתיחה', cls: 'bg-amber-100 text-amber-700' },
                            closing: { label: '🌙 סגירה', cls: 'bg-indigo-100 text-indigo-700' },
                            backup: { label: `➕ תגבור ${r.role_number || ''}`.trim(), cls: 'bg-green-100 text-green-700' },
                            standby: { label: '⏸️ סטנד ביי', cls: 'bg-orange-100 text-orange-700' },
                            regular: { label: '✅ משובץ', cls: 'bg-green-100 text-green-700' },
                          };
                          const info = roleMap[r.shift_role] || roleMap.regular;
                          return (
                            <div className={`text-sm font-bold px-4 py-2 rounded-full ${info.cls}`}>
                              {info.label}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Tab: Availability */}
        {activeTab === 'constraints' && myWaiterId && (
          <AvailabilitySubmission waiterId={myWaiterId} />
        )}

      </main>
    </div>
  );
}
