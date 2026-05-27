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

// POST - יצירת משמרת חדשה
export async function POST(request: Request) {
  try {
    const { authorized } = await checkAdmin();
    if (!authorized) {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }

    const body = await request.json();
    const {
      shift_date,
      shift_type,
      start_time,
      end_time,
      required_waiters,
      required_bartenders,
      required_hostesses,
      notes,
    } = body;

    if (!shift_date || !shift_type || !start_time || !end_time) {
      return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('shifts')
      .insert({
        shift_date,
        shift_type,
        start_time,
        end_time,
        required_waiters: required_waiters || 0,
        required_bartenders: required_bartenders || 0,
        required_hostesses: required_hostesses || 0,
        notes: notes || null,
        status: 'published',
      })
      .select()
      .single();

    if (error) {
      console.error('Shift creation error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ shift: data });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'שגיאה' }, { status: 500 });
  }
}

// DELETE - מחיקת משמרת
export async function DELETE(request: Request) {
  try {
    const { authorized } = await checkAdmin();
    if (!authorized) {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const shiftId = searchParams.get('id');

    if (!shiftId) {
      return NextResponse.json({ error: 'חסר ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('id', shiftId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'שגיאה' }, { status: 500 });
  }
}
