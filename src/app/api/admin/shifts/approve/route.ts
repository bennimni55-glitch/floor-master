import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function checkAdmin() {
  const cookieStore = await cookies();
  const publicClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data: { user } } = await publicClient.auth.getUser();
  if (!user) return { authorized: false, user: null };

  const { data: access } = await publicClient
    .from('user_app_access')
    .select('is_floor_master_admin')
    .single();

  return { 
    authorized: access?.is_floor_master_admin === true, 
    user 
  };
}

// POST - אישור או דחיה של בקשה
export async function POST(request: Request) {
  try {
    const { authorized, user } = await checkAdmin();
    if (!authorized || !user) {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }

    const { assignment_id, action } = await request.json();

    if (!assignment_id || !action) {
      return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
    }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'פעולה לא תקינה' }, { status: 400 });
    }

    const supabase = await createClient();

    // שליפת ה-waiter_id של המנהל (לרישום מי אישר)
    const { data: adminWaiter } = await supabase
      .from('waiters')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const { data, error } = await supabase
      .from('shift_assignments')
      .update({
        status: newStatus,
        approved_by: adminWaiter?.id || null,
        approved_at: new Date().toISOString(),
        confirmed: action === 'approve',
        confirmed_at: action === 'approve' ? new Date().toISOString() : null,
      })
      .eq('id', assignment_id)
      .select()
      .single();

    if (error) {
      console.error('Approval error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment: data });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'שגיאה' }, { status: 500 });
  }
}
