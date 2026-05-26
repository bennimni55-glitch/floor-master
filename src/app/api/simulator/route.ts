import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { buildSimulatorPrompt, type ScenarioType } from '@/lib/anthropic/prompts';

interface ConversationMessage {
  role: 'customer' | 'waiter';
  text: string;
  mood?: number;
}

interface SimulatorResponse {
  customer_message: string;
  mood: number;
  is_session_complete: boolean;
  feedback: {
    score: number;
    strengths: string[];
    improvements: string[];
    key_tip: string;
    points_earned: number;
  } | null;
}

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

    const { data: access } = await publicClient
      .from('user_app_access')
      .select('can_access_floor_master')
      .single();

    if (!access?.can_access_floor_master) {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }

    // 2. קריאת הנתונים
    const body = await request.json();
    const scenarioType = body.scenario_type as ScenarioType;
    const conversation = (body.conversation || []) as ConversationMessage[];
    const sessionId = body.session_id as string | undefined;

    if (!scenarioType) {
      return NextResponse.json({ error: 'תרחיש לא תקין' }, { status: 400 });
    }

    const supabase = await createClient();

    // 3. שליפת הנהלים והתפריט
    const { data: procedures } = await supabase
      .from('procedures')
      .select('title, content, category')
      .eq('is_active', true);

    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('name, description, price, allergens, selling_points')
      .eq('is_active', true);

    // 4. בניית הפרומפט
    const systemPrompt = buildSimulatorPrompt(
      scenarioType,
      procedures || [],
      menuItems || []
    );

    // 5. בניית רצף ההודעות עבור Claude
    // אם זו ההודעה הראשונה - Claude מתחיל את הסימולציה
    // אחרת - נשלח את כל ההיסטוריה
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (conversation.length === 0) {
      // התחלת סימולציה - בקשה ראשונית
      messages.push({
        role: 'user',
        content: 'התחל את הסימולציה. הצג את עצמך בקצרה כלקוח שמופיע במסעדה לפי התרחיש שניתן לך.'
      });
    } else {
      // המשך שיחה - הודעות לסירוגין
      // ההודעה הראשונה תמיד מהלקוח (Claude), אז למלצר אנחנו ב-user, ולClaude ב-assistant
      conversation.forEach((msg) => {
        if (msg.role === 'customer') {
          messages.push({ role: 'assistant', content: msg.text });
        } else {
          messages.push({ role: 'user', content: msg.text });
        }
      });
    }

    // 6. קריאה ל-Claude
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const responseText = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    // 7. ניקוי וניתוח JSON
    const cleanText = responseText.replace(/```json|```/g, '').trim();
    let parsed: SimulatorResponse;

    try {
      parsed = JSON.parse(cleanText);
    } catch {
      return NextResponse.json({
        error: 'תגובה לא תקינה מ-AI',
        raw: cleanText
      }, { status: 500 });
    }

    // 8. שמירה ב-DB (אם הסימולציה מסתיימת או חדשה)
    const { data: waiter } = await supabase
      .from('waiters')
      .select('id')
      .eq('auth_user_id', user.id)
      .single();

    if (waiter) {
      // בונים את ההיסטוריה המעודכנת
      const updatedConversation = [
        ...conversation,
        {
          role: 'customer' as const,
          text: parsed.customer_message,
          mood: parsed.mood,
        },
      ];

      if (sessionId) {
        // עדכון סשן קיים
        await supabase
          .from('simulation_sessions')
          .update({
            conversation: updatedConversation,
            final_score: parsed.feedback?.score || null,
            ai_feedback: parsed.feedback ? JSON.stringify(parsed.feedback) : null,
            points_earned: parsed.feedback?.points_earned || 0,
            ended_at: parsed.is_session_complete ? new Date().toISOString() : null,
          })
          .eq('id', sessionId);
      } else if (conversation.length === 0) {
        // יצירת סשן חדש
        const { data: newSession } = await supabase
          .from('simulation_sessions')
          .insert({
            waiter_id: waiter.id,
            scenario_type: scenarioType,
            conversation: updatedConversation,
          })
          .select('id')
          .single();

        if (newSession) {
          return NextResponse.json({
            ...parsed,
            session_id: newSession.id,
          });
        }
      }
    }

    return NextResponse.json({
      ...parsed,
      session_id: sessionId,
    });

  } catch (error) {
    console.error('Simulator API error:', error);
    return NextResponse.json(
      { error: 'משהו השתבש בסימולציה. נסה שוב.' },
      { status: 500 }
    );
  }
}
