'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function NoAccessPage() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <main 
      dir="rtl" 
      className="min-h-screen flex items-center justify-center bg-slate-50 p-4"
    >
      <div className="max-w-md text-center bg-white rounded-2xl shadow-lg p-10">
        <div className="text-5xl mb-4">🚫</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-3">אין לך הרשאה</h1>
        <p className="text-slate-600 mb-6 leading-relaxed">
          החשבון שלך לא משויך לתפקיד שמאפשר גישה ל-Floor Master.
          <br />
          פנה למנהל המסעדה כדי לקבל הרשאה מתאימה.
        </p>
        <button
          onClick={handleLogout}
          className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition"
        >
          התנתק
        </button>
      </div>
    </main>
  );
}
