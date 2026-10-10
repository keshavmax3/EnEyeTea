import React, { useState, useEffect } from 'react';
import {
  Coffee,
  Dices,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Loader2,
  RefreshCw,
  Lock,
  EyeOff,
  UserCheck,
  Settings,
  ExternalLink,
  X,
} from 'lucide-react';
import {
  AVATAR_OPTIONS,
  AliasCategory,
  generateRandomAlias,
  generateAliasSuggestions,
  generateRandomAvatar,
  isRealNameMatch,
  maskEmail,
  signInWithGoogle,
  updateUserProfile,
  logOut,
} from '../firebase/auth';
import {
  activeFirebaseConfig,
  saveCustomFirebaseConfig,
  resetCustomFirebaseConfig,
  CUSTOM_FIREBASE_CONFIG_KEY,
} from '../firebase/config';
import { UserProfile } from '../types';

interface LoginPageProps {
  currentUser: any | null;
  initialProfile: UserProfile;
  onLoginSuccess: (user: any, profile: UserProfile) => void;
}

const CATEGORY_TABS: { id: AliasCategory; label: string; emoji: string }[] = [
  { id: 'all', label: 'All Vibes', emoji: '🎲' },
  { id: 'tea', label: 'Tea & Boba', emoji: '🍵' },
  { id: 'academic', label: 'Academic', emoji: '📚' },
  { id: 'night', label: 'Late Night', emoji: '🌙' },
  { id: 'critters', label: 'Critters', emoji: '🦊' },
];

