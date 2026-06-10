import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

async function createPublicServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

interface Module {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  is_required: boolean;
}

interface Lesson {
  id: string;
  module_id: string;
}

interface Progress {
  lesson_id: string;
  completed_at: string | null;
  quiz_correct: boolean | null;
}

export default async function TrainingPage() {
  const publicClient = await createPublicServerClient();
  const { data: { user } } = await publicClient.auth.getUser();

  if (!user) redirect('/login');

  const { data: access } = await publicClient
    .from('user_app_access')
    .select('can_access_floor_master')
    .single();

  if (!access?.can_access_floor_master) redirect('/no-access');

  const supabase = await createClient();

  // טעינת המלצר
  const { data: waiter } = await supabase
    .from('waiters')
    .select('id, full_name')
    .eq('auth_user_id', user.id)
    .single();

  // טעינת מודולים ושיעורים
  const { data: modulesData } = await supabase
    .from('training_modules')
    .select('*')
    .eq('is_active', true)
    .order('display_order');

  const { data: lessonsData } = await supabase
    .from('training_lessons')
    .select('id, module_id')
    .eq('is_active', true);

  // טעינת התקדמות אם המשתמש הוא מלצר
  let progressData: Progress[] = [];
  if (waiter) {
    const { data } = await supabase
      .from('training_progress')
      .select('lesson_id, completed_at, quiz_correct')
      .eq('waiter_id', waiter.id);
    progressData = (data || []) as Progress[];
  }

  const modules = (modulesData || []) as Module[];
  const lessons = (lessonsData || []) as Lesson[];

  // חישוב סטטיסטיקות לכל מודול
  const moduleStats = modules.map(m => {
    const moduleLessons = lessons.filter(l => l.module_id === m.id);
    const completedLessons = moduleLessons.filter(l => 
      progressData.some(p => p.lesson_id === l.id && p.completed_at !== null)
    );
    return {
      ...m,
      total_lessons: moduleLessons.length,
      completed_lessons: completedLessons.length,
      progress_pct: moduleLessons.length > 0 
        ? Math.round((completedLessons.length / moduleLessons.length) * 100) 
        : 0,
    };
  });

  const totalLessons = lessons.length;
  const totalCompleted = progressData.filter(p => p.completed_at !== null).length;
  const overallPct = totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a href="/" className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg hover:bg-slate-800 transition">
              🍷
            </a>
            <div>
              <h1 className="font-semibold text-slate-900 leading-tight">ספר ההדרכה</h1>
              <p className="text-xs text-slate-500">כל מה שצריך לדעת להיות מלצר ב-Hopa</p>
            </div>
          </div>
          <a href="/" className="text-sm text-slate-500 hover:text-slate-900">
            ← חזרה
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* כרטיס התקדמות כללי */}
        <div className="bg-gradient-to-l from-slate-900 to-slate-800 text-white rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-semibold mb-1">
                {waiter ? `שלום ${waiter.full_name}! 👋` : 'ברוך הבא לספר ההדרכה'}
              </h2>
              <p className="text-slate-300 text-sm">
                {totalCompleted} מתוך {totalLessons} שיעורים הושלמו · {overallPct}% התקדמות
              </p>
            </div>
            <div className="text-left">
              <div className="text-4xl font-bold">{overallPct}%</div>
              <div className="text-xs text-slate-400">הושלם</div>
            </div>
          </div>

          {/* פס התקדמות */}
          <div className="mt-4 h-3 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-green-400 to-emerald-500 transition-all duration-500"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>

        {!waiter && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-amber-800">
              ℹ️ אתה צופה כמנהל. כדי לעקוב אחר התקדמות אישית, יש להיכנס כמלצר רשום.
            </p>
          </div>
        )}

        {/* רשימת מודולים */}
        <div className="space-y-4">
          {moduleStats.map((m) => {
            const isComplete = m.progress_pct === 100;
            const inProgress = m.progress_pct > 0 && m.progress_pct < 100;
            
            return (
              <a
                key={m.id}
                href={`/training/${m.id}`}
                className="block bg-white rounded-2xl border border-slate-200 hover:border-slate-400 hover:shadow-md transition p-5"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                    isComplete ? 'bg-green-100' : inProgress ? 'bg-amber-100' : 'bg-slate-100'
                  }`}>
                    {m.icon || '📚'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-slate-900">{m.title}</h3>
                      {m.is_required && (
                        <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                          חובה
                        </span>
                      )}
                      {isComplete && (
                        <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                          ✓ הושלם
                        </span>
                      )}
                    </div>
                    
                    {m.description && (
                      <p className="text-sm text-slate-600 mb-3">{m.description}</p>
                    )}

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isComplete ? 'bg-green-500' : 'bg-slate-900'
                          }`}
                          style={{ width: `${m.progress_pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-600 font-medium whitespace-nowrap">
                        {m.completed_lessons}/{m.total_lessons} שיעורים
                      </span>
                    </div>
                  </div>

                  <div className="text-slate-300 self-center text-xl">←</div>
                </div>
              </a>
            );
          })}
        </div>

        {moduleStats.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <div className="text-4xl mb-2">📚</div>
            <p>אין מודולי הדרכה במערכת</p>
          </div>
        )}
      </main>
    </div>
  );
}
