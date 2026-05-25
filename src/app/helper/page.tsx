'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useEffect } from 'react';

interface QueryHistory {
  question: string;
  answer: string;
  timestamp: Date;
}

export default function HelperPage() {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<QueryHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ email: string; isAdmin: boolean } | null>(null);

  // טעינת פרטי משתמש
  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const supabasePublic = createClient();
        const { data: access } = await supabasePublic
          .from('user_app_access' as never)
          .select('is_floor_master_admin')
          .single();
        setUserInfo({
          email: user.email || '',
          isAdmin: (access as { is_floor_master_admin?: boolean })?.is_floor_master_admin || false,
        });
      }
    }
    loadUser();
  }, []);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || question.length < 3) {
      setError('כתוב שאלה ארוכה יותר');
      return;
    }

    setIsLoading(true);
    setError(null);
    const currentQuestion = question;

    try {
      const response = await fetch('/api/helper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: currentQuestion }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'שגיאה');
      }

      // הוספה לתחילת ההיסטוריה
      setHistory((prev) => [
        { question: currentQuestion, answer: data.answer, timestamp: new Date() },
        ...prev,
      ]);
      setQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'משהו השתבש');
    } finally {
      setIsLoading(false);
    }
  }

  const quickQuestions = [
    'איזה יין מתאים להמבורגר?',
    'קינוח קל למישהו שאמר שהוא מפוצץ',
    'מנה טבעונית מומלצת',
    'איך מציעים אפסייל לקוקטייל?',
  ];

  function getInitials(email: string) {
    const name = email.split('@')[0];
    return name.substring(0, 2).toUpperCase();
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <a href="/" className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg hover:bg-slate-800 transition">
                🍷
              </a>
              <div>
                <h1 className="font-semibold text-slate-900 leading-tight">עוזר בזמן אמת</h1>
                <p className="text-xs text-slate-500">תשובה מהירה במהלך משמרת</p>
              </div>
            </div>
            <a href="/" className="text-sm text-slate-500 hover:text-slate-900">
              ← חזרה
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Question Form */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">
          <form onSubmit={handleAsk} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                💡 שאלה מהירה
              </label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="לדוגמה: שולחן 4 הזמין 2 המבורגרים, איזה יין להציע?"
                rows={3}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none resize-none"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <div className="flex justify-between items-center">
              <button
                type="submit"
                disabled={isLoading || question.length < 3}
                className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-medium px-6 py-2.5 rounded-lg transition flex items-center gap-2"
              >
                {isLoading ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    מחשב...
                  </>
                ) : (
                  <>שלח שאלה</>
                )}
              </button>
              <span className="text-xs text-slate-400">
                Claude AI · מבוסס על התדריך שלך
              </span>
            </div>
          </form>

          {/* Quick questions */}
          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-500 mb-2">שאלות נפוצות:</p>
            <div className="flex flex-wrap gap-2">
              {quickQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setQuestion(q)}
                  disabled={isLoading}
                  className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-full transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-slate-500 px-2">
              היסטוריית שאלות ({history.length})
            </h2>
            {history.map((item, i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden"
              >
                {/* Question */}
                <div className="p-4 bg-slate-50 border-b border-slate-100">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-slate-200 text-slate-700 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0">
                      {userInfo ? getInitials(userInfo.email) : '👤'}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-900 font-medium">
                        {item.question}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.timestamp.toLocaleTimeString('he-IL', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Answer */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-slate-900 text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">
                      🤖
                    </div>
                    <div className="flex-1 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {item.answer}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {history.length === 0 && (
          <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-2xl p-12 text-center">
            <div className="text-4xl mb-3">💡</div>
            <h3 className="font-medium text-slate-700 mb-1">העוזר שלך מוכן</h3>
            <p className="text-sm text-slate-500">
              שאל שאלה והקבל תשובה מבוססת על התפריט והנהלים של המסעדה
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
