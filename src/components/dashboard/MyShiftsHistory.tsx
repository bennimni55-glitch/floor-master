'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ShiftRecord {
  id: string;
  clock_date: string;
  clock_in: string;
  clock_out: string | null;
  hours_worked: number | null;
}

interface TipRecord {
  distribution_date: string;
  tip_amount: number;
  hours_worked: number;
}

interface MyShiftsHistoryProps {
  waiterId: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const day = days[date.getDay()];
  return `${day} · ${date.getDate()}/${date.getMonth() + 1}`;
}

function formatTime(timeStr: string): string {
  const date = new Date(timeStr);
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} דק'`;
  if (m === 0) return `${h} שעות`;
  return `${h}:${String(m).padStart(2, '0')} שעות`;
}

export function MyShiftsHistory({ waiterId }: MyShiftsHistoryProps) {
  const [shifts, setShifts] = useState<ShiftRecord[]>([]);
  const [tips, setTips] = useState<TipRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [waiterId]);

  async function loadData() {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const [shiftsRes, tipsRes] = await Promise.all([
        supabase
          .from('shift_clock')
          .select('id, clock_date, clock_in, clock_out, hours_worked')
          .eq('waiter_id', waiterId)
          .gte('clock_date', weekAgo)
          .not('clock_out', 'is', null)
          .order('clock_date', { ascending: false })
          .order('clock_in', { ascending: false }),
        supabase
          .from('tip_distribution_details')
          .select('tip_amount, hours_worked, tip_distributions(distribution_date)')
          .eq('waiter_id', waiterId),
      ]);

      setShifts((shiftsRes.data || []) as ShiftRecord[]);
      
      // המרה לטיפים לפי תאריך
      type TipDistDetail = {
        tip_amount: number;
        hours_worked: number;
        tip_distributions: { distribution_date: string } | { distribution_date: string }[] | null;
      };
      
      const tipsData = ((tipsRes.data || []) as TipDistDetail[]).map((t) => ({
        distribution_date: Array.isArray(t.tip_distributions) 
          ? t.tip_distributions[0]?.distribution_date 
          : t.tip_distributions?.distribution_date || '',
        tip_amount: Number(t.tip_amount),
        hours_worked: Number(t.hours_worked),
      })).filter(t => t.distribution_date && new Date(t.distribution_date) >= new Date(weekAgo));
      
      setTips(tipsData);
    } catch (err) {
      console.error('Error loading shifts history:', err);
    } finally {
      setIsLoading(false);
    }
  }

  function getTipForDate(date: string): number {
    const tip = tips.find(t => t.distribution_date === date);
    return tip?.tip_amount || 0;
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-center py-4">
          <div className="w-6 h-6 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (shifts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6">
        <h3 className="font-semibold text-slate-900 mb-3">📋 המשמרות שלי השבוע</h3>
        <div className="text-center py-6 text-slate-500">
          <div className="text-4xl mb-2">⏰</div>
          <p className="text-sm">עדיין לא רשמת משמרות השבוע</p>
          <p className="text-xs mt-1">לחץ על &quot;התחל משמרת&quot; למעלה כדי להתחיל</p>
        </div>
      </div>
    );
  }

  const totalHours = shifts.reduce((sum, s) => sum + Number(s.hours_worked || 0), 0);
  const totalTips = tips.reduce((sum, t) => sum + t.tip_amount, 0);
  const avgHourly = totalHours > 0 ? totalTips / totalHours : 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-6">
      <div className="p-5 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">📋 המשמרות שלי השבוע</h3>
        <p className="text-xs text-slate-500 mt-0.5">השבוע האחרון · {shifts.length} משמרות</p>
      </div>

      {/* רשימת משמרות */}
      <div className="divide-y divide-slate-100">
        {shifts.map((shift) => {
          const tipAmount = getTipForDate(shift.clock_date);
          
          return (
            <div key={shift.id} className="p-4 hover:bg-slate-50 transition">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900">{formatDate(shift.clock_date)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatTime(shift.clock_in)} - {shift.clock_out ? formatTime(shift.clock_out) : '—'}
                  </p>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="text-left">
                    <p className="text-xs text-slate-500">שעות</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatHours(Number(shift.hours_worked || 0))}
                    </p>
                  </div>
                  
                  <div className={`text-left rounded-lg px-3 py-1.5 ${
                    tipAmount > 0 ? 'bg-green-50' : 'bg-slate-50'
                  }`}>
                    <p className="text-xs text-slate-500">טיפים</p>
                    <p className={`text-sm font-bold ${
                      tipAmount > 0 ? 'text-green-700' : 'text-slate-400'
                    }`}>
                      {tipAmount > 0 
                        ? `₪${tipAmount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                        : 'ממתין'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* סיכום שבועי */}
      <div className="bg-slate-900 text-white p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-slate-400 text-xs mb-1">סה&quot;כ משמרות</p>
            <p className="text-lg font-bold">{shifts.length}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">סה&quot;כ שעות</p>
            <p className="text-lg font-bold">{totalHours.toFixed(1)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">סה&quot;כ טיפים</p>
            <p className="text-lg font-bold text-green-300">
              ₪{totalTips.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
        {avgHourly > 0 && (
          <p className="text-xs text-slate-400 text-center mt-3 pt-3 border-t border-slate-700">
            ממוצע: <span className="text-white font-medium">₪{avgHourly.toFixed(0)} לשעה</span>
          </p>
        )}
      </div>
    </div>
  );
}
