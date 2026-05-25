import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Header } from '@/components/dashboard/Header';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';

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

  // טעינת נתונים מה-DB
  const supabase = await createClient();
  
  const { data: trainings } = await supabase
    .from('trainings')
    .select('id, title, category, duration_minutes, is_required')
    .eq('is_active', true)
    .limit(4);

  const userName = user.email?.split('@')[0] || 'משתמש';
  const initials = getInitials(user.email || '');
  const greeting = getGreeting();
  const isAdmin = access.is_floor_master_admin || false;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <Header 
        userEmail={user.email || ''} 
        userInitials={initials}
        isAdmin={isAdmin}
        currentTab="home"
      />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Welcome banner */}
        <div className="bg-gradient-to-l from-slate-900 to-slate-800 text-white rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-semibold mb-1">
            {greeting}, {userName}! 👋
          </h2>
          <p className="text-slate-300 text-sm">
            המשמרת מתחילה בעוד כ-47 דקות · הקוויז היומי שלך מחכה
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KPICard label="ניקוד החודש" value="847" trend="up" trendValue="+12%" />
          <KPICard label="מקום בדירוג" value="#2" trend="up" trendValue="עלית" />
          <KPICard label="סימולציות" value="12" trend="neutral" />
          <KPICard label="דיוק קוויז" value="94%" trend="up" trendValue="+3%" />
        </div>

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
                        {training.duration_minutes} דק' · {training.category}
                      </p>
                    </div>
                  </div>
                  <button className="text-xs text-slate-600 hover:text-slate-900 font-medium px-3 py-1.5 border border-slate-200 rounded-md hover:bg-white transition">
                    התחל
                  </button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* Next Shift */}
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-slate-900">המשמרת הקרובה</h3>
          </CardHeader>
          <CardBody>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="font-medium text-slate-900">חמישי · 28 במאי</p>
                <p className="text-sm text-slate-500 mt-0.5">20:00 — 02:00 · סיט 1 + סיט 2</p>
              </div>
              <span className="text-xs bg-amber-100 text-amber-800 px-2.5 py-1 rounded-md font-medium">
                ⚠️ צפוי עומס
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
              <div>
                <p className="text-xs text-slate-500">תזכורת מפיות</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">23:20</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">סגירת חשבונות</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">22:00</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">מעבר לסיט 2</p>
                <p className="text-sm font-medium text-slate-900 mt-0.5">22:30</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </main>
    </div>
  );
}
