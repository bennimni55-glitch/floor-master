'use client';

import { useState, useEffect, useRef } from 'react';

type ScenarioType = 'angry_customer' | 'upsell' | 'allergy' | 'vip';

interface Scenario {
  id: ScenarioType;
  title: string;
  description: string;
  icon: string;
  difficulty: string;
  difficultyColor: string;
}

const scenarios: Scenario[] = [
  {
    id: 'angry_customer',
    title: 'לקוח מתוסכל',
    description: 'המנה איחרה. הלקוח רעב ועצבני. איך תציל את החוויה?',
    icon: '😡',
    difficulty: 'קשה',
    difficultyColor: 'bg-red-100 text-red-700',
  },
  {
    id: 'upsell',
    title: 'אפסייל בקבוקים',
    description: 'השולחן הזמין 2×1 ליטר. תוכל להעלות אותם ל-3 ליטר?',
    icon: '📈',
    difficulty: 'בינוני',
    difficultyColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'allergy',
    title: 'אלרגיה חמורה',
    description: 'לקוחה אלרגית לאגוזים מזמינה מהתפריט. איך תטפל?',
    icon: '⚠️',
    difficulty: 'בינוני',
    difficultyColor: 'bg-amber-100 text-amber-700',
  },
  {
    id: 'vip',
    title: 'לקוח VIP',
    description: 'חוגגים יום הולדת 40 עם 12 חברים. איך עושים בלגן נכון?',
    icon: '⭐',
    difficulty: 'קל',
    difficultyColor: 'bg-green-100 text-green-700',
  },
];

interface Message {
  role: 'customer' | 'waiter';
  text: string;
  mood?: number;
}

interface Feedback {
  score: number;
  strengths: string[];
  improvements: string[];
  key_tip: string;
  points_earned: number;
}

