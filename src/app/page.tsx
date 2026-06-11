import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Header } from '@/components/dashboard/Header';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { ClockInOut } from '@/components/dashboard/ClockInOut';
import { MyShiftsHistory } from '@/components/dashboard/MyShiftsHistory';
import { DailyReminder } from '@/components/dashboard/DailyReminder';
import { TipsConfirmation } from '@/components/dashboard/TipsConfirmation';

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

function getInitials(email: string): string {
  const name = email.split('@')[0];
  return name.substring(0, 2).toUpperCase();
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'בוקר טוב';
  if (hour < 17) return 'צהריים טובים';
  if (hour < 21) return 'ערב טוב';
  return 'לילה טוב';
}

export default async function HomePage() {
  const publicClient = await createPublicServerClient();
  const { data: { user } } = await publicClient.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: access } = await publicClient
    .from('user_app_access')
    .select('can_access_floor_master, is_floor_master_admin')
    .single();

  if (!access?.can_access_floor_master) {
    redirect('/no-access');
  }

  const supabase = await createClient();
  
  const { data: waiter } = await supabase
    .from('waiters')
    .select('id, full_name, role, total_points')
    .eq('auth_user_id', user.id)
    .single();

  let activeClock = null;
  let simulationCount = 0;
  let quizAccuracy = 0;
  let waiterRank = 0;
  let totalWaiters = 0;
  
  if (waiter) {
    // משמרת פעילה
    const { data } = await supabase
      .from('shift_clock')
      .select('id, clock_in')
      .eq('waiter_id', waiter.id)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .single();
    activeClock = data;

    // סטטיסטיקות אמיתיות
    const { count: simCount } = await supabase
      .from('simulation_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('waiter_id', waiter.id);
    simulationCount = simCount || 0;

    // דיוק קוויז
    const { data: quizData } = await supabase
      .from('quiz_attempts')
      .select('is_correct')
      .eq('waiter_id', waiter.id);
    
    if (quizData && quizData.length > 0) {
      const correct = quizData.filter(q => q.is_correct).length;
      quizAccuracy = Math.round((correct / quizData.length) * 100);
    }

    // דירוג
    const { data: allWaiters } = await supabase
      .from('waiters')
      .select('id, total_points')
      .eq('is_active', true)
      .order('total_points', { ascending: false });
    
    if (allWaiters) {
      totalWaiters = allWaiters.length;
      const rankIndex = allWaiters.findIndex(w => w.id === waiter.id);
      waiterRank = rankIndex + 1;
    }
  }
  
  const { data: trainings } = await supabase
    .from('trainings')
    .select('id, title, category, duration_minutes, is_required')
    .eq('is_active', true)
    .limit(4);

  const userName = user.email?.split('@')[0] || 'משתמש';
  const initials = getInitials(user.email || '');
  const greeting = getGreeting();
  const isAdmin = access.is_floor_master_admin || false;
  const totalPoints = waiter?.total_points || 0;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <Header 
        userEmail={user.email || ''} 
        userInitials={initials}
        isAdmin={isAdmin}
        currentTab="home"
      />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {waiter && (
          <ClockInOut
            waiterId={waiter.id}
            waiterName={waiter.full_name}
            activeClockId={activeClock?.id || null}
            activeClockStart={activeClock?.clock_in || null}
            greeting={greeting}
          />
        )}

        {!waiter && (
          <div className="bg-gradient-to-l from-slate-900 to-slate-800 text-white rounded-2xl p-6 mb-6">
            <h2 className="text-xl font-semibold mb-1">
              {greeting}, {userName}! 👋
            </h2>
            <p className="text-slate-300 text-sm">
              ברוך הבא לדשבורד המנהל
            </p>
          </div>
        )}

        {waiter && <DailyReminder context="home_page" />}

        {waiter && <TipsConfirmation waiterId={waiter.id} />}

        {waiter && (
          <MyShiftsHistory waiterId={waiter.id} />
        )}

        {/* KPI Cards - עכשיו עם נתונים אמיתיים! */}
        {waiter && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <KPICard 
              label="הניקוד שלי" 
              value={totalPoints.toLocaleString('he-IL')} 
              trend="neutral" 
            />
            <KPICard 
              label="מקום בדירוג" 
              value={waiterRank > 0 ? `#${waiterRank}` : '—'} 
              trend="neutral"
              trendValue={totalWaiters > 0 ? `מתוך ${totalWaiters}` : ''}
            />
            <KPICard 
              label="סימולציות" 
              value={simulationCount.toString()} 
              trend="neutral" 
            />
            <KPICard 
              label="דיוק קוויז" 
              value={quizAccuracy > 0 ? `${quizAccuracy}%` : '—'} 
              trend="neutral" 
            />
          </div>
        )}

        {/* Active Trainings */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-slate-900">הדרכות פעילות</h3>
              <span className="text-xs text-slate-500">{trainings?.length || 0} הדרכות</span>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {trainings?.map((training) => (
                <div 
                  key={training.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center text-lg border border-slate-200">
                      📚
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-sm font-medium text-slate-900">{training.title}</p>
                        {training.is_required && (
                          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                            חובה
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {training.duration_minutes} דק&apos; · {training.category}
                      </p>
                    </div>
                  </div>
                  <a href="/training" className="text-xs text-slate-600 hover:text-slate-900 font-medium px-3 py-1.5 border border-slate-200 rounded-md hover:bg-white transition">
                    התחל
                  </a>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </main>
    </div>
  );
}
