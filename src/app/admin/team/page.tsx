'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface TeamMember {
  waiter_id: string;
  full_name: string;
  role: string;
  email: string;
  phone: string | null;
  auth_user_id: string;
  last_sign_in_at: string | null;
  // הדרכה
  total_lessons: number;
  completed_lessons: number;
  progress_pct: number;
  // קוויז
  total_quiz: number;
  correct_quiz: number;
  quiz_accuracy: number;
  // סימולציות
  simulations_count: number;
  // משמרות
  shifts_count: number;
  total_hours: number;
  total_tips: number;
  // ניקוד
  total_points: number;
}

const roleLabels: Record<string, string> = {
  waiter: 'מלצר/ית',
  bartender: 'ברמן/ית',
  hostess: 'מארח/ת',
  runner: 'ראנר/ית',
};

const roleColors: Record<string, string> = {
  waiter: 'bg-blue-100 text-blue-700',
  bartender: 'bg-purple-100 text-purple-700',
  hostess: 'bg-pink-100 text-pink-700',
  runner: 'bg-amber-100 text-amber-700',
};

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return '❌ לא התחבר';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '✅ עכשיו';
  if (diffMins < 60) return `✅ לפני ${diffMins} דק׳`;
  if (diffHours < 24) return `✅ לפני ${diffHours} שעות`;
  if (diffDays === 1) return '✅ אתמול';
  if (diffDays < 7) return `✅ לפני ${diffDays} ימים`;
  return `✅ ${date.toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}`;
}

