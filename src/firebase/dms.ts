import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from './config';
import { getCurrentUser } from './auth';
import { FriendRequest, DirectMessage, FriendRequestStatus } from '../types';

const LOCAL_FRIEND_REQUESTS_KEY = 'eneyetea_friend_requests_v1';
const LOCAL_DM_MESSAGES_KEY = 'eneyetea_dm_messages_v1';

const requestListeners = new Set<() => void>();
const dmListeners = new Map<string, Set<() => void>>();

const dmSyncChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('eneyetea_dm_sync')
    : null;

if (dmSyncChannel) {
  dmSyncChannel.onmessage = (ev) => {
    if (ev.data?.type === 'requests_updated') {
      requestListeners.forEach((cb) => cb());
    } else if (ev.data?.type === 'dm_updated' && ev.data?.conversationId) {
      dmListeners.get(ev.data.conversationId)?.forEach((cb) => cb());
    }
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === LOCAL_FRIEND_REQUESTS_KEY) {
      requestListeners.forEach((cb) => cb());
    } else if (e.key === LOCAL_DM_MESSAGES_KEY) {
      dmListeners.forEach((set) => set.forEach((cb) => cb()));
    }
  });
}

function notifyRequestListeners() {
  requestListeners.forEach((cb) => cb());
  dmSyncChannel?.postMessage({ type: 'requests_updated' });
}

function notifyDmListeners(conversationId: string) {
  dmListeners.get(conversationId)?.forEach((cb) => cb());
  dmSyncChannel?.postMessage({ type: 'dm_updated', conversationId });
}

export function getConversationId(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join('__');
}

function getLocalFriendRequests(): FriendRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_FRIEND_REQUESTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalFriendRequests(reqs: FriendRequest[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_FRIEND_REQUESTS_KEY, JSON.stringify(reqs));
  } catch {
    // ignore
  }
}

function getLocalDmMap(): Record<string, DirectMessage[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_DM_MESSAGES_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveLocalDmMap(map: Record<string, DirectMessage[]>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_DM_MESSAGES_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function getFriendshipRelation(
  requests: FriendRequest[],
  currentUserId: string,
  targetUserId: string
): {
  status: 'none' | 'pending_outgoing' | 'pending_incoming' | 'accepted';
  request?: FriendRequest;
} {
  const match = requests.find(
    (r) =>
      (r.fromUserId === currentUserId && r.toUserId === targetUserId) ||
      (r.fromUserId === targetUserId && r.toUserId === currentUserId)
  );

  if (!match || match.status === 'rejected') {
    return { status: 'none' };
  }
  if (match.status === 'accepted') {
    return { status: 'accepted', request: match };
  }
  if (match.fromUserId === currentUserId) {
    return { status: 'pending_outgoing', request: match };
  }
  return { status: 'pending_incoming', request: match };
}

export async function sendFriendRequest(
  toUserId: string,
  toAlias: string,
  toAvatar: string,
  fromAlias: string,
  fromAvatar: string
): Promise<FriendRequest> {
  const user = getCurrentUser();
  if (!user) throw new Error('You must be signed in to send a friend request.');
  if (user.uid === toUserId) {
    throw new Error('You cannot send a friend request to yourself.');
  }

  const reqId = getConversationId(user.uid, toUserId);
  const existingLocal = getLocalFriendRequests();
  const existingIdx = existingLocal.findIndex((r) => r.id === reqId);

  if (existingIdx !== -1) {
    const current = existingLocal[existingIdx];
    if (current.status === 'accepted') {
      return current;
    }
    if (current.status === 'pending' && current.fromUserId !== user.uid) {
      current.status = 'accepted';
      current.updatedAt = new Date().toISOString();
      saveLocalFriendRequests(existingLocal);
      notifyRequestListeners();
      return current;
    }
  }

  const newReq: FriendRequest = {
    id: reqId,
    fromUserId: user.uid,
    fromAlias: fromAlias.slice(0, 40),
    fromAvatar: fromAvatar.slice(0, 60),
    toUserId,
    toAlias: toAlias.slice(0, 40),
    toAvatar: toAvatar.slice(0, 60),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'friend_requests', reqId), {
        ...newReq,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Fallback to local storage sync below
    }
  }

  const updated = existingLocal.filter((r) => r.id !== reqId);
  updated.unshift(newReq);
  saveLocalFriendRequests(updated);
  notifyRequestListeners();
  return newReq;
}

export async function respondToFriendRequest(
  requestId: string,
  newStatus: 'accepted' | 'rejected'
): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('Must be signed in to respond to friend requests.');

  if (auth.currentUser) {
    try {
      const ref = doc(db, 'friend_requests', requestId);
      if (newStatus === 'rejected') {
        await deleteDoc(ref);
      } else {
        await updateDoc(ref, {
          status: newStatus,
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Fallback to local update below
    }
  }

  const localReqs = getLocalFriendRequests();
  if (newStatus === 'rejected') {
    saveLocalFriendRequests(localReqs.filter((r) => r.id !== requestId));
  } else {
    const idx = localReqs.findIndex((r) => r.id === requestId);
    if (idx !== -1) {
      localReqs[idx].status = newStatus;
      localReqs[idx].updatedAt = new Date().toISOString();
      saveLocalFriendRequests(localReqs);
    }
  }
  notifyRequestListeners();
}

export async function removeFriendOrRequest(requestId: string): Promise<void> {
  if (auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'friend_requests', requestId));
    } catch {
      // ignore
    }
  }
  const localReqs = getLocalFriendRequests().filter((r) => r.id !== requestId);
  saveLocalFriendRequests(localReqs);
  notifyRequestListeners();
}

