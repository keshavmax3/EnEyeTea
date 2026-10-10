import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './config';
import { UserProfile } from '../types';

export type AliasCategory = 'all' | 'tea' | 'academic' | 'night' | 'critters';

const CATEGORY_WORDS: Record<Exclude<AliasCategory, 'all'>, { adjectives: string[]; nouns: string[] }> = {
  tea: {
    adjectives: [
      'Steeping', 'Boba-Loving', 'Matcha-Fueled', 'Spiced', 'Chai-Sipping',
      'Oolong', 'Herbal', 'Brewing', 'Unsweetened', 'Iced-Latte', 'Toasted'
    ],
    nouns: [
      'Barista', 'Teacup', 'Kettle', 'Boba-Pearl', 'Tea-Leaf',
      'Espresso', 'Matcha-Whisk', 'Thermos', 'Cafe-Regular', 'Sipper'
    ],
  },
  academic: {
    adjectives: [
      'Midterm', 'Caffeinated', 'Honor-Roll', 'Procrastinating', 'Library',
      'Lab-Coat', 'Overthinking', 'Tenured', 'All-Nighter', 'Curve-Busting', 'Panic-Studying'
    ],
    nouns: [
      'Chemist', 'Coder', 'Scholar', 'Scribe', 'Freshman',
      'Senior', 'Grad-TA', 'Theorist', 'Philosopher', 'Researcher', 'Debugger'
    ],
  },
  night: {
    adjectives: [
      'Late-Night', 'Sleepy', 'Sneaky', 'Stealthy', 'Moonlit',
      '2AM-Dorm', 'Midnight', 'Insomniac', 'Shadowy', 'Phantom', 'Low-Key'
    ],
    nouns: [
      'Night-Owl', 'Wanderer', 'Gamer', 'Roommate', 'Stargazer',
      'Ghost', 'Noodle-Chef', 'Hall-Monitor', 'Vibe-Checker', 'Drifter'
    ],
  },
  critters: {
    adjectives: [
      'Curious', 'Spicy', 'Chill', 'Wired', 'Chaotic',
      'Fluffy', 'Zooming', 'Cozy', 'Dramatic', 'Unbothered', 'Sassy'
    ],
    nouns: [
      'Otter', 'Panda', 'Fox', 'Owl', 'Sloth',
      'Badger', 'Pigeon', 'Penguin', 'Falcon', 'Raccoon', 'Capybara', 'Hedgehog'
    ],
  },
};

const ALL_ADJECTIVES = Object.values(CATEGORY_WORDS).flatMap((c) => c.adjectives);
const ALL_NOUNS = Object.values(CATEGORY_WORDS).flatMap((c) => c.nouns);

export const AVATAR_OPTIONS = [
  '🫖', '🍵', '☕', '🧋', '🦊', '🦉', '🐼', '🦦', '🦝', '🐧', '⚡', '🌙', '🍂', '✨', '🔥', '🎭'
];

export function generateRandomAlias(category: AliasCategory = 'all'): string {
  const pool =
    category === 'all'
      ? { adjectives: ALL_ADJECTIVES, nouns: ALL_NOUNS }
      : CATEGORY_WORDS[category];
  const adj = pool.adjectives[Math.floor(Math.random() * pool.adjectives.length)];
  const noun = pool.nouns[Math.floor(Math.random() * pool.nouns.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${adj} ${noun} #${num}`;
}

export function generateAliasSuggestions(count = 4, category: AliasCategory = 'all'): string[] {
  const suggestions = new Set<string>();
  let attempts = 0;
  while (suggestions.size < count && attempts < 30) {
    suggestions.add(generateRandomAlias(category));
    attempts++;
  }
  return Array.from(suggestions);
}

export function generateRandomAvatar(): string {
  return AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)];
}

/**
 * Checks if the entered alias looks too close to the user's real Google name or Gmail address.
 */
