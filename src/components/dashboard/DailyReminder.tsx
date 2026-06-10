'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Reminder {
  id: string;
  category: string;
  title: string;
  message: string;
  icon: string;
  context: string;
}

interface DailyReminderProps {
  context: 'home_page' | 'during_shift';
  compact?: boolean;
}

const categoryColors: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  ownership: { 
    bg: 'bg-gradient-to-l from-purple-50 to-indigo-50', 
    border: 'border-purple-200', 
    text: 'text-purple-900',
    iconBg: 'bg-purple-100'
  },
  service: { 
    bg: 'bg-gradient-to-l from-blue-50 to-cyan-50', 
    border: 'border-blue-200', 
    text: 'text-blue-900',
    iconBg: 'bg-blue-100'
  },
  allergens: { 
    bg: 'bg-gradient-to-l from-red-50 to-orange-50', 
    border: 'border-red-200', 
    text: 'text-red-900',
    iconBg: 'bg-red-100'
  },
  check_in: { 
    bg: 'bg-gradient-to-l from-amber-50 to-yellow-50', 
    border: 'border-amber-200', 
    text: 'text-amber-900',
    iconBg: 'bg-amber-100'
  },
  cleanliness: { 
    bg: 'bg-gradient-to-l from-teal-50 to-emerald-50', 
    border: 'border-teal-200', 
    text: 'text-teal-900',
    iconBg: 'bg-teal-100'
  },
  sales: { 
    bg: 'bg-gradient-to-l from-green-50 to-lime-50', 
    border: 'border-green-200', 
    text: 'text-green-900',
    iconBg: 'bg-green-100'
  },
};

export function DailyReminder({ context, compact = false }: DailyReminderProps) {
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadReminder();
  }, [context]);

  async function loadReminder() {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('daily_reminders')
        .select('*')
        .eq('is_active', true)
        .in('context', [context, 'always']);

      if (data && data.length > 0) {
        // בחירה אקראית
        const randomIndex = Math.floor(Math.random() * data.length);
        setReminder(data[randomIndex] as Reminder);
      }
    } catch (err) {
      console.error('Error loading reminder:', err);
    } finally {
      setIsLoading(false);
    }
  }

  function nextReminder() {
    loadReminder();
  }

  if (isLoading || !reminder) return null;

  const colors = categoryColors[reminder.category] || categoryColors.service;

  // גרסה קומפקטית - לתוך כרטיס במשמרת
  if (compact) {
    return (
      <div className="mt-4 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl p-3">
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0">{reminder.icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/80 mb-1">💡 {reminder.title}</p>
            <p className="text-sm text-white leading-relaxed">{reminder.message}</p>
          </div>
          <button 
            onClick={nextReminder}
            className="text-white/60 hover:text-white text-sm transition flex-shrink-0"
            title="תזכורת אחרת"
          >
            ↻
          </button>
        </div>
      </div>
    );
  }

  // גרסה מלאה - לדף הבית
  return (
    <div className={`${colors.bg} border-2 ${colors.border} rounded-2xl p-5 mb-6`}>
      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 ${colors.iconBg} rounded-xl flex items-center justify-center text-3xl flex-shrink-0`}>
          {reminder.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <p className={`text-xs font-semibold ${colors.text} opacity-70`}>💡 תזכורת היום</p>
            <span className="text-xs text-slate-400">·</span>
            <p className={`text-sm font-bold ${colors.text}`}>{reminder.title}</p>
          </div>
          <p className={`text-base ${colors.text} leading-relaxed font-medium`}>
            {reminder.message}
          </p>
        </div>
        <button 
          onClick={nextReminder}
          className={`${colors.text} opacity-50 hover:opacity-100 text-xl transition flex-shrink-0`}
          title="תזכורת אחרת"
        >
          ↻
        </button>
      </div>
    </div>
  );
}
