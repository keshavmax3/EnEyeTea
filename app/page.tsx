'use client';

import { useSyncExternalStore } from 'react';
import App from '@/src/App';
import { Coffee, Loader2 } from 'lucide-react';

const emptySubscribe = () => () => {};

export default function Page() {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  if (!isClient) {
    return (
      <div className="min-h-screen bg-[#fcfaf7] flex flex-col items-center justify-center gap-3 text-stone-600">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center text-white shadow-md animate-pulse">
          <Coffee className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
          <span>Brewing Eneyetea Campus...</span>
        </div>
      </div>
    );
  }

  return <App />;
}


