import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

interface WaiterStat {
  id: string;
  full_name: string;
  role: string;
  email: string;
  total_points: number;
  streak_days: number;
  total_quiz_attempts: number;
  correct_answers: number;
  quiz_accuracy_pct: number | null;
  simulations_completed: number;
  avg_simulation_score: number | null;
  helper_questions_asked: number;
  last_activity: string | null;
  rank: number;
}

interface CategoryWeakness {
  category: string;
  total_attempts: number;
  correct: number;
  success_rate_pct: number;
}

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

const roleLabels: Record<string, string> = {
  waiter: 'מלצר',
  bartender: 'ברמן',
  hostess: 'מארחת',
  manager: 'מנהל',
  admin: 'מנהל ראשי',
};

const categoryLabels: Record<string, string> = {
  procedures: 'נהלים',
  menu: 'תפריט',
  sales: 'מכירות',
  service: 'שירות',
  allergens: 'אלרגנים',
  cocktails: 'קוקטיילים',
  wine: 'יינות',
};

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'אף פעם';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `לפני ${diffMins} דק׳`;
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays === 1) return 'אתמול';
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  return date.toLocaleDateString('he-IL');
}

function getInitials(name: string): string {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export default async function AdminDashboard() {
  // בדיקת הרשאות - רק מנהל/בעלים יכול
  const publicClient = await createPublicServerClient();
  const { data: { user } } = await publicClient.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: access } = await publicClient
    .from('user_app_access')
    .select('is_floor_master_admin')
    .single();

  if (!access?.is_floor_master_admin) {
    redirect('/no-access');
  }

  // טעינת נתונים
  const supabase = await createClient();

  const { data: waiterStats } = await supabase
    .from('admin_dashboard_stats')
    .select('*')
    .order('rank', { ascending: true });

  const { data: weaknesses } = await supabase
    .from('category_weakness')
    .select('*')
    .limit(5);

  const stats = (waiterStats || []) as WaiterStat[];
  const categories = (weaknesses || []) as CategoryWeakness[];

  // KPIs חישוב
  const totalWaiters = stats.length;
  const activeThisWeek = stats.filter(w => {
    if (!w.last_activity) return false;
    const lastActivity = new Date(w.last_activity);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return lastActivity > weekAgo;
  }).length;

  const totalQuizAttempts = stats.reduce((sum, w) => sum + (w.total_quiz_attempts || 0), 0);
  const totalCorrect = stats.reduce((sum, w) => sum + (w.correct_answers || 0), 0);
  const avgAccuracy = totalQuizAttempts > 0 
    ? Math.round((totalCorrect / totalQuizAttempts) * 100)
    : 0;

  const totalSimulations = stats.reduce((sum, w) => sum + (w.simulations_completed || 0), 0);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a href="/" className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg hover:bg-slate-800 transition">
              🍷
            </a>
            <div>
              <h1 className="font-semibold text-slate-900 leading-tight">דשבורד מנהל</h1>
              <p className="text-xs text-slate-500">סקירת ביצועי הצוות</p>
            </div>
          </div>
          <a href="/" className="text-sm text-slate-500 hover:text-slate-900">
            ← חזרה
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">סך הצוות</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-slate-900">{totalWaiters}</p>
              <p className="text-xs text-slate-500">פעילים</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">פעילים השבוע</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-slate-900">{activeThisWeek}</p>
              <p className="text-xs text-slate-500">/ {totalWaiters}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">דיוק קוויז ממוצע</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-slate-900">{avgAccuracy}%</p>
              <p className="text-xs text-slate-500">({totalQuizAttempts} שאלות)</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">סימולציות הושלמו</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-slate-900">{totalSimulations}</p>
              <p className="text-xs text-slate-500">החודש</p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Leaderboard */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">🏆 לוח מצטיינים</h3>
                  <p className="text-xs text-slate-500 mt-0.5">דירוג לפי ניקוד מצטבר</p>
                </div>
              </div>
            </div>

            {stats.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                <div className="text-4xl mb-2">👤</div>
                <p className="text-sm">עדיין אין מלצרים פעילים במערכת</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {stats.map((waiter) => (
                  <div key={waiter.id} className="p-4 hover:bg-slate-50 transition">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-8 text-lg font-bold text-slate-400">
                        {waiter.rank === 1 ? '🥇' : waiter.rank === 2 ? '🥈' : waiter.rank === 3 ? '🥉' : `#${waiter.rank}`}
                      </div>

                      <div className="w-10 h-10 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                        {getInitials(waiter.full_name)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-slate-900 truncate">{waiter.full_name}</p>
                          <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                            {roleLabels[waiter.role] || waiter.role}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span>🎯 {waiter.quiz_accuracy_pct || 0}% דיוק</span>
                          <span>🎮 {waiter.simulations_completed} סימולציות</span>
                          <span>💡 {waiter.helper_questions_asked} שאלות</span>
                          <span className="text-slate-400">· {formatRelativeTime(waiter.last_activity)}</span>
                        </div>
                      </div>

                      <div className="text-left">
                        <p className="text-xl font-bold text-slate-900">{waiter.total_points || 0}</p>
                        <p className="text-xs text-slate-500">נקודות</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Weak Categories */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900">⚠️ איפה הצוות נופל</h3>
              <p className="text-xs text-slate-500 mt-0.5">קטגוריות שכדאי לחזק</p>
            </div>

            {categories.length === 0 ? (
              <div className="p-10 text-center text-slate-500">
                <div className="text-4xl mb-2">📊</div>
                <p className="text-sm">אין מספיק נתונים</p>
                <p className="text-xs mt-1">צריך לפחות 5 קוויזים</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {categories.map((cat) => {
                  const isWeak = cat.success_rate_pct < 70;
                  const isStrong = cat.success_rate_pct >= 85;
                  
                  return (
                    <div key={cat.category}>
                      <div className="flex justify-between items-center mb-1.5">
                        <p className="text-sm font-medium text-slate-900">
                          {categoryLabels[cat.category] || cat.category}
                        </p>
                        <p className={`text-sm font-semibold ${
                          isWeak ? 'text-red-600' : isStrong ? 'text-green-600' : 'text-amber-600'
                        }`}>
                          {cat.success_rate_pct}%
                        </p>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            isWeak ? 'bg-red-500' : isStrong ? 'bg-green-500' : 'bg-amber-500'
                          }`}
                          style={{ width: `${cat.success_rate_pct}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {cat.correct}/{cat.total_attempts} תשובות נכונות
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Insights Card */}
        {stats.length > 0 && (
          <div className="mt-6 bg-gradient-to-l from-slate-900 to-slate-800 text-white rounded-xl p-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <span>💡</span> תובנות מהירות
            </h3>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {stats[0] && (
                <div className="bg-white/10 rounded-lg p-3">
                  <p className="text-slate-300 text-xs mb-1">🏆 המצטיין החודש</p>
                  <p className="font-medium">{stats[0].full_name}</p>
                  <p className="text-xs text-slate-400">עם {stats[0].total_points || 0} נקודות</p>
                </div>
              )}
              
              {categories[0] && categories[0].success_rate_pct < 70 && (
                <div className="bg-white/10 rounded-lg p-3">
                  <p className="text-slate-300 text-xs mb-1">⚠️ דורש חיזוק</p>
                  <p className="font-medium">{categoryLabels[categories[0].category]}</p>
                  <p className="text-xs text-slate-400">{categories[0].success_rate_pct}% הצלחה בלבד</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
