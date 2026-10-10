import React from 'react';
import { Clock, Flame, Plus, MessageSquare, MessageSquareLock } from 'lucide-react';
import { UserProfile } from '../types';

interface BottomNavProps {
  currentTab: 'recent' | 'popular';
  onChangeTab: (tab: 'recent' | 'popular') => void;
  activeView: 'feed' | 'chat' | 'dms';
  onSelectView: (view: 'feed' | 'chat' | 'dms') => void;
  onOpenCreatePost: () => void;
  onOpenProfile: () => void;
  profile: UserProfile | null;
  pendingRequestsCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onChangeTab,
  activeView,
  onSelectView,
  onOpenCreatePost,
  onOpenProfile,
  profile,
  pendingRequestsCount = 0,
}) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 px-2 py-1.5 flex items-center justify-around">
      {/* Home (Recent) */}
      <button
        onClick={() => {
          onSelectView('feed');
          onChangeTab('recent');
        }}
        className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
          activeView === 'feed' && currentTab === 'recent'
            ? 'text-amber-800'
            : 'text-stone-500 hover:text-stone-800'
        }`}
      >
        <Clock className="w-4 h-4" />
        <span>Recent</span>
      </button>

      {/* Popular */}
      <button
        onClick={() => {
          onSelectView('feed');
          onChangeTab('popular');
        }}
        className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
          activeView === 'feed' && currentTab === 'popular'
            ? 'text-orange-600'
            : 'text-stone-500 hover:text-stone-800'
        }`}
      >
        <Flame className="w-4 h-4" />
        <span>Popular</span>
      </button>

      {/* Center Action: Spill Tea */}
      <button
        onClick={onOpenCreatePost}
        className="flex items-center justify-center w-11 h-11 -mt-4 bg-gradient-to-tr from-amber-600 to-orange-500 text-white rounded-full shadow-md shadow-amber-600/30 active:scale-95 transition-transform cursor-pointer"
        title="Spill Tea"
      >
        <Plus className="w-6 h-6 stroke-[2.5]" />
      </button>

      {/* Live Campus Chat */}
      <button
        onClick={() => onSelectView('chat')}
        className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-semibold transition-colors relative cursor-pointer ${
          activeView === 'chat'
            ? 'text-amber-800'
            : 'text-stone-500 hover:text-stone-800'
        }`}
      >
        <div className="relative">
          <MessageSquare className="w-4 h-4" />
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
        </div>
        <span>Chat</span>
      </button>

      {/* 1-on-1 DMs */}
      <button
        onClick={() => onSelectView('dms')}
        className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-semibold transition-colors relative cursor-pointer ${
          activeView === 'dms'
            ? 'text-amber-800'
            : 'text-stone-500 hover:text-stone-800'
        }`}
      >
        <div className="relative">
          <MessageSquareLock className="w-4 h-4" />
          {pendingRequestsCount > 0 && (
            <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 rounded-full bg-rose-500 text-white text-[8px] font-extrabold flex items-center justify-center">
              {pendingRequestsCount}
            </span>
          )}
        </div>
        <span>DMs</span>
      </button>

      {/* Profile */}
      <button
        onClick={onOpenProfile}
        className="flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-semibold text-stone-500 hover:text-stone-800 transition-colors cursor-pointer"
      >
        <span className="text-base leading-none select-none">
          {profile?.avatar || '🫖'}
        </span>
        <span className="truncate max-w-[40px]">Me</span>
      </button>
    </nav>
  );
};
