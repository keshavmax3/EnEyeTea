import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import defaultFirebaseConfig from '../../firebase-applet-config.json';

export const CUSTOM_FIREBASE_CONFIG_KEY = 'eneyetea_custom_firebase_config';

function getActiveFirebaseConfig() {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(CUSTOM_FIREBASE_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.apiKey && parsed.projectId) {
          return parsed;
        }
      }
    } catch {
      // fall back to default
    }
  }
  return defaultFirebaseConfig;
}

export const activeFirebaseConfig = getActiveFirebaseConfig();
export const app = getApps().length > 0 ? getApp() : initializeApp(activeFirebaseConfig);
export const db = activeFirebaseConfig.firestoreDatabaseId
  ? getFirestore(app, activeFirebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
export const auth = getAuth(app);

export function saveCustomFirebaseConfig(rawInput: string): void {
  const cleaned = rawInput
    .trim()
    .replace(/^(const|let|var)\s+\w+\s*=\s*/, '')
    .replace(/;$/, '');
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const jsonFormatted = cleaned
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":')
      .replace(/'/g, '"')
      .replace(/,\s*}/g, '}');
    parsed = JSON.parse(jsonFormatted);
  }
  if (!parsed?.apiKey || !parsed?.projectId) {
    throw new Error('Config must include at least apiKey and projectId.');
  }
  localStorage.setItem(CUSTOM_FIREBASE_CONFIG_KEY, JSON.stringify(parsed));
  window.location.reload();
}

export function resetCustomFirebaseConfig(): void {
  localStorage.removeItem(CUSTOM_FIREBASE_CONFIG_KEY);
  window.location.reload();
}

export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    return true;
  }
}
