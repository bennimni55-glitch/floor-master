import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    // 1. בדיקת הרשאה
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
    if (!user) {
      return NextResponse.json({ error: 'לא מחובר' }, { status: 401 });
    }

    // 2. קריאת הנתונים
    const { question_id, selected_option_index, time_taken_seconds } = await request.json();

    if (typeof question_id !== 'string' || typeof selected_option_index !== 'number') {
      return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 });
    }

    const supabase = await createClient();

    // 3. שליפת השאלה כדי לבדוק נכונות
    const { data: question, error: questionError } = await supabase
      .from('quiz_questions')
      .select('options, points')
      .eq('id', question_id)
      .single();

    if (questionError || !question) {
      return NextResponse.json({ error: 'שאלה לא נמצאה' }, { status: 404 });
    }

    const options = question.options as Array<{ text: string; is_correct: boolean }>;
    const isCorrect = options[selected_option_index]?.is_correct === true;
    const pointsEarned = isCorrect ? (question.points || 10) : 0;

    // 4. שליפת ה-waiter_id (אם המשתמש רשום כמלצר)
    const { data: waiter } = await supabase
      .from('waiters')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    // 5. שמירת התשובה (רק אם זה מלצר רשום)
    if (waiter) {
      await supabase.from('quiz_attempts').insert({
        waiter_id: waiter.id,
        question_id,
        selected_option_index,
        is_correct: isCorrect,
        time_taken_seconds: time_taken_seconds || null,
        points_earned: pointsEarned,
      });
    }

    return NextResponse.json({
      is_correct: isCorrect,
      points_earned: pointsEarned,
      correct_option_index: options.findIndex(o => o.is_correct),
    });

  } catch (error) {
    console.error('Quiz answer error:', error);
    return NextResponse.json(
      { error: 'משהו השתבש' },
      { status: 500 }
    );
  }
}