export default function SimulatorPage() {
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [currentMood, setCurrentMood] = useState<number>(5);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function startScenario(scenario: Scenario) {
    setSelectedScenario(scenario);
    setMessages([]);
    setError(null);
    setFeedback(null);
    setSessionId(null);
    setIsLoading(true);

    try {
      const response = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_type: scenario.id,
          conversation: [],
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'שגיאה');

      setMessages([{
        role: 'customer',
        text: data.customer_message,
        mood: data.mood,
      }]);
      setCurrentMood(data.mood);
      if (data.session_id) setSessionId(data.session_id);

      if (data.is_session_complete && data.feedback) {
        setFeedback(data.feedback);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setIsLoading(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!currentMessage.trim() || !selectedScenario || isLoading) return;

    const waiterMessage = currentMessage;
    const updatedMessages: Message[] = [
      ...messages,
      { role: 'waiter', text: waiterMessage },
    ];

    setMessages(updatedMessages);
    setCurrentMessage('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_type: selectedScenario.id,
          conversation: updatedMessages,
          session_id: sessionId,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || 'שגיאה');

      setMessages([
        ...updatedMessages,
        {
          role: 'customer',
          text: data.customer_message,
          mood: data.mood,
        },
      ]);
      setCurrentMood(data.mood);

      if (data.is_session_complete && data.feedback) {
        setFeedback(data.feedback);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה');
    } finally {
      setIsLoading(false);
    }
  }

  function resetSimulator() {
    setSelectedScenario(null);
    setMessages([]);
    setFeedback(null);
    setSessionId(null);
    setError(null);
  }

  function getMoodEmoji(mood: number) {
    if (mood <= 2) return '😡';
    if (mood <= 4) return '😠';
    if (mood <= 6) return '😐';
    if (mood <= 8) return '🙂';
    return '😊';
  }

  function getMoodColor(mood: number) {
    if (mood <= 3) return 'bg-red-100 text-red-700';
    if (mood <= 5) return 'bg-amber-100 text-amber-700';
    if (mood <= 7) return 'bg-blue-100 text-blue-700';
    return 'bg-green-100 text-green-700';
  }

  // Scenario selection screen
  if (!selectedScenario) {
    return (
      <div dir="rtl" className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <a href="/" className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg hover:bg-slate-800 transition">
                🍷
              </a>
              <div>
                <h1 className="font-semibold text-slate-900 leading-tight">סימולטור לקוחות</h1>
                <p className="text-xs text-slate-500">תרגול תרחישים אמיתיים מהשטח</p>
              </div>
            </div>
            <a href="/" className="text-sm text-slate-500 hover:text-slate-900">
              ← חזרה
            </a>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-6 py-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-slate-900 mb-2">בחר תרחיש לתרגול</h2>
            <p className="text-sm text-slate-600">
              לקוח וירטואלי יציג לך מצב, ואתה תתאמן בתגובה. בסוף תקבל ציון וטיפים לשיפור.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {scenarios.map((scenario) => (
              <button
                key={scenario.id}
                onClick={() => startScenario(scenario)}
                className="bg-white text-right rounded-2xl border border-slate-200 hover:border-slate-400 hover:shadow-md transition p-5 group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="text-3xl">{scenario.icon}</div>
                  <span className={`text-xs px-2.5 py-1 rounded-md font-medium ${scenario.difficultyColor}`}>
                    {scenario.difficulty}
                  </span>
                </div>
                <h3 className="font-semibold text-slate-900 mb-1.5">{scenario.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{scenario.description}</p>
                <div className="mt-3 text-xs text-slate-400 group-hover:text-slate-700 transition">
                  התחל תרחיש ←
                </div>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  // Feedback screen
  if (feedback) {
    const emoji = feedback.score >= 8 ? '🏆' : feedback.score >= 6 ? '👏' : '💪';
    const message = feedback.score >= 8 ? 'מעולה!' : feedback.score >= 6 ? 'יפה מאוד' : 'יש מקום לשיפור';

    return (
      <div dir="rtl" className="min-h-screen bg-slate-50">
        <header className="bg-white border-b border-slate-200">
          <div className="max-w-3xl mx-auto px-6 py-4 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <a href="/" className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg">
                🍷
              </a>
              <h1 className="font-semibold text-slate-900">סיום סימולציה</h1>
            </div>
            <a href="/" className="text-sm text-slate-500 hover:text-slate-900">
              ← חזרה לבית
            </a>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-6 py-12">
          <div className="bg-white rounded-3xl shadow-lg p-8">
            <div className="text-center mb-8">
              <div className="text-6xl mb-3">{emoji}</div>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">{message}</h2>
              <p className="text-slate-500 text-sm">{selectedScenario.title}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">ציון</p>
                <p className="text-3xl font-bold text-slate-900">{feedback.score}<span className="text-lg text-slate-400">/10</span></p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">נקודות שהרווחת</p>
                <p className="text-3xl font-bold text-slate-900">+{feedback.points_earned}</p>
              </div>
            </div>

            {feedback.strengths.length > 0 && (
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-green-700 mb-2 flex items-center gap-2">
                  <span>✓</span> מה עשית טוב
                </h3>
                <ul className="space-y-1.5">
                  {feedback.strengths.map((s, i) => (
                    <li key={i} className="text-sm text-slate-700 bg-green-50 rounded-lg px-3 py-2">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {feedback.improvements.length > 0 && (
              <div className="mb-5">
                <h3 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-2">
                  <span>⚡</span> נקודות לשיפור
                </h3>
                <ul className="space-y-1.5">
                  {feedback.improvements.map((s, i) => (
                    <li key={i} className="text-sm text-slate-700 bg-amber-50 rounded-lg px-3 py-2">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <h3 className="text-sm font-semibold text-blue-900 mb-1.5 flex items-center gap-2">
                <span>💡</span> טיפ עיקרי לפעם הבאה
              </h3>
              <p className="text-sm text-blue-800 leading-relaxed">{feedback.key_tip}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={resetSimulator}
                className="flex-1 px-6 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition"
              >
                תרחיש אחר
              </button>
              <button
                onClick={() => startScenario(selectedScenario)}
                className="flex-1 bg-slate-900 hover:bg-slate-800 text-white px-6 py-2.5 rounded-lg font-medium transition"
              >
                נסה שוב
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Active simulation screen
  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="text-2xl">{selectedScenario.icon}</div>
            <div>
              <h1 className="font-semibold text-slate-900 leading-tight">{selectedScenario.title}</h1>
              <p className="text-xs text-slate-500">סימולציה פעילה</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2.5 py-1 rounded-md font-medium ${getMoodColor(currentMood)}`}>
              {getMoodEmoji(currentMood)} מצב רוח {currentMood}/10
            </span>
            <button
              onClick={resetSimulator}
              className="text-sm text-slate-500 hover:text-red-600 transition"
            >
              סיים
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-6 flex flex-col">
        <div className="flex-1 space-y-4 mb-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'waiter' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === 'waiter'
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-900'
                }`}
              >
                {msg.role === 'customer' && (
                  <p className="text-xs font-medium text-slate-500 mb-1">
                    👤 לקוח
                  </p>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={sendMessage} className="bg-white rounded-2xl border border-slate-200 p-3 flex gap-2 sticky bottom-4 shadow-sm">
          <textarea
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(e);
              }
            }}
            placeholder="כתוב את תגובתך ללקוח..."
            rows={2}
            disabled={isLoading}
            className="flex-1 px-3 py-2 border-0 focus:outline-none resize-none text-sm"
          />
          <button
            type="submit"
            disabled={isLoading || !currentMessage.trim()}
            className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-medium px-5 py-2 rounded-lg transition self-end"
          >
            שלח
          </button>
        </form>
      </main>
    </div>
  );
}
