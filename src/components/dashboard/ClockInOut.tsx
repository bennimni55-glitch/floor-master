'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { DailyReminder } from './DailyReminder';

interface ClockInOutProps {
  waiterId: string;
  waiterName: string;
  activeClockId: string | null;
  activeClockStart: string | null;
  greeting: string;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function calculateDuration(start: Date, end: Date): { hours: number; minutes: number; seconds: number; totalSeconds: number } {
  const diffMs = end.getTime() - start.getTime();
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds, totalSeconds };
}

export function ClockInOut({ waiterId, waiterName, activeClockId, activeClockStart, greeting }: ClockInOutProps) {
  const [clockId, setClockId] = useState<string | null>(activeClockId);
  const [clockStart, setClockStart] = useState<Date | null>(
    activeClockStart ? new Date(activeClockStart) : null
  );
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isWorking = !!clockId && !!clockStart;

  useEffect(() => {
    if (isWorking) {
      setCurrentTime(new Date());
      intervalRef.current = setInterval(() => {
        setCurrentTime(new Date());
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isWorking]);

  async function clockIn() {
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const now = new Date();
      
      const { data, error: insertError } = await supabase
        .from('shift_clock')
        .insert({
          waiter_id: waiterId,
          clock_in: now.toISOString(),
          clock_date: now.toISOString().split('T')[0],
        })
        .select()
        .single();

      if (insertError) throw insertError;
      
      setClockId(data.id);
      setClockStart(now);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'שגיאה בהתחלת משמרת');
    } finally {
      setIsLoading(false);
    }
  }

  async function clockOut() {
    if (!clockId || !clockStart) return;
    if (!confirm('בטוח/ה שאתה רוצה לסיים משמרת?')) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const now = new Date();
      const duration = calculateDuration(clockStart, now);
      const hoursDecimal = (duration.totalSeconds / 3600).toFixed(2);

      const { error: updateError } = await supabase
        .from('shift_clock')
        .update({
          clock_out: now.toISOString(),
          hours_worked: parseFloat(hoursDecimal),
        })
        .eq('id', clockId);

      if (updateError) throw updateError;
      
      const hoursStr = String(duration.hours).padStart(2, '0');
      const minsStr = String(duration.minutes).padStart(2, '0');
      alert(`סיימת משמרת! עבדת ${hoursStr}:${minsStr} שעות (${hoursDecimal} שעות)`);
      
      setClockId(null);
      setClockStart(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'שגיאה בסיום משמרת');
    } finally {
      setIsLoading(false);
    }
  }

  // מצב 1: לא במשמרת
  if (!isWorking) {
    return (
      <div className="bg-gradient-to-l from-slate-900 to-slate-800 text-white rounded-2xl p-6 mb-6">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-semibold mb-1">
              {greeting}, {waiterName}! 👋
            </h2>
            <p className="text-slate-300 text-sm">
              {currentTime.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })} · {formatTime(currentTime)}
            </p>
          </div>
          <button
            onClick={clockIn}
            disabled={isLoading}
            className="bg-green-500 hover:bg-green-600 disabled:bg-slate-600 text-white font-semibold px-6 py-3 rounded-xl transition flex items-center gap-2 text-lg shadow-lg"
          >
            {isLoading ? '...' : (
              <>
                <span className="text-2xl">⏰</span>
                <span>התחל משמרת</span>
              </>
            )}
          </button>
        </div>
        {error && (
          <div className="mt-3 bg-red-500/20 border border-red-400 text-red-100 text-sm rounded-lg px-4 py-2">
            {error}
          </div>
        )}
      </div>
    );
  }

  // מצב 2: במשמרת (טיימר חי + תזכורת)
  const duration = clockStart ? calculateDuration(clockStart, currentTime) : { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };

  return (
    <div className="bg-gradient-to-l from-green-600 to-emerald-700 text-white rounded-2xl p-6 mb-6 shadow-xl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2.5 h-2.5 bg-red-400 rounded-full animate-pulse"></div>
            <h2 className="text-xl font-semibold">
              במשמרת ⚡
            </h2>
          </div>
          <p className="text-green-100 text-sm mb-3">
            {waiterName} · התחלת ב-{clockStart ? formatTime(clockStart) : ''}
          </p>
          
          {/* טיימר גדול עם שניות */}
          <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4 inline-block">
            <p className="text-xs text-green-100 mb-1">זמן במשמרת</p>
            <p className="text-3xl font-bold tabular-nums tracking-wider">
              {String(duration.hours).padStart(2, '0')}:{String(duration.minutes).padStart(2, '0')}:{String(duration.seconds).padStart(2, '0')}
            </p>
            <p className="text-xs text-green-200 mt-1">
              ({(duration.totalSeconds / 3600).toFixed(2)} שעות)
            </p>
          </div>
        </div>
        
        <button
          onClick={clockOut}
          disabled={isLoading}
          className="bg-red-500 hover:bg-red-600 disabled:bg-slate-600 text-white font-semibold px-6 py-3 rounded-xl transition flex items-center gap-2 text-lg shadow-lg"
        >
          {isLoading ? '...' : (
            <>
              <span className="text-2xl">🚪</span>
              <span>סיים משמרת</span>
            </>
          )}
        </button>
      </div>
      
      {/* 💡 תזכורת חדש! */}
      <DailyReminder context="during_shift" compact={true} />
      
      {error && (
        <div className="mt-3 bg-red-500/30 border border-red-300 text-red-50 text-sm rounded-lg px-4 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