export default function AdminTeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
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

      // טעינת כל המלצרים הפעילים
      const { data: waiters, error: waitersError } = await supabase
        .from('waiters')
        .select('id, full_name, role, email, phone, auth_user_id, total_points')
        .eq('is_active', true)
        .order('full_name');

      if (waitersError) throw waitersError;
      if (!waiters) return;

      // עבור כל מלצר - טעינת כל הסטטיסטיקות
      const membersData: TeamMember[] = await Promise.all(
        waiters.map(async (w) => {
          // התחברות אחרונה - מקריאת auth.users דרך view ייעודי
          // (בגלל שאי אפשר לקרוא מ-auth.users ישירות מהקליינט, נשתמש בדרך אחרת)
          
          // הדרכה
          const { data: lessons } = await supabase
            .from('training_lessons')
            .select('id')
            .eq('is_active', true);
          
          const { data: progress } = await supabase
            .from('training_progress')
            .select('lesson_id, completed_at')
            .eq('waiter_id', w.id);

          const totalLessons = lessons?.length || 0;
          const completedLessons = progress?.filter(p => p.completed_at !== null).length || 0;
          const progressPct = totalLessons > 0 
            ? Math.round((completedLessons / totalLessons) * 100) 
            : 0;

          // קוויז
          const { data: quizData } = await supabase
            .from('quiz_attempts')
            .select('is_correct')
            .eq('waiter_id', w.id);
          
          const totalQuiz = quizData?.length || 0;
          const correctQuiz = quizData?.filter(q => q.is_correct).length || 0;
          const quizAccuracy = totalQuiz > 0 
            ? Math.round((correctQuiz / totalQuiz) * 100) 
            : 0;

          // סימולציות
          const { count: simCount } = await supabase
            .from('simulation_sessions')
            .select('*', { count: 'exact', head: true })
            .eq('waiter_id', w.id);

          // משמרות
          const { data: shifts } = await supabase
            .from('shift_clock')
            .select('hours_worked')
            .eq('waiter_id', w.id)
            .not('clock_out', 'is', null);
          
          const shiftsCount = shifts?.length || 0;
          const totalHours = shifts?.reduce((sum, s) => sum + Number(s.hours_worked || 0), 0) || 0;

          // טיפים
          const { data: tips } = await supabase
            .from('tip_distribution_details')
            .select('tip_amount')
            .eq('waiter_id', w.id);
          
          const totalTips = tips?.reduce((sum, t) => sum + Number(t.tip_amount), 0) || 0;

          return {
            waiter_id: w.id,
            full_name: w.full_name,
            role: w.role,
            email: w.email,
            phone: w.phone,
            auth_user_id: w.auth_user_id,
            last_sign_in_at: null, // נטען בנפרד
            total_lessons: totalLessons,
            completed_lessons: completedLessons,
            progress_pct: progressPct,
            total_quiz: totalQuiz,
            correct_quiz: correctQuiz,
            quiz_accuracy: quizAccuracy,
            simulations_count: simCount || 0,
            shifts_count: shiftsCount,
            total_hours: totalHours,
            total_tips: totalTips,
            total_points: w.total_points || 0,
          };
        })
      );

      // טעינת זמני התחברות אחרונים דרך RPC או view
      try {
        const { data: signInData } = await supabase
          .from('user_last_sign_in')
          .select('user_id, last_sign_in_at');
        
        if (signInData) {
          membersData.forEach(m => {
            const signIn = signInData.find(s => s.user_id === m.auth_user_id);
            if (signIn) m.last_sign_in_at = signIn.last_sign_in_at;
          });
        }
      } catch {
        // אם ה-view לא קיים - לא נורא, נמשיך בלי
      }

      setMembers(membersData);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'שגיאה בטעינה');
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

  // סטטיסטיקות סיכום
  const totalMembers = members.length;
  const loggedInMembers = members.filter(m => m.last_sign_in_at !== null).length;
  const activeMembers = members.filter(m => m.completed_lessons > 0 || m.total_quiz > 0 || m.simulations_count > 0).length;
  const completedTraining = members.filter(m => m.progress_pct === 100).length;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a href="/" className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg hover:bg-slate-800 transition">
              🍷
            </a>
            <div>
              <h1 className="font-semibold text-slate-900 leading-tight">מצב הצוות</h1>
              <p className="text-xs text-slate-500">מי השתמש, מי עשה הדרכה, מי לא</p>
            </div>
          </div>
          <div className="flex gap-3">
            <a href="/admin" className="text-sm text-slate-500 hover:text-slate-900">
              ← דשבורד
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {/* סיכום למעלה */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">סך הצוות</p>
            <p className="text-2xl font-semibold text-slate-900">{totalMembers}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">התחברו</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-green-600">{loggedInMembers}</p>
              <p className="text-xs text-slate-500">/ {totalMembers}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">פעילים</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-blue-600">{activeMembers}</p>
              <p className="text-xs text-slate-500">השתמשו</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 mb-1">סיימו הדרכה</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-semibold text-purple-600">{completedTraining}</p>
              <p className="text-xs text-slate-500">/ {totalMembers}</p>
            </div>
          </div>
        </div>

        {/* טבלה מקיפה */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">📋 פירוט מלא של הצוות</h3>
            <p className="text-xs text-slate-500 mt-0.5">לחץ/י על שורה לפרטים מלאים</p>
          </div>

          {members.length === 0 ? (
            <div className="p-10 text-center text-slate-500">
              <div className="text-4xl mb-2">👥</div>
              <p>אין מלצרים פעילים במערכת</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-right p-3 font-medium text-slate-700">מלצר</th>
                    <th className="text-right p-3 font-medium text-slate-700">תפקיד</th>
                    <th className="text-right p-3 font-medium text-slate-700">📚 הדרכה</th>
                    <th className="text-right p-3 font-medium text-slate-700">⚡ קוויז</th>
                    <th className="text-right p-3 font-medium text-slate-700">🎮 סימולציות</th>
                    <th className="text-right p-3 font-medium text-slate-700">⏰ משמרות</th>
                    <th className="text-right p-3 font-medium text-slate-700">💰 טיפים</th>
                    <th className="text-right p-3 font-medium text-slate-700">🏆 ניקוד</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const trainingDone = m.progress_pct === 100;
                    const trainingStarted = m.completed_lessons > 0;
                    
                    return (
                      <tr key={m.waiter_id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                        <td className="p-3">
                          <p className="font-medium text-slate-900">{m.full_name}</p>
                          {m.phone && (
                            <p className="text-xs text-slate-500 mt-0.5">{m.phone}</p>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`text-xs px-2 py-1 rounded ${roleColors[m.role] || 'bg-slate-100 text-slate-700'}`}>
                            {roleLabels[m.role] || m.role}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 max-w-[80px]">
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full transition-all ${
                                    trainingDone ? 'bg-green-500' : trainingStarted ? 'bg-amber-500' : 'bg-slate-300'
                                  }`}
                                  style={{ width: `${m.progress_pct}%` }}
                                />
                              </div>
                            </div>
                            <p className={`text-xs font-medium whitespace-nowrap ${
                              trainingDone ? 'text-green-600' : trainingStarted ? 'text-amber-600' : 'text-slate-400'
                            }`}>
                              {m.completed_lessons}/{m.total_lessons}
                            </p>
                          </div>
                        </td>
                        <td className="p-3">
                          {m.total_quiz > 0 ? (
                            <div>
                              <p className="font-semibold text-slate-900">{m.total_quiz}</p>
                              <p className="text-xs text-slate-500">{m.quiz_accuracy}% דיוק</p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400">—</p>
                          )}
                        </td>
                        <td className="p-3">
                          {m.simulations_count > 0 ? (
                            <p className="font-semibold text-slate-900">{m.simulations_count}</p>
                          ) : (
                            <p className="text-xs text-slate-400">—</p>
                          )}
                        </td>
                        <td className="p-3">
                          {m.shifts_count > 0 ? (
                            <div>
                              <p className="font-semibold text-slate-900">{m.shifts_count}</p>
                              <p className="text-xs text-slate-500">{m.total_hours.toFixed(1)} שעות</p>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400">—</p>
                          )}
                        </td>
                        <td className="p-3">
                          {m.total_tips > 0 ? (
                            <p className="font-semibold text-green-700">
                              ₪{m.total_tips.toLocaleString('he-IL', { maximumFractionDigits: 0 })}
                            </p>
                          ) : (
                            <p className="text-xs text-slate-400">—</p>
                          )}
                        </td>
                        <td className="p-3">
                          <p className="font-bold text-slate-900">{m.total_points}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* הסבר על הסטטוסים */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-900 mb-2">💡 איך לקרוא את הטבלה?</p>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>📚 <strong>הדרכה</strong> - כמה שיעורים השלים מתוך 19. מי שיש לו 19/19 - סיים הדרכה.</li>
            <li>⚡ <strong>קוויז</strong> - כמה שאלות ענה וכמה אחוז נכונים.</li>
            <li>🎮 <strong>סימולציות</strong> - כמה תרגילים תרגל מול לקוחות וירטואליים.</li>
            <li>⏰ <strong>משמרות</strong> - כמה משמרות עבד וסה&quot;כ שעות.</li>
            <li>💰 <strong>טיפים</strong> - סה&quot;כ טיפים שצבר מכל המשמרות.</li>
            <li>🏆 <strong>ניקוד</strong> - הניקוד הכולל במערכת הגיימיפיקציה.</li>
          </ul>
        </div>
      </main>
    </div>
  );
}
