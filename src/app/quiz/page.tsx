'use client';

import { useState, useEffect } from 'react';

interface QuizOption {
  text: string;
  is_correct: boolean;
}

interface Question {
  id: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question_text: string;
  options: QuizOption[];
  explanation: string;
  points: number;
}

interface AnswerResult {
  is_correct: boolean;
  points_earned: number;
  correct_option_index: number;
}

const categoryLabels: Record<string, string> = {
  procedures: 'נהלים',
  menu: 'תפריט',
  sales: 'מכירות',
  service: 'שירות',
  allergens: 'אלרגנים',
  cocktails: 'קוקטיילים',
  wine: 'יינות',
};

const difficultyLabels: Record<string, string> = {
  easy: 'קל',
  medium: 'בינוני',
  hard: 'קשה',
};

const difficultyColors: Record<string, string> = {
  easy: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  hard: 'bg-red-100 text-red-700',
};

export default function QuizPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [totalScore, setTotalScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    loadQuestions();
  }, []);

  async function loadQuestions() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/quiz/generate');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'שגיאה');
      setQuestions(data.questions);
      setQuestionStartTime(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת השאלות');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectOption(index: number) {
    if (selectedOption !== null) return;

    setSelectedOption(index);
    const timeTaken = Math.round((Date.now() - questionStartTime) / 1000);

    try {
      const response = await fetch('/api/quiz/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: questions[currentIndex].id,
          selected_option_index: index,
          time_taken_seconds: timeTaken,
        }),
      });

      const result = await response.json() as AnswerResult;
      setAnswerResult(result);

      if (result.is_correct) {
        setTotalScore((prev) => prev + result.points_earned);
        setCorrectCount((prev) => prev + 1);
      }
    } catch {
      setAnswerResult({
        is_correct: false,
        points_earned: 0,
        correct_option_index: -1,
      });
    }
  }

  function handleNext() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedOption(null);
      setAnswerResult(null);
      setQuestionStartTime(Date.now());
    } else {
      setIsComplete(true);
    }
  }

  function handleRestart() {
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedOption(null);
    setAnswerResult(null);
    setTotalScore(0);
    setCorrectCount(0);
    setIsComplete(false);
    loadQuestions();
  }

  if (isLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">מכין את הקוויז שלך...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-lg p-8">
          <div className="text-4xl mb-3">😔</div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">משהו השתבש</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <button
            onClick={loadQuestions}
            className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-lg font-medium transition"
          >
            נסה שוב
          </button>
        </div>
      </div>
    );
  }

  if (isComplete) {
    const accuracy = Math.round((correctCount / questions.length) * 100);
    const emoji = accuracy >= 80 ? '🏆' : accuracy >= 60 ? '👏' : '💪';
    const message = accuracy >= 80 ? 'מעולה!' : accuracy >= 60 ? 'יפה מאוד' : 'יש מקום לשיפור';

    return (
      <div dir="rtl" className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <a href="/" className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg">
                🍷
              </a>
              <h1 className="font-semibold text-slate-900">קוויז יומי</h1>
            </div>
            <a href="/" className="text-sm text-slate-500 hover:text-slate-900">
              ← חזרה לבית
            </a>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-6 py-12">
          <div className="bg-white rounded-3xl shadow-lg p-10 text-center">
            <div className="text-6xl mb-4">{emoji}</div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{message}</h2>
            <p className="text-slate-600 mb-8">סיימת את הקוויז היומי שלך</p>

            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">תשובות נכונות</p>
                <p className="text-2xl font-bold text-slate-900">
                  {correctCount}/{questions.length}
                </p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">דיוק</p>
                <p className="text-2xl font-bold text-slate-900">{accuracy}%</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-500 mb-1">ניקוד</p>
                <p className="text-2xl font-bold text-slate-900">+{totalScore}</p>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <a
                href="/"
                className="px-6 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition"
              >
                חזרה לבית
              </a>
              <button
                onClick={handleRestart}
                className="bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-lg font-medium transition"
              >
                קוויז נוסף
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const question = questions[currentIndex];
  const progressPercent = ((currentIndex + 1) / questions.length) * 100;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <a href="/" className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg hover:bg-slate-800 transition">
              🍷
            </a>
            <div>
              <h1 className="font-semibold text-slate-900 leading-tight">קוויז יומי</h1>
              <p className="text-xs text-slate-500">חימום של 3 דק לפני המשמרת</p>
            </div>
          </div>
          <a href="/" className="text-sm text-slate-500 hover:text-slate-900">
            ← חזרה
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-3 px-1">
          <p className="text-sm text-slate-600 font-medium">
            שאלה {currentIndex + 1} מתוך {questions.length}
          </p>
          <p className="text-sm text-slate-500">
            ניקוד: <span className="font-semibold text-slate-900">{totalScore}</span>
          </p>
        </div>

        <div className="h-2 bg-slate-200 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-slate-900 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-4">
          <div className="flex gap-2 mb-4">
            <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-700 rounded-md font-medium">
              {categoryLabels[question.category] || question.category}
            </span>
            <span className={`text-xs px-2.5 py-1 rounded-md font-medium ${difficultyColors[question.difficulty]}`}>
              {difficultyLabels[question.difficulty]}
            </span>
            <span className="text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-md font-medium">
              +{question.points} נק
            </span>
          </div>

          <h2 className="text-lg font-semibold text-slate-900 mb-6 leading-relaxed">
            {question.question_text}
          </h2>

          <div className="space-y-2.5">
            {question.options.map((option, index) => {
              const isSelected = selectedOption === index;
              const isCorrectAnswer = answerResult && index === answerResult.correct_option_index;
              const isWrongSelection = answerResult && isSelected && !answerResult.is_correct;

              let buttonClass = 'w-full text-right px-4 py-3.5 rounded-lg border transition font-medium ';

              if (answerResult) {
                if (isCorrectAnswer) {
                  buttonClass += 'bg-green-50 border-green-400 text-green-900';
                } else if (isWrongSelection) {
                  buttonClass += 'bg-red-50 border-red-400 text-red-900';
                } else {
                  buttonClass += 'bg-slate-50 border-slate-200 text-slate-500';
                }
              } else {
                buttonClass += isSelected
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 hover:border-slate-400 text-slate-900';
              }

              return (
                <button
                  key={index}
                  onClick={() => handleSelectOption(index)}
                  disabled={selectedOption !== null}
                  className={buttonClass}
                >
                  <div className="flex items-center justify-between">
                    <span>{option.text}</span>
                    {answerResult && isCorrectAnswer && <span>✓</span>}
                    {answerResult && isWrongSelection && <span>✗</span>}
                  </div>
                </button>
              );
            })}
          </div>

          {answerResult && (
            <div
              className={`mt-5 p-4 rounded-xl ${
                answerResult.is_correct
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-amber-50 border border-amber-200'
              }`}
            >
              <p
                className={`font-semibold mb-1 ${
                  answerResult.is_correct ? 'text-green-900' : 'text-amber-900'
                }`}
              >
                {answerResult.is_correct
                  ? `✓ תשובה נכונה · +${answerResult.points_earned} נק`
                  : '✗ לא נכון - לפעם הבאה'}
              </p>
              <p
                className={`text-sm ${
                  answerResult.is_correct ? 'text-green-800' : 'text-amber-800'
                }`}
              >
                {question.explanation}
              </p>
            </div>
          )}

          {answerResult && (
            <button
              onClick={handleNext}
              className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-lg font-medium transition"
            >
              {currentIndex < questions.length - 1 ? 'שאלה הבאה ←' : 'סיים קוויז ✓'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
