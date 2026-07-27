'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const SERVICE_MODULE_ID = '7b9da855-186c-4386-8199-02efecedfd95';

// יום ראשון של השבוע הבא (שעון ישראל)
function nextWeekStart(): Date {
  const now = new Date();
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = il.getDay();
  il.setDate(il.getDate() - day + 7); // ראשון הבא
  il.setHours(0, 0, 0, 0);
  return il;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// דדליין: יום שני 10:00 בבוקר של השבוע הנוכחי עבור השבוע הבא
function isPastDeadline(): boolean {
  const now = new Date();
  const il = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }));
  const day = il.getDay();
  // דדליין = שלישי (יום 2) בשעה 10:00 של השבוע הנוכחי
  const deadline = new Date(il);
  deadline.setDate(il.getDate() - day + 2);
  deadline.setHours(10, 0, 0, 0);
  return il > deadline;
}

interface QuizQ {
  lessonTitle: string;
  question: string;
  options: { text: string; is_correct: boolean }[];
  explanation: string;
}

interface Props {
  waiterId: string;
}

export function AvailabilitySubmission({ waiterId }: Props) {
  const [selectedDays, setSelectedDays] = useState<Set<number>>(new Set());
  const [existing, setExisting] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // מצב שאלת המבחן
  const [quizQ, setQuizQ] = useState<QuizQ | null>(null);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizWrong, setQuizWrong] = useState<string | null>(null);

  const weekStart = nextWeekStart();
  const weekStartStr = toDateStr(weekStart);
  const pastDeadline = isPastDeadline();

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('availability_submissions')
        .select('available_days')
        .eq('waiter_id', waiterId)
        .eq('week_start', weekStartStr)
        .maybeSingle();
      if (data) {
        setExisting(data.available_days);
        setSelectedDays(new Set(data.available_days));
      }
      setLoading(false);
    };
    load();
  }, [waiterId, weekStartStr]);

  function toggleDay(i: number) {
    setSelectedDays((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    setSuccess(false);
  }

  // שליפת שאלה אקראית ממודול השירות
  async function fetchRandomQuestion(): Promise<QuizQ | null> {
    const supabase = createClient();
    const { data: lessons } = await supabase
      .from('training_lessons')
      .select('title, quiz_question, quiz_options, quiz_explanation')
      .eq('module_id', SERVICE_MODULE_ID)
      .eq('is_active', true);
    if (!lessons || lessons.length === 0) return null;
    const pick = lessons[Math.floor(Math.random() * lessons.length)];
    return {
      lessonTitle: pick.title,
      question: pick.quiz_question,
      options: pick.quiz_options as QuizQ['options'],
      explanation: pick.quiz_explanation,
    };
  }

  // לחיצה על "הגש" - קודם שאלה
  async function startSubmit() {
    setError(null);
    if (selectedDays.size === 0) {
      setError('סמן לפחות יום אחד שאתה יכול לעבוד');
      return;
    }
    const q = await fetchRandomQuestion();
    if (!q) {
      // אין שאלות - מגישים ישר (fallback)
      await doSubmit();
      return;
    }
    setQuizQ(q);
    setQuizAnswer(null);
    setQuizWrong(null);
  }

  // בדיקת תשובה
  async function checkAnswer() {
    if (quizAnswer === null || !quizQ) return;
    const correct = quizQ.options[quizAnswer]?.is_correct === true;
    if (correct) {
      setQuizQ(null);
      await doSubmit();
    } else {
      // טעות - מציגים הסבר ושאלה חדשה
      setQuizWrong(quizQ.explanation);
      const q = await fetchRandomQuestion();
      setQuizQ(q);
      setQuizAnswer(null);
    }
  }

  // שמירה בפועל
  async function doSubmit() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const days = Array.from(selectedDays).sort();
    const { error: upErr } = await supabase
      .from('availability_submissions')
      .upsert(
        { waiter_id: waiterId, week_start: weekStartStr, available_days: days },
        { onConflict: 'waiter_id,week_start' }
      );
    if (upErr) {
      setError('שגיאה בשמירה, נסה שוב');
    } else {
      setExisting(days);
      setSuccess(true);
      setQuizWrong(null);
    }
    setSaving(false);
  }

  if (loading) return <div className="text-sm text-slate-400 p-4">טוען...</div>;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">🗓️ הגשת זמינות לשבוע הבא</h2>
        <p className="text-sm text-slate-500">
          סמן את הימים שאתה <b>יכול</b> לעבוד בהם · שבוע {weekDates[0].getDate()}/{weekDates[0].getMonth() + 1} - {weekDates[6].getDate()}/{weekDates[6].getMonth() + 1}
        </p>
        <p className="text-xs font-medium text-rose-600 mt-1">
          ⏰ דדליין הגשה: יום שלישי ב-10:00 בבוקר · מי שלא הגיש - לא ישובץ
        </p>
      </div>

      {/* סטטוס */}
      {existing && !success && (
        <div className="mb-4 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          ✅ הגשת זמינות לשבוע הבא ({existing.map((d) => DAYS_HE[d]).join(', ')}). אפשר לעדכן ולהגיש שוב.
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
          🎉 הזמינות נשמרה! ({Array.from(selectedDays).sort().map((d) => DAYS_HE[d]).join(', ')})
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* שאלת מבחן לפני הגשה */}
      {quizQ ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <div className="text-xs font-bold text-amber-600 mb-1">🍷 שאלה קצרה לפני ההגשה</div>
          {quizWrong && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              ❌ לא נכון. {quizWrong}
              <div className="mt-1 font-medium">הנה שאלה נוספת:</div>
            </div>
          )}
          <div className="text-sm font-bold text-slate-900 mb-3">{quizQ.question}</div>
          <div className="space-y-2 mb-4">
            {quizQ.options.map((op, i) => (
              <button
                key={i}
                onClick={() => setQuizAnswer(i)}
                className={`w-full text-right rounded-lg border px-4 py-2.5 text-sm transition ${
                  quizAnswer === i
                    ? 'border-amber-500 bg-amber-100 font-semibold'
                    : 'border-slate-200 bg-white hover:border-amber-300'
                }`}
              >
                {op.text}
              </button>
            ))}
          </div>
          <button
            onClick={checkAnswer}
            disabled={quizAnswer === null || saving}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-300"
          >
            {saving ? 'שומר...' : 'בדוק תשובה והגש'}
          </button>
        </div>
      ) : (
        <>
          {/* בחירת ימים */}
          <div className="grid grid-cols-7 gap-1.5 mb-4">
            {weekDates.map((d, i) => {
              const on = selectedDays.has(i);
              return (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={`rounded-xl border-2 py-3 text-center transition ${
                    on
                      ? 'border-green-500 bg-green-50'
                      : 'border-slate-200 bg-white hover:border-green-300'
                  }`}
                >
                  <div className="text-[11px] font-medium text-slate-500">{DAYS_HE[i]}</div>
                  <div className="text-sm font-bold text-slate-800">
                    {d.getDate()}/{d.getMonth() + 1}
                  </div>
                  <div className="mt-1 text-base">{on ? '✅' : '·'}</div>
                </button>
              );
            })}
          </div>

          <button
            onClick={startSubmit}
            disabled={saving || pastDeadline}
            className="w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:bg-slate-300"
          >
            {existing ? '🔄 עדכן זמינות' : '📤 הגש זמינות'}
          </button>
          {pastDeadline && !existing && (
            <p className="mt-2 text-center text-xs text-red-600 font-medium">
              הדדליין להגשה עבר (שלישי 10:00). פנה למנהל.
            </p>
          )}
        </>
      )}
    </div>
  );
}