export const LoginPage: React.FC<LoginPageProps> = ({
  currentUser,
  initialProfile,
  onLoginSuccess,
}) => {
  const [user, setUser] = useState<any | null>(currentUser);
  const [alias, setAlias] = useState<string>(initialProfile?.alias || generateRandomAlias());
  const [avatar, setAvatar] = useState<string>(initialProfile?.avatar || '🫖');
  const [category, setCategory] = useState<AliasCategory>('all');
  const [suggestions, setSuggestions] = useState<string[]>(() =>
    generateAliasSuggestions(4, 'all')
  );
  const [isRolling, setIsRolling] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);

  // Firebase Project Config Switcher Modal
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configInput, setConfigInput] = useState('');
  const [configError, setConfigError] = useState<string | null>(null);
  const hasCustomConfig =
    typeof window !== 'undefined' && !!localStorage.getItem(CUSTOM_FIREBASE_CONFIG_KEY);

  const [prevCurrentUser, setPrevCurrentUser] = useState(currentUser);
  if (currentUser !== prevCurrentUser) {
    setPrevCurrentUser(currentUser);
    setUser(currentUser);
  }

  const realNameCheck = isRealNameMatch(alias, user);

  const handleRandomizeName = (selectedCategory: AliasCategory = category) => {
    setIsRolling(true);
    setError(null);
    const newAlias = generateRandomAlias(selectedCategory);
    setAlias(newAlias);
    setSuggestions(generateAliasSuggestions(4, selectedCategory));
    setTimeout(() => setIsRolling(false), 300);
  };

  const handleRandomizeBoth = () => {
    setIsRolling(true);
    setError(null);
    setAlias(generateRandomAlias(category));
    setAvatar(generateRandomAvatar());
    setSuggestions(generateAliasSuggestions(4, category));
    setTimeout(() => setIsRolling(false), 300);
  };

  const handleCategoryChange = (newCat: AliasCategory) => {
    setCategory(newCat);
    setSuggestions(generateAliasSuggestions(4, newCat));
    setAlias(generateRandomAlias(newCat));
  };

  const finalizeCampusEntry = async (activeUser: any) => {
    const cleanAlias = alias.trim();
    if (cleanAlias.length < 2 || cleanAlias.length > 32) {
      setError('Your secret alias must be between 2 and 32 characters.');
      return;
    }

    const nameMatch = isRealNameMatch(cleanAlias, activeUser);
    if (nameMatch.matched) {
      setError(
        nameMatch.reason ||
          'Do NOT use your real name! Please click "Randomize Name" or enter a fake alias.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const savedProfile = await updateUserProfile(cleanAlias, avatar);
      onLoginSuccess(activeUser, savedProfile);
    } catch (err: any) {
      setError(err?.message || 'Could not save your anonymous alias. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async (autoEnterAfter = false) => {
    setIsSigningIn(true);
    setError(null);
    setIsUnauthorizedDomain(false);
    try {
      const res = await signInWithGoogle();
      setUser(res.user);
      if (!alias.trim()) {
        setAlias(res.profile.alias || generateRandomAlias(category));
      }
      if (autoEnterAfter) {
        await finalizeCampusEntry(res.user);
      }
    } catch (err: any) {
      const code = err?.code || '';
      const msg = err?.message || '';
      if (code === 'auth/unauthorized-domain' || msg.includes('unauthorized-domain')) {
        setIsUnauthorizedDomain(true);
        setError(
          `Domain "${typeof window !== 'undefined' ? window.location.hostname : ''}" is not yet added to Authorized Domains in Firebase project "${activeFirebaseConfig.projectId}".`
        );
      } else if (code === 'auth/popup-closed-by-user') {
        setError('Google sign-in popup was closed before finishing. Please try again.');
      } else {
        setError(err?.message || 'Failed to sign in with Google. Please try again.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSwitchAccount = async () => {
    setError(null);
    await logOut();
    setUser(null);
    await handleGoogleLogin(false);
  };

  const handleEnterCampus = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanAlias = alias.trim();
    if (cleanAlias.length < 2 || cleanAlias.length > 32) {
      setError('Your secret alias must be between 2 and 32 characters.');
      return;
    }

    if (!user) {
      await handleGoogleLogin(true);
      return;
    }

    await finalizeCampusEntry(user);
  };

  const handleSaveFirebaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConfigError(null);
    try {
      saveCustomFirebaseConfig(configInput);
    } catch (err: any) {
      setConfigError(
        err?.message ||
          'Invalid Firebase config format. Paste the firebaseConfig object from Firebase Console.'
      );
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfaf7] text-[#1c1917] flex flex-col justify-between relative overflow-hidden">
      {/* Decorative Ambient Background Blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-28 -left-28 w-96 h-96 rounded-full bg-amber-200/35 blur-3xl" />
        <div className="absolute top-1/3 -right-28 w-96 h-96 rounded-full bg-orange-200/30 blur-3xl" />
        <div className="absolute -bottom-28 left-1/3 w-80 h-80 rounded-full bg-yellow-100/50 blur-3xl" />
      </div>

      {/* Top Brand Bar */}
      <header className="relative z-10 max-w-6xl w-full mx-auto px-4 sm:px-8 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-500 flex items-center justify-center text-white shadow-md shadow-amber-600/20">
            <Coffee className="w-5 h-5 stroke-[2.3]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xl tracking-tight text-stone-900">
                Eneyetea
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full border border-amber-200/70">
                Campus Tea
              </span>
            </div>
            <p className="text-[11px] text-stone-500">Spill the unverified tea</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 border border-stone-200/80 text-xs text-stone-600 shadow-2xs">
            <EyeOff className="w-3.5 h-3.5 text-amber-600" />
            <span>Zero Real Names • 100% Secret Aliases</span>
          </div>

          <button
            type="button"
            onClick={() => setIsConfigOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/90 hover:bg-amber-50 border border-stone-200/90 text-xs font-semibold text-stone-700 shadow-2xs transition-colors cursor-pointer"
            title="Connect your own Firebase project config"
          >
            <Settings className="w-3.5 h-3.5 text-amber-600" />
            <span>Firebase Config</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-6 sm:py-10">
        <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* Left Column */}
          <div className="lg:col-span-5 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100/80 border border-amber-300/60 text-amber-900 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-amber-700" />
              <span>Anonymous Campus Community</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-black tracking-tight text-stone-900 leading-[1.12]">
              Verify with Gmail.{' '}
              <span className="bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 bg-clip-text text-transparent">
                Stay a Mystery.
              </span>
            </h1>

            <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Share campus confessions, lab disasters, and spicy dorm tea without ever revealing who you are. Verify once with Gmail via Firebase, then disguise yourself behind a randomized campus alias.
            </p>

            <div className="space-y-3 text-left max-w-md mx-auto lg:mx-0">
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/80 border border-stone-200/80 shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-stone-900">
                    Why Gmail Login?
                  </h3>
                  <p className="text-[11px] text-stone-600 leading-relaxed mt-0.5">
                    Firebase Google Auth keeps bots and spammers out while keeping your email and real name <strong>100% hidden</strong> from the public feed.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-white/80 border border-stone-200/80 shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Dices className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-stone-900">
                    Strict No-Real-Name Policy
                  </h3>
                  <p className="text-[11px] text-stone-600 leading-relaxed mt-0.5">
                    Real names are actively blocked. Roll our <strong>Name Randomizer</strong> or invent a creative disguise before entering.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-7">
            <div className="bg-white rounded-3xl border border-stone-200/90 shadow-xl shadow-stone-900/5 overflow-hidden">
              <div className="px-6 py-5 bg-gradient-to-r from-[#fdfbf7] via-amber-50/50 to-orange-50/40 border-b border-stone-200/70 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 border-2 border-amber-300/80 flex items-center justify-center text-2xl shadow-2xs select-none">
                    {avatar}
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block">
                      Live Identity Preview
                    </span>
                    <h2 className="font-extrabold text-stone-900 text-base sm:text-lg truncate max-w-[230px] sm:max-w-xs">
                      {alias.trim() || 'Mystery Student'}
                    </h2>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRandomizeBoth}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200/80 text-amber-900 font-bold text-xs transition-all active:scale-95 cursor-pointer"
                  title="Randomize both name and avatar"
                >
                  <Dices
                    className={`w-4 h-4 text-amber-700 transition-transform duration-300 ${
                      isRolling ? 'rotate-180 scale-110' : ''
                    }`}
                  />
                  <span>Shuffle All</span>
                </button>
              </div>

              <form onSubmit={handleEnterCampus} className="p-6 space-y-6">
                {/* STEP 1: GMAIL AUTHENTICATION */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-stone-900 text-white text-[11px] flex items-center justify-center">
                        1
                      </span>
                      <span>Verify with Gmail (Firebase Google Auth)</span>
                    </label>
                    {user && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Verified
                      </span>
                    )}
                  </div>

                  {!user ? (
                    <button
                      type="button"
                      onClick={() => handleGoogleLogin(false)}
                      disabled={isSigningIn}
                      className="w-full py-3 px-4 bg-white hover:bg-stone-50 active:bg-stone-100 text-stone-800 font-bold text-sm rounded-2xl border-2 border-stone-200 hover:border-stone-300 shadow-2xs transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
                    >
                      {isSigningIn ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin text-amber-600" />
                          <span>Opening Firebase Google Sign-In...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path
                              fill="#4285F4"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                          </svg>
                          <span>Continue with Gmail</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/90 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                          <Lock className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-emerald-950 truncate">
                            {maskEmail(user.email)}
                          </p>
                          <p className="text-[11px] text-emerald-700">
                            Gmail verified • Real name & email hidden from everyone
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleSwitchAccount}
                        className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 underline shrink-0 cursor-pointer"
                      >
                        Switch Gmail
                      </button>
                    </div>
                  )}
                </div>

                {/* STEP 2: RANDOM NAME */}
                <div className="space-y-3 pt-2 border-t border-stone-100">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-stone-900 text-white text-[11px] flex items-center justify-center">
                        2
                      </span>
                      <span>Enter a Random Name (NOT Your Real Name)</span>
                    </label>

                    <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/70">
                      Required for Anonymity
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-stone-500 block">
                      Name Randomizer Vibe:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORY_TABS.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => handleCategoryChange(tab.id)}
                          className={`px-2.5 py-1 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                            category === tab.id
                              ? 'bg-stone-900 text-white shadow-2xs'
                              : 'bg-stone-100 hover:bg-stone-200/70 text-stone-600'
                          }`}
                        >
                          <span>{tab.emoji}</span>
                          <span>{tab.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={alias}
                        onChange={(e) => {
                          setAlias(e.target.value);
                          setError(null);
                        }}
                        maxLength={32}
                        placeholder="Enter a secret alias (never your real name)..."
                        className={`w-full px-4 py-3 bg-stone-50 focus:bg-white border-2 rounded-2xl text-sm font-semibold text-stone-900 outline-none transition-all ${
                          realNameCheck.matched
                            ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30'
                            : 'border-stone-200 focus:border-amber-500 focus:ring-3 focus:ring-amber-500/15'
                        }`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-medium text-stone-400">
                        {alias.length}/32
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRandomizeName(category)}
                      className="px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-sm hover:shadow transition-all active:scale-95 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                    >
                      <Dices
                        className={`w-4 h-4 transition-transform duration-300 ${
                          isRolling ? 'rotate-180 scale-125' : ''
                        }`}
                      />
                      <span>Randomize Name</span>
                    </button>
                  </div>

                  {realNameCheck.matched && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                      <div>
                        <span className="font-bold">Real Name Detected: </span>
                        <span>{realNameCheck.reason}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-stone-500">
                      <span>Or tap a randomized suggestion:</span>
                      <button
                        type="button"
                        onClick={() =>
                          setSuggestions(generateAliasSuggestions(4, category))
                        }
                        className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-900 font-semibold cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>More ideas</span>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            setAlias(item);
                            setError(null);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                            alias === item
                              ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold'
                              : 'bg-stone-50 hover:bg-amber-50/60 border-stone-200/80 text-stone-700'
                          }`}
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="text-[11px] font-semibold text-stone-600 block mb-2">
                      Pick Your Secret Avatar:
                    </label>
                    <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
                      {AVATAR_OPTIONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => setAvatar(icon)}
                          className={`h-9 sm:h-10 rounded-xl flex items-center justify-center text-base sm:text-lg transition-all cursor-pointer ${
                            avatar === icon
                              ? 'bg-amber-100 border-2 border-amber-500 scale-105 shadow-2xs'
                              : 'bg-stone-50 hover:bg-stone-100 border border-stone-200/70'
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                      <span className="font-medium leading-relaxed">{error}</span>
                    </div>

                    {isUnauthorizedDomain && typeof window !== 'undefined' && (
                      <div className="pl-6 space-y-2 text-[11px] text-stone-700">
                        <p>
                          To use Firebase Google Sign-In on <code>{window.location.hostname}</code>:
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={`https://console.firebase.google.com/project/${activeFirebaseConfig.projectId}/authentication/settings`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-rose-300 font-bold text-rose-800 hover:bg-rose-100 transition-colors"
                          >
                            <span>1. Add &ldquo;{window.location.hostname}&rdquo; in Firebase Console</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setIsConfigOpen(true)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-stone-900 text-white font-bold hover:bg-stone-800 transition-colors cursor-pointer"
                          >
                            <Settings className="w-3 h-3" />
                            <span>Or Connect Your Firebase Project</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting || isSigningIn || realNameCheck.matched}
                  className="w-full py-3.5 px-6 bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-white font-extrabold text-sm rounded-2xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                >
                  {isSubmitting || isSigningIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>
                        {isSigningIn
                          ? 'Verifying Gmail...'
                          : 'Saving Secret Identity...'}
                      </span>
                    </>
                  ) : user ? (
                    <>
                      <UserCheck className="w-4 h-4 text-amber-400" />
                      <span>Enter Campus as &ldquo;{alias.trim() || '...'}&rdquo;</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>Verify with Gmail & Enter as &ldquo;{alias.trim() || '...'}&rdquo;</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      {/* Connect Your Firebase Project Config Modal */}
      {isConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-[#fdfbf7]">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-amber-600" />
                <h3 className="font-bold text-stone-900 text-sm">
                  Connect Your Firebase Project
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsConfigOpen(false)}
                className="p-1.5 text-stone-400 hover:text-stone-700 rounded-full hover:bg-stone-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFirebaseConfig} className="p-6 space-y-4">
              <div className="text-xs text-stone-600 space-y-1.5 leading-relaxed">
                <p>
                  Currently connected to Firebase project:{' '}
                  <strong className="text-stone-900 font-mono">
                    {activeFirebaseConfig.projectId}
                  </strong>
                </p>
                <p>
                  To use your own Firebase project, paste your{' '}
                  <code>firebaseConfig</code> object from{' '}
                  <strong>Firebase Console → Project Settings → Your apps</strong>:
                </p>
              </div>

              <textarea
                rows={7}
                value={configInput}
                onChange={(e) => {
                  setConfigInput(e.target.value);
                  setConfigError(null);
                }}
                placeholder={`{\n  "apiKey": "AIzaSy...",\n  "authDomain": "your-app.firebaseapp.com",\n  "projectId": "your-app",\n  "appId": "1:123456:web:abcdef"\n}`}
                className="w-full p-3.5 bg-stone-50 focus:bg-white border border-stone-300 focus:border-amber-500 rounded-2xl text-xs font-mono text-stone-900 outline-none"
              />

              {configError && (
                <p className="text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                  {configError}
                </p>
              )}

              <div className="flex items-center justify-between pt-2">
                {hasCustomConfig ? (
                  <button
                    type="button"
                    onClick={resetCustomFirebaseConfig}
                    className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                  >
                    Reset to Default Config
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsConfigOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-full cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-full shadow-sm cursor-pointer"
                  >
                    Save & Reconnect Firebase
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="relative z-10 text-center py-4 px-4 text-[11px] text-stone-400">
        Eneyetea Campus • Verified Humans via Gmail • Zero Real Names Stored
      </footer>
    </div>
  );
};
