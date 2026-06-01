import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

async function getUser() {
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

// POST - הוספת אילוץ חדש
export async function POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }

    const body = await request.json();
    const { 
      constraint_date, 
      all_day, 
      start_time, 
      end_time, 
      reason 
    } = body;

    if (!constraint_date) {
      return NextResponse.json({ error: 'חובה לציין תאריך' }, { status: 400 });
    }

    const supabase = await createClient();

    // שליפת ה-waiter_id
    const { data: waiter } = await supabase
      .from('waiters')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (!waiter) {
      return NextResponse.json({ error: 'משתמש לא רשום כמלצר' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('availability_constraints')
      .insert({
        waiter_id: waiter.id,
        constraint_date,
        all_day: all_day !== false, // ברירת מחדל - יום שלם
        start_time: all_day !== false ? null : start_time,
        end_time: all_day !== false ? null : end_time,
        reason: reason || null,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      console.error('Constraint creation error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ constraint: data });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'שגיאה' }, { status: 500 });
  }
}

// DELETE - מחיקת אילוץ
export async function DELETE(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const constraintId = searchParams.get('id');

    if (!constraintId) {
      return NextResponse.json({ error: 'חסר ID' }, { status: 400 });
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

    // המלצר יכול למחוק רק את האילוצים שלו
    const { error } = await supabase
      .from('availability_constraints')
      .delete()
      .eq('id', constraintId)
      .eq('waiter_id', waiter.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'שגיאה' }, { status: 500 });
  }
}
