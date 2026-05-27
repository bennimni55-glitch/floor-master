import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getWaiter() {
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
  if (!user) return null;

  const { data: access } = await publicClient
    .from('user_app_access')
    .select('can_access_floor_master')
    .single();

  if (!access?.can_access_floor_master) return null;

  return user;
}

// POST - מלצר מבקש משמרת
export async function POST(request: Request) {
  try {
    const user = await getWaiter();
    if (!user) {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }

    const { shift_id } = await request.json();
    if (!shift_id) {
      return NextResponse.json({ error: 'חסר shift_id' }, { status: 400 });
    }

    const supabase = await createClient();

    // שליפת ה-waiter_id
    const { data: waiter } = await supabase
      .from('waiters')
      .select('id, role')
      .eq('auth_user_id', user.id)
      .single();

    if (!waiter) {
      return NextResponse.json({ error: 'משתמש לא רשום כמלצר' }, { status: 400 });
    }

    // בדיקה אם כבר ביקש
    const { data: existing } = await supabase
      .from('shift_assignments')
      .select('id, status')
      .eq('shift_id', shift_id)
      .eq('waiter_id', waiter.id)
      .single();

    if (existing) {
      return NextResponse.json({ 
        error: `כבר ביקשת את המשמרת הזו (סטטוס: ${existing.status})` 
      }, { status: 400 });
    }

    // הוספת בקשה חדשה
    const { data, error } = await supabase
      .from('shift_assignments')
      .insert({
        shift_id,
        waiter_id: waiter.id,
        role_in_shift: waiter.role,
        status: 'requested',
        requested_by_waiter: true,
      })
      .select()
      .single();

    if (error) {
      console.error('Request error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ assignment: data });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'שגיאה' }, { status: 500 });
  }
}

// DELETE - מלצר מבטל בקשה
export async function DELETE(request: Request) {
  try {
    const user = await getWaiter();
    if (!user) {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const shiftId = searchParams.get('shift_id');

    if (!shiftId) {
      return NextResponse.json({ error: 'חסר shift_id' }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: waiter } = await supabase
      .from('waiters')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!waiter) {
      return NextResponse.json({ error: 'משתמש לא רשום' }, { status: 400 });
    }

    // אפשר לבטל רק אם הסטטוס עדיין 'requested' (לא אושר עוד)
    const { error } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('shift_id', shiftId)
      .eq('waiter_id', waiter.id)
      .eq('status', 'requested');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'שגיאה' }, { status: 500 });
  }
}
