'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const SERVICE_MODULE_ID = '7b9da855-186c-4386-8199-02efecedfd95';

// מחזיר את תאריך יום ראשון האחרון (תחילת השבוע) בשעון ישראל, כ-ISO
function lastSundayISO(): string {
  const now = new Date();
  // המרה לשעון ישראל
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = il.getDay(); // 0 = ראשון
  il.setDate(il.getDate() - day);
  il.setHours(0, 0, 0, 0);
  return il.toISOString();
}

interface Props {
  waiterId: string;
}

export function WeeklyTrainingBanner({ waiterId }: Props) {
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const weekStart = lastSundayISO();

      // כמה שיעורים פעילים יש במודול השירות
      const { data: lessons } = await supabase
        .from('training_lessons')
        .select('id')
        .eq('module_id', SERVICE_MODULE_ID)
        .eq('is_active', true);

      const lessonIds = (lessons || []).map((l) => l.id);
      const totalLessons = lessonIds.length;
      setTotal(totalLessons);

      if (totalLessons === 0) {
        setLoading(false);
        return;
      }

      // כמה מהם המלצר השלים מאז תחילת השבוע (יום ראשון)
      const { data: progress } = await supabase
        .from('training_progress')
        .select('lesson_id, completed_at')
        .eq('waiter_id', waiterId)
        .in('lesson_id', lessonIds)
        .gte('completed_at', weekStart)
        .not('completed_at', 'is', null);

      // ספירת שיעורים ייחודיים שהושלמו השבוע
      const uniqueDone = new Set((progress || []).map((p) => p.lesson_id));
      setCompleted(uniqueDone.size);
      setLoading(false);
    };

    check();
  }, [waiterId]);

  // לא מציגים כלום בזמן טעינה או אם הושלם הכל
  if (loading || total === 0 || completed >= total) return null;

  const remaining = total - completed;

  return (
    <Link
      href="/training"
      className="block mb-4 rounded-xl border-2 border-red-500 bg-gradient-to-l from-red-600 to-red-500 p-4 shadow-lg transition hover:shadow-xl"
    >
      <div className="flex items-center gap-3">
        <div className="text-3xl animate-pulse">⚠️</div>
        <div className="flex-1 text-white">
          <div className="text-lg font-bold">
            חובה השבוע: הדרכת שירות ברמת מסעדת שף
          </div>
          <div className="text-sm text-red-50">
            {completed === 0
              ? `עליך להשלים את ההדרכה השבועית (${total} שיעורים). לחץ כאן להתחיל →`
              : `כל הכבוד על ההתחלה! נותרו לך עוד ${remaining} שיעורים להשלמת ההדרכה השבועית →`}
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-red-800/40">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${Math.round((completed / total) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
