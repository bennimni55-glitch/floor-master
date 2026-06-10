'use client';

import { useState, useEffect, use } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Module {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
}

interface QuizOption {
  text: string;
  is_correct: boolean;
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  content: string;
  display_order: number;
  quiz_question: string | null;
  quiz_options: QuizOption[] | null;
  quiz_correct_index: number | null;
  quiz_explanation: string | null;
}

interface Progress {
  lesson_id: string;
  completed_at: string | null;
  quiz_correct: boolean | null;
  quiz_attempts: number;
}

export default function ModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  
  const [module, setModule] = useState<Module | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [waiterId, setWaiterId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // לשיעור פעיל
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [isLastLesson, setIsLastLesson] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    setIsLoading(true);
    try {
      const supabase = createClient();

      // טעינת המלצר
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: waiter } = await supabase
          .from('waiters')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();
        if (waiter) setWaiterId(waiter.id);
      }

      // טעינת מודול
      const { data: moduleData } = await supabase
        .from('training_modules')
        .select('*')
        .eq('id', id)
        .single();
      setModule(moduleData);

      // טעינת שיעורים
      const { data: lessonsData } = await supabase
        .from('training_lessons')
        .select('*')
        .eq('module_id', id)
        .eq('is_active', true)
        .order('display_order');
      setLessons((lessonsData || []) as Lesson[]);

      // טעינת התקדמות
      if (user) {
        const { data: waiter } = await supabase
          .from('waiters')
          .select('id')
          .eq('auth_user_id', user.id)
          .single();
        
        if (waiter) {
          const lessonIds = (lessonsData || []).map(l => l.id);
          if (lessonIds.length > 0) {
            const { data: progressData } = await supabase
              .from('training_progress')
              .select('lesson_id, completed_at, quiz_correct, quiz_attempts')
              .eq('waiter_id', waiter.id)
              .in('lesson_id', lessonIds);
            setProgress((progressData || []) as Progress[]);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  function openLesson(lesson: Lesson, isLast: boolean) {
    setActiveLesson(lesson);
    setSelectedOption(null);
    setQuizSubmitted(false);
    setIsLastLesson(isLast);
  }

  function closeLesson() {
    setActiveLesson(null);
    setSelectedOption(null);
    setQuizSubmitted(false);
  }

  function getLessonStatus(lessonId: string): 'completed' | 'attempted' | 'new' {
    const p = progress.find(x => x.lesson_id === lessonId);
    if (p?.completed_at) return 'completed';
    if (p?.quiz_attempts && p.quiz_attempts > 0) return 'attempted';
    return 'new';
  }

  async function submitQuiz() {
    if (!activeLesson || selectedOption === null || !waiterId) return;
    
    setQuizSubmitted(true);
    const isCorrect = selectedOption === activeLesson.quiz_correct_index;
    
    try {
      const supabase = createClient();
      const existing = progress.find(p => p.lesson_id === activeLesson.id);
      const newAttempts = (existing?.quiz_attempts || 0) + 1;

      if (existing) {
        await supabase
          .from('training_progress')
          .update({
            quiz_answered: true,
            quiz_correct: isCorrect,
            quiz_attempts: newAttempts,
            completed_at: isCorrect ? new Date().toISOString() : null,
          })
          .eq('waiter_id', waiterId)
          .eq('lesson_id', activeLesson.id);
      } else {
        await supabase
          .from('training_progress')
          .insert({
            waiter_id: waiterId,
            lesson_id: activeLesson.id,
            quiz_answered: true,
            quiz_correct: isCorrect,
            quiz_attempts: newAttempts,
            completed_at: isCorrect ? new Date().toISOString() : null,
          });
      }

      // רענון נתונים
      await loadData();
    } catch (err) {
      console.error(err);
    }
  }

  function tryAgain() {
    setSelectedOption(null);
    setQuizSubmitted(false);
  }

  function goToNextLesson() {
    if (!activeLesson) return;
    const currentIndex = lessons.findIndex(l => l.id === activeLesson.id);
    if (currentIndex < lessons.length - 1) {
      const nextLesson = lessons[currentIndex + 1];
      const isLast = currentIndex + 1 === lessons.length - 1;
      openLesson(nextLesson, isLast);
    } else {
      closeLesson();
    }
  }

  if (isLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!module) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600 mb-3">המודול לא נמצא</p>
          <a href="/training" className="text-slate-900 underline">← חזרה לספר ההדרכה</a>
        </div>
      </div>
    );
  }

  const completedCount = lessons.filter(l => getLessonStatus(l.id) === 'completed').length;
  const progressPct = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 0;

  // אם יש שיעור פעיל - מציגים את דף השיעור
  if (activeLesson) {
    const isCorrect = selectedOption === activeLesson.quiz_correct_index;
    const lessonProgress = progress.find(p => p.lesson_id === activeLesson.id);
    const currentIndex = lessons.findIndex(l => l.id === activeLesson.id);

    return (
      <div dir="rtl" className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="max-w-3xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <button onClick={closeLesson} className="text-slate-500 hover:text-slate-900">
                ← חזרה
              </button>
            </div>
            <p className="text-xs text-slate-500">
              שיעור {currentIndex + 1} מתוך {lessons.length}
            </p>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-6 py-8">
          {/* כותרת השיעור */}
          <div className="mb-6">
            <p className="text-sm text-slate-500 mb-1">{module.title}</p>
            <h1 className="text-2xl font-bold text-slate-900">{activeLesson.title}</h1>
          </div>

          {/* תוכן השיעור */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
            <div className="prose prose-slate max-w-none">
              {activeLesson.content.split('\n').map((line, i) => {
                // Bold text **text**
                const parts = line.split(/(\*\*[^*]+\*\*)/g);
                const formatted = parts.map((part, j) => {
                  if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={j} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
                  }
                  return <span key={j}>{part}</span>;
                });

                // Empty line
                if (line.trim() === '') {
                  return <div key={i} className="h-3"></div>;
                }

                return (
                  <p key={i} className="text-slate-700 leading-relaxed mb-2">
                    {formatted}
                  </p>
                );
              })}
            </div>
          </div>

          {/* קוויז */}
          {activeLesson.quiz_question && activeLesson.quiz_options && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🎯</span>
                <h3 className="font-semibold text-slate-900">בדיקת הבנה</h3>
              </div>

              <p className="text-lg text-slate-900 mb-5 font-medium">
                {activeLesson.quiz_question}
              </p>

              <div className="space-y-2 mb-5">
                {activeLesson.quiz_options.map((option, i) => {
                  const isSelected = selectedOption === i;
                  const isCorrectOption = i === activeLesson.quiz_correct_index;
                  
                  let className = 'w-full text-right px-4 py-3 rounded-lg border-2 transition font-medium ';
                  
                  if (quizSubmitted) {
                    if (isCorrectOption) {
                      className += 'bg-green-50 border-green-400 text-green-900';
                    } else if (isSelected && !isCorrectOption) {
                      className += 'bg-red-50 border-red-400 text-red-900';
                    } else {
                      className += 'bg-slate-50 border-slate-200 text-slate-500';
                    }
                  } else {
                    className += isSelected
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : 'bg-white border-slate-200 hover:border-slate-400 text-slate-900';
                  }

                  return (
                    <button
                      key={i}
                      onClick={() => !quizSubmitted && setSelectedOption(i)}
                      disabled={quizSubmitted}
                      className={className}
                    >
                      <div className="flex items-center justify-between">
                        <span>{option.text}</span>
                        {quizSubmitted && isCorrectOption && <span>✓</span>}
                        {quizSubmitted && isSelected && !isCorrectOption && <span>✗</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* תוצאה אחרי הגשה */}
              {quizSubmitted && (
                <div className={`p-4 rounded-xl mb-4 ${
                  isCorrect ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
                }`}>
                  <p className={`font-semibold mb-1 ${isCorrect ? 'text-green-900' : 'text-amber-900'}`}>
                    {isCorrect ? '🎉 כל הכבוד! תשובה נכונה' : '😅 לא נכון - נסה שוב'}
                  </p>
                  {activeLesson.quiz_explanation && (
                    <p className={`text-sm ${isCorrect ? 'text-green-800' : 'text-amber-800'}`}>
                      {activeLesson.quiz_explanation}
                    </p>
                  )}
                  {lessonProgress && lessonProgress.quiz_attempts > 1 && (
                    <p className="text-xs text-slate-500 mt-2">
                      ניסיון {lessonProgress.quiz_attempts}
                    </p>
                  )}
                </div>
              )}

              {/* כפתורים */}
              {!quizSubmitted ? (
                <button
                  onClick={submitQuiz}
                  disabled={selectedOption === null}
                  className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white font-medium py-3 rounded-lg transition"
                >
                  שלח תשובה
                </button>
              ) : isCorrect ? (
                currentIndex < lessons.length - 1 ? (
                  <button
                    onClick={goToNextLesson}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg transition"
                  >
                    שיעור הבא ←
                  </button>
                ) : (
                  <button
                    onClick={closeLesson}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 rounded-lg transition"
                  >
                    🏆 סיימת את המודול!
                  </button>
                )
              ) : (
                <button
                  onClick={tryAgain}
                  className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-lg transition"
                >
                  נסה שוב
                </button>
              )}
            </div>
          )}
        </main>
      </div>
    );
  }

  // מצב רגיל - רשימת שיעורים
  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a href="/training" className="text-slate-500 hover:text-slate-900 text-sm">
              ← ספר ההדרכה
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {/* כותרת מודול */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center text-3xl flex-shrink-0">
              {module.icon || '📚'}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-slate-900 mb-1">{module.title}</h1>
              {module.description && (
                <p className="text-sm text-slate-600">{module.description}</p>
              )}
            </div>
          </div>

          {/* פס התקדמות */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  progressPct === 100 ? 'bg-green-500' : 'bg-slate-900'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-sm text-slate-600 font-medium whitespace-nowrap">
              {completedCount}/{lessons.length} · {progressPct}%
            </span>
          </div>
        </div>

        {/* רשימת שיעורים */}
        <div className="space-y-3">
          {lessons.map((lesson, i) => {
            const status = getLessonStatus(lesson.id);
            const isLast = i === lessons.length - 1;
            
            // האם המלצר יכול לגשת לשיעור הזה?
            const previousLesson = i > 0 ? lessons[i - 1] : null;
            const canAccess = i === 0 || (previousLesson && getLessonStatus(previousLesson.id) === 'completed');
            
            return (
              <button
                key={lesson.id}
                onClick={() => canAccess && openLesson(lesson, isLast)}
                disabled={!canAccess}
                className={`w-full text-right bg-white rounded-xl border-2 transition p-4 ${
                  canAccess
                    ? 'border-slate-200 hover:border-slate-400 hover:shadow-md cursor-pointer'
                    : 'border-slate-200 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    status === 'completed' ? 'bg-green-500 text-white' :
                    status === 'attempted' ? 'bg-amber-500 text-white' :
                    canAccess ? 'bg-slate-200 text-slate-700' :
                    'bg-slate-100 text-slate-400'
                  }`}>
                    {status === 'completed' ? '✓' : i + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 mb-0.5">{lesson.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {status === 'completed' && <span className="text-green-600">✓ הושלם</span>}
                      {status === 'attempted' && <span className="text-amber-600">🔄 בעבודה</span>}
                      {status === 'new' && canAccess && <span>📖 חדש</span>}
                      {!canAccess && <span>🔒 נעול - השלם שיעור קודם</span>}
                      {lesson.quiz_question && <span>· 🎯 כולל קוויז</span>}
                    </div>
                  </div>

                  {canAccess && <div className="text-slate-300">←</div>}
                </div>
              </button>
            );
          })}
        </div>

        {lessons.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <div className="text-4xl mb-2">📭</div>
            <p>אין שיעורים במודול זה</p>
          </div>
        )}
      </main>
    </div>
  );
}