export function isRealNameMatch(
  alias: string,
  user: User | AppUser | null
): { matched: boolean; reason?: string } {
  const cleanAlias = alias.trim().toLowerCase();
  if (!cleanAlias || !user) return { matched: false };

  if (user.displayName) {
    const fullRealName = user.displayName.trim().toLowerCase();
    if (fullRealName && cleanAlias === fullRealName) {
      return {
        matched: true,
        reason: 'That matches your real Gmail name! Please enter a fake alias or use the Name Randomizer.',
      };
    }

    const nameParts = fullRealName
      .split(/\s+/)
      .map((p) => p.replace(/[^a-z0-9]/g, ''))
      .filter((p) => p.length >= 3);

    const aliasWords = cleanAlias
      .split(/[\s_\-#0-9]+/)
      .map((w) => w.replace(/[^a-z0-9]/g, ''))
      .filter(Boolean);

    for (const part of nameParts) {
      if (aliasWords.includes(part) || cleanAlias === part) {
        return {
          matched: true,
          reason: `Your alias contains "${part}" from your real Gmail name. Use a random name to stay anonymous!`,
        };
      }
    }
  }

  if (user.email) {
    const emailPrefix = user.email.split('@')[0]?.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedAlias = cleanAlias.replace(/[^a-z0-9]/g, '');
    if (emailPrefix && emailPrefix.length >= 4 && normalizedAlias === emailPrefix) {
      return {
        matched: true,
        reason: 'Your alias matches your Gmail address handle! Please pick an unrelated random name.',
      };
    }
  }

  return { matched: false };
}

export function maskEmail(email: string | null | undefined): string {
  if (!email) return 'Verified Gmail User';
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 2)}${'*'.repeat(Math.min(local.length - 2, 5))}@${domain}`;
}

const LOCAL_STORAGE_ALIAS_KEY = 'eneyetea_user_alias';
const LOCAL_STORAGE_AVATAR_KEY = 'eneyetea_user_avatar';
const LOCAL_STORAGE_ONBOARDED_PREFIX = 'eneyetea_onboarded_';
const LOCAL_STORAGE_GMAIL_SESSION_KEY = 'eneyetea_gmail_session';
const LOCAL_STORAGE_SAVED_GMAILS_KEY = 'eneyetea_saved_gmails';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
}

export interface SavedGmailAccount {
  uid: string;
  email: string;
  displayName: string;
}

export function getSavedGmailAccounts(): SavedGmailAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SAVED_GMAILS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveGmailAccountToHistory(account: SavedGmailAccount): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getSavedGmailAccounts().filter(
      (a) => a.email.toLowerCase() !== account.email.toLowerCase()
    );
    existing.unshift(account);
    localStorage.setItem(LOCAL_STORAGE_SAVED_GMAILS_KEY, JSON.stringify(existing.slice(0, 5)));
  } catch {
    // ignore storage errors
  }
}

export function getLocalGmailSession(): AppUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_GMAIL_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

export function getCurrentUser(): User | AppUser | null {
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    return auth.currentUser;
  }
  return getLocalGmailSession();
}

export function signInWithLocalGmail(
  emailInput: string,
  realNameInput?: string
): { user: AppUser; profile: UserProfile } {
  const email = emailInput.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Please enter a valid Gmail address (e.g. yourname@gmail.com).');
  }
  const domain = email.split('@')[1];
  if (domain !== 'gmail.com' && domain !== 'googlemail.com' && !domain.endsWith('.edu')) {
    throw new Error('Please sign in with a valid @gmail.com address.');
  }

  // Generate deterministic UID from email so the same Gmail always gets the same user ID
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash << 5) - hash + email.charCodeAt(i);
    hash |= 0;
  }
  const cleanHandle = email.split('@')[0].replace(/[^a-z0-9]/g, '').slice(0, 16) || 'user';
  const uid = `gmail_${cleanHandle}_${Math.abs(hash).toString(36)}`;

  const derivedName =
    realNameInput?.trim() ||
    email
      .split('@')[0]
      .replace(/[._\-0-9]+/g, ' ')
      .trim();

  const appUser: AppUser = {
    uid,
    email,
    displayName: derivedName || null,
    isAnonymous: false,
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_GMAIL_SESSION_KEY, JSON.stringify(appUser));
    saveGmailAccountToHistory({
      uid,
      email,
      displayName: derivedName || email.split('@')[0],
    });
  }

  const profile = getLocalCachedProfile();
  return { user: appUser, profile };
}

export function isUserOnboarded(uid: string): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(`${LOCAL_STORAGE_ONBOARDED_PREFIX}${uid}`) === 'true';
}

export function setUserOnboarded(uid: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  if (value) {
    localStorage.setItem(`${LOCAL_STORAGE_ONBOARDED_PREFIX}${uid}`, 'true');
  } else {
    localStorage.removeItem(`${LOCAL_STORAGE_ONBOARDED_PREFIX}${uid}`);
  }
}

export function getLocalCachedProfile(): UserProfile {
  if (typeof window === 'undefined') {
    return { alias: 'Anonymous Student', avatar: '🫖' };
  }
  const savedAlias = localStorage.getItem(LOCAL_STORAGE_ALIAS_KEY);
  const savedAvatar = localStorage.getItem(LOCAL_STORAGE_AVATAR_KEY);
  return {
    alias: savedAlias || generateRandomAlias(),
    avatar: savedAvatar || generateRandomAvatar(),
  };
}

export async function setupUserProfile(
  user: User | AppUser,
  preferredAlias?: string,
  preferredAvatar?: string
): Promise<UserProfile> {
  const userDocRef = doc(db, 'users', user.uid);
  let profile: UserProfile;

  try {
    const snapshot = await getDoc(userDocRef);
    if (preferredAlias && preferredAvatar) {
      profile = {
        alias: preferredAlias.trim().slice(0, 32),
        avatar: preferredAvatar,
      };
      if (auth.currentUser) {
        await setDoc(userDocRef, {
          alias: profile.alias,
          avatar: profile.avatar,
          updatedAt: serverTimestamp(),
        });
      }
    } else if (snapshot.exists()) {
      const data = snapshot.data();
      profile = {
        alias: data.alias || generateRandomAlias(),
        avatar: data.avatar || generateRandomAvatar(),
      };
    } else {
      const cached = getLocalCachedProfile();
      profile = cached;
      if (auth.currentUser) {
        await setDoc(userDocRef, {
          alias: profile.alias,
          avatar: profile.avatar,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    profile = {
      alias: preferredAlias || getLocalCachedProfile().alias,
      avatar: preferredAvatar || getLocalCachedProfile().avatar,
    };
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_ALIAS_KEY, profile.alias);
    localStorage.setItem(LOCAL_STORAGE_AVATAR_KEY, profile.avatar);
  }
  return profile;
}

export interface AuthInitResult {
  user: User | AppUser | null;
  profile: UserProfile;
  isOnboarded: boolean;
  errorMessage?: string;
}

export function isGoogleAuthenticated(user: User | AppUser | null): boolean {
  if (!user || user.isAnonymous) return false;
  if ('providerData' in user && user.providerData) {
    return user.providerData.some((p) => p.providerId === 'google.com') || !!user.email;
  }
  return !!user.email;
}

export async function checkInitialAuth(): Promise<AuthInitResult> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      unsubscribe();
      try {
        if (currentUser && isGoogleAuthenticated(currentUser)) {
          const profile = await setupUserProfile(currentUser);
          const onboarded = isUserOnboarded(currentUser.uid);
          resolve({
            user: currentUser,
            profile,
            isOnboarded: onboarded,
          });
          return;
        }

        const localGmailUser = getLocalGmailSession();
        if (localGmailUser) {
          const profile = await setupUserProfile(localGmailUser);
          const onboarded = isUserOnboarded(localGmailUser.uid);
          resolve({
            user: localGmailUser,
            profile,
            isOnboarded: onboarded,
          });
          return;
        }

        if (currentUser && currentUser.isAnonymous) {
          try {
            await signOut(auth);
          } catch (_) {
            // ignore
          }
        }

        resolve({
          user: null,
          profile: getLocalCachedProfile(),
          isOnboarded: false,
        });
      } catch (error: any) {
        resolve({
          user: null,
          profile: getLocalCachedProfile(),
          isOnboarded: false,
          errorMessage: error?.message,
        });
      }
    });
  });
}

export async function signInWithGoogle(): Promise<{
  user: User;
  profile: UserProfile;
}> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({
    prompt: 'select_account',
  });
  const cred = await signInWithPopup(auth, provider);
  const profile = await setupUserProfile(cred.user);
  return { user: cred.user, profile };
}

export async function logOut(): Promise<void> {
  const active = getCurrentUser();
  if (active) {
    setUserOnboarded(active.uid, false);
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem(LOCAL_STORAGE_GMAIL_SESSION_KEY);
  }
  try {
    await signOut(auth);
  } catch {
    // ignore
  }
}

export async function updateUserProfile(newAlias: string, newAvatar: string): Promise<UserProfile> {
  const user = getCurrentUser();
  const trimmedAlias = newAlias.trim().slice(0, 32);
  if (trimmedAlias.length < 2) {
    throw new Error('Alias must be at least 2 characters');
  }

  const realNameCheck = isRealNameMatch(trimmedAlias, user);
  if (realNameCheck.matched) {
    throw new Error(realNameCheck.reason);
  }

  if (typeof window !== 'undefined') {
    localStorage.setItem(LOCAL_STORAGE_ALIAS_KEY, trimmedAlias);
    localStorage.setItem(LOCAL_STORAGE_AVATAR_KEY, newAvatar);
  }

  if (user) {
    setUserOnboarded(user.uid, true);
    if (auth.currentUser) {
      try {
        await setDoc(
          doc(db, 'users', user.uid),
          {
            alias: trimmedAlias,
            avatar: newAvatar,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (error) {
        // Ignore Firestore write error on unauthorized local domain
      }
    }
  }

  return { alias: trimmedAlias, avatar: newAvatar };
}