export function subscribeToFriendRequests(
  userId: string,
  onUpdate: (requests: FriendRequest[]) => void
): () => void {
  let remoteFrom: FriendRequest[] = [];
  let remoteTo: FriendRequest[] = [];

  const emitMerged = () => {
    const localReqs = getLocalFriendRequests().filter(
      (r) => r.fromUserId === userId || r.toUserId === userId
    );
    const byId = new Map<string, FriendRequest>();

    for (const r of [...remoteFrom, ...remoteTo]) {
      byId.set(r.id, r);
    }
    for (const lr of localReqs) {
      const existing = byId.get(lr.id);
      if (!existing || lr.status === 'accepted') {
        byId.set(lr.id, lr);
      }
    }

    const list = Array.from(byId.values()).sort((a, b) => {
      const timeA = a.createdAt?.toMillis
        ? a.createdAt.toMillis()
        : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toMillis
        ? b.createdAt.toMillis()
        : new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    onUpdate(list);
  };

  requestListeners.add(emitMerged);
  emitMerged();

  let unsubFrom = () => {};
  let unsubTo = () => {};

  try {
    const qFrom = query(
      collection(db, 'friend_requests'),
      where('fromUserId', '==', userId)
    );
    const qTo = query(
      collection(db, 'friend_requests'),
      where('toUserId', '==', userId)
    );

    unsubFrom = onSnapshot(
      qFrom,
      (snap) => {
        remoteFrom = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FriendRequest, 'id'>),
        }));
        emitMerged();
      },
      () => emitMerged()
    );

    unsubTo = onSnapshot(
      qTo,
      (snap) => {
        remoteTo = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FriendRequest, 'id'>),
        }));
        emitMerged();
      },
      () => emitMerged()
    );
  } catch {
    emitMerged();
  }

  return () => {
    requestListeners.delete(emitMerged);
    unsubFrom();
    unsubTo();
  };
}

export async function sendDirectMessage(
  receiverId: string,
  content: string,
  senderAlias: string,
  senderAvatar: string,
  acceptedFriendRequests?: FriendRequest[]
): Promise<DirectMessage> {
  const user = getCurrentUser();
  if (!user) throw new Error('You must be signed in to send a DM.');

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 500) {
    throw new Error('Direct message must be between 1 and 500 characters.');
  }

  const conversationId = getConversationId(user.uid, receiverId);

  const allReqs = acceptedFriendRequests || getLocalFriendRequests();
  const relation = getFriendshipRelation(allReqs, user.uid, receiverId);
  if (relation.status !== 'accepted') {
    throw new Error(
      'You can only send 1-on-1 DMs after your friend request has been accepted!'
    );
  }

  const msgId = `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const newMsg: DirectMessage = {
    id: msgId,
    conversationId,
    senderId: user.uid,
    senderAlias: senderAlias.slice(0, 40),
    senderAvatar: senderAvatar.slice(0, 60),
    receiverId,
    content: trimmed,
    createdAt: new Date().toISOString(),
  };

  if (auth.currentUser) {
    try {
      await setDoc(doc(db, 'dm_messages', msgId), {
        ...newMsg,
        createdAt: serverTimestamp(),
      });
    } catch {
      // Fallback to local DM storage below
    }
  }

  const dmMap = getLocalDmMap();
  if (!dmMap[conversationId]) dmMap[conversationId] = [];
  dmMap[conversationId].push(newMsg);
  saveLocalDmMap(dmMap);
  notifyDmListeners(conversationId);

  return newMsg;
}

export function subscribeToDirectMessages(
  userId: string,
  peerId: string,
  onUpdate: (messages: DirectMessage[]) => void
): () => void {
  const conversationId = getConversationId(userId, peerId);
  let remoteMsgs: DirectMessage[] = [];

  const emitMerged = () => {
    const dmMap = getLocalDmMap();
    const localMsgs = dmMap[conversationId] || [];
    const byId = new Map<string, DirectMessage>();

    for (const m of remoteMsgs) byId.set(m.id, m);
    for (const lm of localMsgs) byId.set(lm.id, lm);

    const sorted = Array.from(byId.values()).sort((a, b) => {
      const timeA = a.createdAt?.toMillis
        ? a.createdAt.toMillis()
        : new Date(a.createdAt || 0).getTime();
      const timeB = b.createdAt?.toMillis
        ? b.createdAt.toMillis()
        : new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    onUpdate(sorted);
  };

  if (!dmListeners.has(conversationId)) {
    dmListeners.set(conversationId, new Set());
  }
  dmListeners.get(conversationId)!.add(emitMerged);
  emitMerged();

  let unsub = () => {};
  try {
    const q = query(
      collection(db, 'dm_messages'),
      where('conversationId', '==', conversationId),
      orderBy('createdAt', 'asc')
    );
    unsub = onSnapshot(
      q,
      (snap) => {
        remoteMsgs = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<DirectMessage, 'id'>),
        }));
        emitMerged();
      },
      () => emitMerged()
    );
  } catch {
    emitMerged();
  }

  return () => {
    dmListeners.get(conversationId)?.delete(emitMerged);
    unsub();
  };
}
