import Link from 'next/link';

interface HeaderProps {
  userEmail: string;
  userInitials: string;
  isAdmin: boolean;
  currentTab?: 'home' | 'quiz' | 'simulator' | 'helper' | 'admin';
}

export function Header({ userEmail, userInitials, isAdmin, currentTab = 'home' }: HeaderProps) {
  const tabs = [
    { id: 'home', label: 'בית', icon: '🏠', href: '/' },
    { id: 'quiz', label: 'קוויז יומי', icon: '⚡', href: '/quiz' },
    { id: 'simulator', label: 'סימולטור', icon: '🎮', href: '/simulator' },
    { id: 'helper', label: 'עוזר בזמן אמת', icon: '💡', href: '/helper' },
  ];

  if (isAdmin) {
    tabs.push({ id: 'admin', label: 'דשבורד מנהל', icon: '📊', href: '/admin' });
  }

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white text-lg">
              🍷
            </div>
            <div>
              <h1 className="font-semibold text-slate-900 leading-tight">Floor Master AI</h1>
              <p className="text-xs text-slate-500">המאמן הדיגיטלי של הצוות</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-left">
              <p className="text-sm font-medium text-slate-900">{userEmail.split('@')[0]}</p>
              <p className="text-xs text-slate-500">
                {isAdmin ? 'מנהל' : 'צוות שירות'}
              </p>
            </div>
            <div className="w-9 h-9 bg-slate-100 text-slate-700 rounded-full flex items-center justify-center text-sm font-medium">
              {userInitials}
            </div>
            <form action="/auth/signout" method="post">
              <button 
                type="submit"
                className="text-sm text-slate-500 hover:text-slate-900 transition px-3 py-1.5"
                title="התנתק"
              >
                יציאה
              </button>
            </form>
          </div>
        </div>

        <nav className="flex gap-1 py-2 overflow-x-auto">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={tab.href}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition flex items-center gap-2 ${
                currentTab === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
