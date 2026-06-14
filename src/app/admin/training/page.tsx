'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface ModuleInfo {
  id: string;
  title: string;
  icon: string;
  display_order: number;
  total_lessons: number;
}

interface WaiterProgress {
  waiter_id: string;
  full_name: string;
  role: string;
  // module_id -> completed count this... (all-time)
  byModule: Record<string, number>;
}

const roleLabels: Record<string, string> = {
  waiter: 'מלצר/ית',
  bartender: 'ברמן/ית',
  hostess: 'מארח/ת',
  runner: 'ראנר/ית',
};

// יום ראשון האחרון בשעון ישראל
function lastSundayISO(): string {
  const now = new Date();
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = il.getDay();
  il.setDate(il.getDate() - day);
  il.setHours(0, 0, 0, 0);
  return il.toISOString();
}

export default function AdminTrainingPage() {
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [waiters, setWaiters] = useState<WaiterProgress[]>([]);
  const [weeklyDone, setWeeklyDone] = useState<Record<string, number>>({});
  const SERVICE_MODULE_ID = '7b9da855-186c-4386-8199-02efecedfd95';

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();

      // 1. מודולים פעילים + ספירת שיעורים
      const { data: mods } = await supabase
        .from('training_modules')
        .select('id, title, icon, display_order')
        .eq('is_active', true)
        .order('display_order');

      const { data: lessons } = await supabase
        .from('training_lessons')
        .select('id, module_id')
        .eq('is_active', true);

      const lessonCountByModule: Record<string, number> = {};
      const lessonToModule: Record<string, string> = {};
      (lessons || []).forEach((l) => {
        lessonCountByModule[l.module_id] = (lessonCountByModule[l.module_id] || 0) + 1;
        lessonToModule[l.id] = l.module_id;
      });

      const moduleList: ModuleInfo[] = (mods || []).map((m) => ({
        id: m.id,
        title: m.title,
        icon: m.icon,
        display_order: m.display_order,
        total_lessons: lessonCountByModule[m.id] || 0,
      }));
      setModules(moduleList);

      // 2. עובדים
      const { data: waiterRows } = await supabase
        .from('waiters')
        .select('id, full_name, role')
        .eq('is_active', true)
        .order('full_name');

      // 3. כל ההתקדמות (שהושלמה)
      const { data: progress } = await supabase
        .from('training_progress')
        .select('waiter_id, lesson_id, completed_at')
        .not('completed_at', 'is', null);

      const weekStart = lastSundayISO();

      // ספירה לכל עובד: לכל מודול כמה שיעורים ייחודיים הושלמו (all-time)
      const byWaiterModule: Record<string, Record<string, Set<string>>> = {};
      // ספירת מודול השירות השבוע
      const serviceWeekly: Record<string, Set<string>> = {};

      (progress || []).forEach((p) => {
        const modId = lessonToModule[p.lesson_id];
        if (!modId) return;
        if (!byWaiterModule[p.waiter_id]) byWaiterModule[p.waiter_id] = {};
        if (!byWaiterModule[p.waiter_id][modId]) byWaiterModule[p.waiter_id][modId] = new Set();
        byWaiterModule[p.waiter_id][modId].add(p.lesson_id);

        // שבועי - רק מודול השירות
        if (modId === SERVICE_MODULE_ID && p.completed_at && p.completed_at >= weekStart) {
          if (!serviceWeekly[p.waiter_id]) serviceWeekly[p.waiter_id] = new Set();
          serviceWeekly[p.waiter_id].add(p.lesson_id);
        }
      });

      const waiterList: WaiterProgress[] = (waiterRows || []).map((w) => {
        const byModule: Record<string, number> = {};
        moduleList.forEach((m) => {
          byModule[m.id] = byWaiterModule[w.id]?.[m.id]?.size || 0;
        });
        return {
          waiter_id: w.id,
          full_name: w.full_name,
          role: w.role,
          byModule,
        };
      });
      setWaiters(waiterList);

      const weekly: Record<string, number> = {};
      (waiterRows || []).forEach((w) => {
        weekly[w.id] = serviceWeekly[w.id]?.size || 0;
      });
      setWeeklyDone(weekly);

      setLoading(false);
    };
    load();
  }, []);

  const serviceModule = modules.find((m) => m.id === SERVICE_MODULE_ID);

  function cell(done: number, total: number) {
    if (total === 0) return <span className="text-slate-300">—</span>;
    if (done >= total)
      return <span className="font-bold text-green-600">✅ {done}/{total}</span>;
    if (done === 0)
      return <span className="text-slate-400">⚪ 0/{total}</span>;
    return <span className="font-semibold text-amber-600">🟡 {done}/{total}</span>;
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        {/* כותרת */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">📚 מעקב הדרכות</h1>
            <p className="text-sm text-slate-500">איפה כל עובד עומד בכל הדרכה</p>
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
            טוען נתונים...
          </div>
        ) : (
          <>
            {/* חובה שבועית - מודול השירות */}
            {serviceModule && (
              <div className="mb-6 rounded-xl border-2 border-red-200 bg-white p-5 shadow-sm">
                <h2 className="mb-1 text-lg font-bold text-red-700">
                  🍷 חובה שבועית: {serviceModule.title}
                </h2>
                <p className="mb-4 text-xs text-slate-500">
                  מתאפס כל יום ראשון · מי שלא השלים את כל {serviceModule.total_lessons} השיעורים השבוע בפיגור
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {waiters.map((w) => {
                    const done = weeklyDone[w.waiter_id] || 0;
                    const total = serviceModule.total_lessons;
                    const complete = done >= total;
                    return (
                      <div
                        key={w.waiter_id}
                        className={`rounded-lg border p-3 ${
                          complete
                            ? 'border-green-200 bg-green-50'
                            : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-800">
                          {w.full_name}
                        </div>
                        <div className="text-xs">
                          {complete ? (
                            <span className="font-bold text-green-600">✅ השלים השבוע</span>
                          ) : (
                            <span className="font-bold text-red-600">
                              🔴 בפיגור · {done}/{total}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* מטריצת כל ההדרכות */}
            <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b bg-slate-50 text-xs text-slate-500">
                    <th className="sticky right-0 bg-slate-50 p-3 text-right font-semibold">
                      עובד
                    </th>
                    {modules.map((m) => (
                      <th key={m.id} className="p-3 text-center font-semibold whitespace-nowrap">
                        <div className="text-base">{m.icon}</div>
                        <div className="max-w-[90px] text-[11px] leading-tight">{m.title}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {waiters.map((w) => (
                    <tr key={w.waiter_id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="sticky right-0 bg-white p-3 hover:bg-slate-50">
                        <div className="font-semibold text-slate-800">{w.full_name}</div>
                        <div className="text-xs text-slate-400">
                          {roleLabels[w.role] || w.role}
                        </div>
                      </td>
                      {modules.map((m) => (
                        <td key={m.id} className="p-3 text-center whitespace-nowrap">
                          {cell(w.byModule[m.id] || 0, m.total_lessons)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex gap-4 text-xs text-slate-500">
              <span>✅ הושלם</span>
              <span>🟡 באמצע</span>
              <span>⚪ לא התחיל</span>
              <span>— אין שיעורים</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
