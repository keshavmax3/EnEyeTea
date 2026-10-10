import React, { useState, useEffect } from 'react';
import { X, Dices, Check, ShieldCheck, Loader2, LogOut, RefreshCw } from 'lucide-react';
import {
  AVATAR_OPTIONS,
  generateRandomAlias,
  generateAliasSuggestions,
  updateUserProfile,
} from '../firebase/auth';
import { UserProfile } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProfile: UserProfile | null;
  onProfileUpdated: (profile: UserProfile) => void;
  onLogout?: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  currentProfile,
  onProfileUpdated,
  onLogout,
}) => {
  const [alias, setAlias] = useState(currentProfile?.alias || '');
  const [avatar, setAvatar] = useState(currentProfile?.avatar || '🫖');
  const [suggestions, setSuggestions] = useState<string[]>(() =>
    generateAliasSuggestions(3)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prevOpen, setPrevOpen] = useState(isOpen);
  if (isOpen !== prevOpen) {
    setPrevOpen(isOpen);
    if (isOpen && currentProfile) {
      setAlias(currentProfile.alias);
      setAvatar(currentProfile.avatar);
      setError(null);
    }
  }

  if (!isOpen) return null;

  const handleRandomize = () => {
    setAlias(generateRandomAlias());
    setSuggestions(generateAliasSuggestions(3));
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = alias.trim();
    if (clean.length < 2 || clean.length > 32) {
      setError('Alias must be between 2 and 32 characters');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateUserProfile(clean, avatar);
      onProfileUpdated(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-stone-200 shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between bg-[#fdfbf7]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-base">
              {avatar}
            </div>
            <div>
              <h2 className="font-bold text-stone-900 text-sm">Secret Campus Identity</h2>
              <p className="text-[11px] text-stone-500">
                Change your random alias anytime (never use your real name)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 p-1.5 rounded-full hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-stone-700 block mb-2">
              Choose Campus Avatar
            </label>
            <div className="grid grid-cols-8 gap-1.5">
              {AVATAR_OPTIONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setAvatar(icon)}
                  className={`h-9 rounded-xl flex items-center justify-center text-base transition-all cursor-pointer ${
                    avatar === icon
                      ? 'bg-amber-100 border-2 border-amber-500 scale-105 shadow-2xs'
                      : 'bg-stone-50 hover:bg-stone-100 border border-stone-200/80'
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-stone-700">
                Random Campus Alias (Not Real Name)
              </label>
              <button
                type="button"
                onClick={handleRandomize}
                className="text-[11px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200/80 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Dices className="w-3.5 h-3.5" />
                <span>Randomize Name</span>
              </button>
            </div>
            <input
              type="text"
              value={alias}
              onChange={(e) => {
                setAlias(e.target.value);
                setError(null);
              }}
              maxLength={32}
              className="w-full px-3.5 py-2 bg-stone-50 focus:bg-white border border-stone-200 rounded-xl text-xs sm:text-sm text-stone-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-all font-medium"
              placeholder="e.g. Caffeinated Chemist #42"
            />
            <div className="flex justify-between text-[10px] text-stone-400 px-1">
              <span>Real names from Gmail are automatically blocked</span>
              <span>{alias.length}/32</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setAlias(item);
                    setError(null);
                  }}
                  className="px-2 py-0.5 rounded-md text-[11px] bg-stone-100 hover:bg-amber-50 text-stone-700 border border-stone-200/80 cursor-pointer"
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSuggestions(generateAliasSuggestions(3))}
                className="p-1 text-stone-400 hover:text-amber-700 cursor-pointer"
                title="Refresh suggestions"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
              {error}
            </p>
          )}

          <div className="bg-amber-50/60 p-3 rounded-2xl border border-amber-200/60 text-[11px] text-stone-600 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
              <span>Gmail Privacy Guarantee</span>
            </div>
            <p className="leading-relaxed">
              Your Gmail is only used to verify you are a real human. Only your secret alias and avatar are ever saved or visible on campus.
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
            {onLogout ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-full transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-full transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-full shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Save Alias</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
