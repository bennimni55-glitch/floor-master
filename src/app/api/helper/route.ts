import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { buildRealtimeHelperPrompt } from '@/lib/anthropic/prompts';

export async function POST(request: Request) {
  try {
    // 1. בדיקת הרשאה - המשתמש מחובר?
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

    // 2. בדיקה שיש הרשאה ל-Floor Master
    const { data: access } = await publicClient
      .from('user_app_access')
      .select('can_access_floor_master')
      .single();

    if (!access?.can_access_floor_master) {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }

    // 3. קריאת השאלה מהבקשה
    const { question } = await request.json();
    if (!question || typeof question !== 'string' || question.length < 3) {
      return NextResponse.json({ error: 'שאלה לא תקינה' }, { status: 400 });
    }

    // 4. שליפת הנהלים והתפריט מ-Supabase
    const supabase = await createClient();

    const { data: procedures } = await supabase
      .from('procedures')
      .select('title, content, category')
      .eq('is_active', true);

    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('name, description, price, allergens, selling_points')
      .eq('is_active', true);

    // 5. בניית ה-System Prompt עם הנתונים האמיתיים מה-DB
    const systemPrompt = buildRealtimeHelperPrompt(
      procedures || [],
      menuItems || []
    );

    // 6. קריאה ל-Claude
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: question }
      ],
    });

    // 7. חילוץ הטקסט מהתגובה
    const answerBlock = response.content.find(b => b.type === 'text');
    const answer = answerBlock && answerBlock.type === 'text' ? answerBlock.text : '';

    // 8. שמירה ב-DB לטובת אנליטיקה
    const { data: waiter } = await supabase
      .from('waiters')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (waiter) {
      await supabase.from('realtime_queries').insert({
        waiter_id: waiter.id,
        question,
        answer,
      });
    }

    return NextResponse.json({ answer });

  } catch (error) {
    console.error('Helper API error:', error);
    return NextResponse.json(
      { error: 'משהו השתבש. נסה שוב.' },
      { status: 500 }
    );
  }
}
