'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

interface PendingTip {
  id: string;
  tip_amount: number;
  hours_worked: number;
  created_at: string;
  confirmed_at: string | null;
}

interface TipsConfirmationProps {
  waiterId: string;
}

export function TipsConfirmation({ waiterId }: TipsConfirmationProps) {
  const [pendingTips, setPendingTips] = useState<PendingTip[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [justConfirmed, setJustConfirmed] = useState<string | null>(null);

  const loadPendingTips = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('tip_distribution_details')
        .select('id, tip_amount, hours_worked, created_at, confirmed_at')
        .eq('waiter_id', waiterId)
        .is('confirmed_at', null)
        .order('created_at', { ascending: false });

      setPendingTips(data || []);
    } catch {
      // שקט - לא קריטי
    }
  }, [waiterId]);

  useEffect(() => {
    loadPendingTips();
  }, [loadPendingTips]);

  async function confirmTip(tipId: string) {
    setConfirmingId(tipId);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('tip_distribution_details')
        .update({ confirmed_at: new Date().toISOString() })
        .eq('id', tipId);

      if (!error) {
        setJustConfirmed(tipId);
        // אנימציה קצרה ואז הסרה מהרשימה
        setTimeout(() => {
          setPendingTips(prev => prev.filter(t => t.id !== tipId));
          setJustConfirmed(null);
        }, 1500);
      }
    } catch {
      // שקט
    } finally {
      setConfirmingId(null);
    }
  }

  if (pendingTips.length === 0) return null;

  return (
    <div className="mb-6">
      {pendingTips.map((tip) => {
        const isConfirmed = justConfirmed === tip.id;
        const tipDate = new Date(tip.created_at).toLocaleDateString('he-IL', {
          day: 'numeric',
          month: 'numeric',
          timeZone: 'Asia/Jerusalem',
        });

        return (
          <div
            key={tip.id}
            className={`rounded-2xl p-5 mb-3 border-2 transition-all duration-500 ${
              isConfirmed
                ? 'bg-green-50 border-green-300 scale-[0.98] opacity-70'
                : 'bg-gradient-to-l from-amber-50 to-yellow-50 border-amber-300 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-2xl">
                  {isConfirmed ? '✅' : '💰'}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {isConfirmed ? 'אושר! תודה 🙏' : 'יש לך טיפים מחכים!'}
                  </p>
                  <p className="text-sm text-slate-600">
                    משמרת {tipDate} · {Number(tip.hours_worked).toFixed(1)} שעות ·{' '}
                    <span className="font-bold text-green-700">
                      ₪{Number(tip.tip_amount).toLocaleString('he-IL', { maximumFractionDigits: 0 })}
                    </span>
                  </p>
                </div>
              </div>

              {!isConfirmed && (
                <button
                  onClick={() => confirmTip(tip.id)}
                  disabled={confirmingId === tip.id}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-2.5 rounded-xl transition disabled:opacity-50 whitespace-nowrap"
                >
                  {confirmingId === tip.id ? '...' : '✅ קיבלתי את הכסף'}
                </button>
              )}
            </div>

            {!isConfirmed && (
              <p className="text-xs text-amber-700 mt-3">
                💡 לחץ/י על הכפתור רק אחרי שקיבלת את המעטפה בפועל
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
