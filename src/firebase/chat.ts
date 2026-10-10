import {
  collection,
  doc,
  setDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from './config';
import { getCurrentUser } from './auth';
import { ChatMessage } from '../types';

let lastSentTimestamp = 0;
const SEND_COOLDOWN_MS = 2500; // 2.5 seconds cooldown
const LOCAL_CHAT_KEY = 'eneyetea_local_chat_v1';

const chatListeners = new Set<() => void>();

const chatSyncChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('eneyetea_chat_sync')
    : null;

if (chatSyncChannel) {
  chatSyncChannel.onmessage = () => {
    chatListeners.forEach((cb) => cb());
  };
}

function getLocalChatMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_CHAT_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalChatMessages(msgs: ChatMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_CHAT_KEY, JSON.stringify(msgs.slice(-80)));
  } catch {
    // ignore
  }
}

export function getCooldownRemaining(): number {
  const elapsed = Date.now() - lastSentTimestamp;
  if (elapsed >= SEND_COOLDOWN_MS) return 0;
  return Math.ceil((SEND_COOLDOWN_MS - elapsed) / 1000);
}

export async function sendChatMessage(
  content: string,
  authorAlias: string,
  authorAvatar: string
): Promise<string> {
  const user = getCurrentUser();
  if (!user) throw new Error('Must be authenticated to chat.');

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 280) {
    throw new Error('Message must be between 1 and 280 characters.');
  }

  const now = Date.now();
  if (now - lastSentTimestamp < SEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((SEND_COOLDOWN_MS - (now - lastSentTimestamp)) / 1000);
    throw new Error(`Chat cooldown: please wait ${waitSec}s before sending another message.`);
  }

  const chatCol = collection(db, 'chat_messages');
  const newMsgDoc = doc(chatCol);

  if (auth.currentUser) {
    try {
      await setDoc(newMsgDoc, {
        authorId: user.uid,
        authorAlias: authorAlias.slice(0, 40),
        authorAvatar: authorAvatar.slice(0, 60),
        content: trimmed,
        createdAt: serverTimestamp(),
      });

      lastSentTimestamp = Date.now();
      return newMsgDoc.id;
    } catch {
      // Fallback to local chat persistence below
    }
  }

  const localMsg: ChatMessage = {
    id: newMsgDoc.id,
    authorId: user.uid,
    authorAlias: authorAlias.slice(0, 40),
    authorAvatar: authorAvatar.slice(0, 60),
    content: trimmed,
    createdAt: new Date().toISOString(),
  };

  const existing = getLocalChatMessages();
  existing.push(localMsg);
  saveLocalChatMessages(existing);
  lastSentTimestamp = Date.now();
  chatListeners.forEach((cb) => cb());
  chatSyncChannel?.postMessage({ type: 'chat_updated' });
  return localMsg.id;
}

export function subscribeToChatMessages(
  onUpdate: (messages: ChatMessage[]) => void,
  onError: (error: any) => void
): () => void {
  const chatCol = collection(db, 'chat_messages');
  const q = query(chatCol, orderBy('createdAt', 'desc'), limit(80));

  let remoteMessages: ChatMessage[] = [];

  const emitMerged = () => {
    const localMsgs = getLocalChatMessages();
    const byId = new Map<string, ChatMessage>();
    for (const m of remoteMessages) byId.set(m.id, m);
    for (const lm of localMsgs) byId.set(lm.id, lm);

    const merged = Array.from(byId.values()).sort((a, b) => {
      const timeA = a.createdAt?.toMillis
        ? a.createdAt.toMillis()
        : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toMillis
        ? b.createdAt.toMillis()
        : new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    onUpdate(merged.slice(-80));
  };

  chatListeners.add(emitMerged);

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      remoteMessages = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            authorId: data.authorId,
            authorAlias: data.authorAlias || 'Campus Ghost',
            authorAvatar: data.authorAvatar || '🫖',
            content: data.content || '',
            createdAt: data.createdAt,
          };
        })
        .reverse();

      emitMerged();
    },
    (err) => {
      console.warn('Chat listener fallback to local:', err?.message || err);
      emitMerged();
    }
  );

  return () => {
    chatListeners.delete(emitMerged);
    unsub();
  };
}
