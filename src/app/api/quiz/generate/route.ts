import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { buildQuizGeneratorPrompt } from '@/lib/anthropic/prompts';

interface GeneratedQuestion {
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question_text: string;
  options: Array<{ text: string; is_correct: boolean }>;
  explanation: string;
  points: number;
}

export async function GET() {
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

    const { data: access } = await publicClient
      .from('user_app_access')
      .select('can_access_floor_master')
      .single();

    if (!access?.can_access_floor_master) {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }

    const supabase = await createClient();

    // 2. שליפת שאלות קיימות מה-DB (העדפה ראשונה)
    const { data: existingQuestions } = await supabase
      .from('quiz_questions')
      .select('id, category, difficulty, question_text, options, explanation, points')
      .eq('is_active', true)
      .limit(20);

    // אם יש מספיק שאלות מוכנות - נשתמש בהן (זול ומהיר)
    if (existingQuestions && existingQuestions.length >= 3) {
      // נבחר 3 שאלות אקראיות
      const shuffled = [...existingQuestions].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, 3);
      
      return NextResponse.json({ 
        questions: selected,
        source: 'database'
      });
    }

    // 3. אם אין מספיק - נייצר חדשות עם Claude
    const { data: procedures } = await supabase
      .from('procedures')
      .select('title, content, category')
      .eq('is_active', true)
      .limit(15);

    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('name, description, price, allergens')
      .eq('is_active', true)
      .limit(10);

    const systemPrompt = buildQuizGeneratorPrompt(
      procedures || [],
      menuItems || []
    );

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: 'תייצר 3 שאלות קוויז מגוונות. תזכור - JSON בלבד.'
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const responseText = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    // ניקוי טקסט מ-markdown אם יש
    const cleanText = responseText.replace(/```json|```/g, '').trim();
    
    const parsed = JSON.parse(cleanText) as { questions: GeneratedQuestion[] };

    // שמירת השאלות החדשות ב-DB לשימוש עתידי
    const questionsToSave = parsed.questions.map(q => ({
      ...q,
      is_ai_generated: true,
    }));

    const { data: savedQuestions } = await supabase
      .from('quiz_questions')
      .insert(questionsToSave)
      .select('id, category, difficulty, question_text, options, explanation, points');

    return NextResponse.json({ 
      questions: savedQuestions || parsed.questions,
      source: 'ai'
    });

  } catch (error) {
    console.error('Quiz generate error:', error);
    return NextResponse.json(
      { error: 'משהו השתבש בייצור הקוויז' },
      { status: 500 }
    );
  }
}
