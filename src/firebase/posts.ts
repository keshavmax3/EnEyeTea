import {
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc,
  increment,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { db, auth } from './config';
import { getCurrentUser } from './auth';
import { Post, Comment, ReactionType, SentimentInsight, ReactionCounts } from '../types';

const INITIAL_REACTIONS: ReactionCounts = {
  spill: 0,
  ded: 0,
  sip: 0,
  flag: 0,
  mood: 0,
};

const LOCAL_POSTS_KEY = 'eneyetea_local_posts_v1';
const LOCAL_REACTIONS_KEY = 'eneyetea_local_reactions_v1';
const LOCAL_COMMENTS_KEY = 'eneyetea_local_comments_v1';

const postListeners = new Set<() => void>();
const commentListeners = new Map<string, Set<() => void>>();

const syncChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('eneyetea_realtime_sync')
    : null;

if (syncChannel) {
  syncChannel.onmessage = (ev) => {
    if (ev.data?.type === 'posts_updated') {
      postListeners.forEach((cb) => cb());
    } else if (ev.data?.type === 'comments_updated' && ev.data?.postId) {
      commentListeners.get(ev.data.postId)?.forEach((cb) => cb());
      postListeners.forEach((cb) => cb());
    }
  };
}

function notifyPostListeners() {
  postListeners.forEach((cb) => cb());
  syncChannel?.postMessage({ type: 'posts_updated' });
}

function notifyCommentListeners(postId: string) {
  commentListeners.get(postId)?.forEach((cb) => cb());
  postListeners.forEach((cb) => cb());
  syncChannel?.postMessage({ type: 'comments_updated', postId });
}

function getLocalPosts(): Post[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_POSTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveLocalPosts(posts: Post[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_POSTS_KEY, JSON.stringify(posts));
  } catch {
    // ignore
  }
}

function getLocalReactionsMap(): Record<string, Record<string, ReactionType>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_REACTIONS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveLocalReactionsMap(map: Record<string, Record<string, ReactionType>>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_REACTIONS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function getLocalCommentsMap(): Record<string, Comment[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LOCAL_COMMENTS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveLocalCommentsMap(map: Record<string, Comment[]>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_COMMENTS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export async function createPost(
  content: string,
  authorAlias: string,
  authorAvatar: string,
  sentiment?: SentimentInsight
): Promise<string> {
  const user = getCurrentUser();
  if (!user) throw new Error('You must sign in with Gmail to spill tea.');

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 500) {
    throw new Error('Post content must be between 1 and 500 characters.');
  }

  const postsRef = collection(db, 'posts');
  const newPostDoc = doc(postsRef);

  if (auth.currentUser) {
    try {
      const postData: any = {
        authorId: user.uid,
        authorAlias: authorAlias.slice(0, 40),
        authorAvatar: authorAvatar.slice(0, 60),
        content: trimmed,
        commentCount: 0,
        reactionCounts: { ...INITIAL_REACTIONS },
        createdAt: serverTimestamp(),
      };

      if (sentiment) {
        postData.sentiment = sentiment;
      }

      await setDoc(newPostDoc, postData);
      return newPostDoc.id;
    } catch {
      // Fallback to local persistence below
    }
  }

  const localPost: Post = {
    id: newPostDoc.id,
    authorId: user.uid,
    authorAlias: authorAlias.slice(0, 40),
    authorAvatar: authorAvatar.slice(0, 60),
    content: trimmed,
    createdAt: new Date().toISOString(),
    commentCount: 0,
    reactionCounts: { ...INITIAL_REACTIONS },
    ...(sentiment ? { sentiment } : {}),
  };

  const existing = getLocalPosts();
  existing.unshift(localPost);
  saveLocalPosts(existing);
  notifyPostListeners();
  return localPost.id;
}

export async function updatePostSentiment(postId: string, sentiment: SentimentInsight): Promise<void> {
  if (auth.currentUser) {
    try {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, { sentiment });
      return;
    } catch {
      // Fallback to local update below
    }
  }

  const localPosts = getLocalPosts();
  const idx = localPosts.findIndex((p) => p.id === postId);
  if (idx !== -1) {
    localPosts[idx].sentiment = sentiment;
    saveLocalPosts(localPosts);
    notifyPostListeners();
  }
}

export function subscribeToPosts(
  sortBy: 'recent' | 'popular',
  limitCount: number,
  onUpdate: (posts: Post[]) => void,
  onError: (error: any) => void
): () => void {
  const postsRef = collection(db, 'posts');
  const q = query(postsRef, orderBy('createdAt', 'desc'), limit(limitCount));

  let remotePosts: Post[] = [];

  const emitMerged = () => {
    const localPosts = getLocalPosts();
    const localComments = getLocalCommentsMap();
    const localReactions = getLocalReactionsMap();

    const byId = new Map<string, Post>();
    for (const p of remotePosts) {
      byId.set(p.id, { ...p, reactionCounts: { ...p.reactionCounts } });
    }
    for (const lp of localPosts) {
      if (!byId.has(lp.id)) {
        byId.set(lp.id, { ...lp, reactionCounts: { ...lp.reactionCounts } });
      } else {
        const existing = byId.get(lp.id)!;
        if (lp.sentiment && !existing.sentiment) {
          existing.sentiment = lp.sentiment;
        }
      }
    }

    const merged = Array.from(byId.values()).map((p) => {
      const extraComments = (localComments[p.id] || []).length;
      const isLocalOnly = localPosts.some((lp) => lp.id === p.id) && !remotePosts.some((rp) => rp.id === p.id);
      const commentCount = isLocalOnly ? extraComments : p.commentCount + extraComments;

      const postReacts = localReactions[p.id];
      const counts = { ...p.reactionCounts };
      if (!isLocalOnly && postReacts) {
        Object.values(postReacts).forEach((rType) => {
          counts[rType] = (counts[rType] || 0) + 1;
        });
      }

      return {
        ...p,
        commentCount,
        reactionCounts: counts,
      };
    });

    if (sortBy === 'popular') {
      merged.sort((a, b) => {
        const totalA =
          a.reactionCounts.spill * 2 +
          a.reactionCounts.ded +
          a.reactionCounts.sip +
          a.reactionCounts.mood +
          a.commentCount * 3;
        const totalB =
          b.reactionCounts.spill * 2 +
          b.reactionCounts.ded +
          b.reactionCounts.sip +
          b.reactionCounts.mood +
          b.commentCount * 3;
        return totalB - totalA;
      });
    } else {
      merged.sort((a, b) => {
        const timeA = a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : new Date(a.createdAt || 0).getTime();
        const timeB = b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    }

    onUpdate(merged);
  };

  postListeners.add(emitMerged);

  const unsubFirestore = onSnapshot(
    q,
    (snapshot) => {
      remotePosts = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          authorId: data.authorId,
          authorAlias: data.authorAlias || 'Anonymous',
          authorAvatar: data.authorAvatar || '🫖',
          content: data.content || '',
          createdAt: data.createdAt,
          commentCount: data.commentCount || 0,
          reactionCounts: {
            spill: data.reactionCounts?.spill || 0,
            ded: data.reactionCounts?.ded || 0,
            sip: data.reactionCounts?.sip || 0,
            flag: data.reactionCounts?.flag || 0,
            mood: data.reactionCounts?.mood || 0,
          },
          sentiment: data.sentiment,
        };
      });
      emitMerged();
    },
    (err) => {
      console.warn('Posts listener fallback to local:', err?.message || err);
      emitMerged();
    }
  );

  return () => {
    postListeners.delete(emitMerged);
    unsubFirestore();
  };
}

export async function getUserReaction(postId: string, userId: string): Promise<ReactionType | null> {
  const localMap = getLocalReactionsMap();
  if (localMap[postId] && userId in localMap[postId]) {
    return localMap[postId][userId] || null;
  }

  try {
    const reactionRef = doc(db, 'posts', postId, 'reactions', userId);
    const snap = await getDoc(reactionRef);
    if (snap.exists()) {
      return (snap.data().reactionType as ReactionType) || null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function togglePostReaction(
  postId: string,
  reactionType: ReactionType
): Promise<{ userReaction: ReactionType | null; newCounts: ReactionCounts }> {
  const user = getCurrentUser();
  if (!user) throw new Error('Must be signed in to react');

  if (auth.currentUser) {
    try {
      const reactionDocRef = doc(db, 'posts', postId, 'reactions', user.uid);
      const postDocRef = doc(db, 'posts', postId);

      return await runTransaction(db, async (transaction) => {
        const postSnap = await transaction.get(postDocRef);
        if (!postSnap.exists()) {
          throw new Error('Post not in Firestore');
        }

        const postData = postSnap.data();
        const currentCounts: ReactionCounts = {
          spill: postData.reactionCounts?.spill || 0,
          ded: postData.reactionCounts?.ded || 0,
          sip: postData.reactionCounts?.sip || 0,
          flag: postData.reactionCounts?.flag || 0,
          mood: postData.reactionCounts?.mood || 0,
        };

        const reactionSnap = await transaction.get(reactionDocRef);
        let finalUserReaction: ReactionType | null = null;

        if (reactionSnap.exists()) {
          const prevType = reactionSnap.data().reactionType as ReactionType;
          if (prevType === reactionType) {
            transaction.delete(reactionDocRef);
            currentCounts[prevType] = Math.max(0, currentCounts[prevType] - 1);
            finalUserReaction = null;
          } else {
            transaction.set(reactionDocRef, {
              userId: user.uid,
              reactionType,
              createdAt: serverTimestamp(),
            });
            currentCounts[prevType] = Math.max(0, currentCounts[prevType] - 1);
            currentCounts[reactionType] = (currentCounts[reactionType] || 0) + 1;
            finalUserReaction = reactionType;
          }
        } else {
          transaction.set(reactionDocRef, {
            userId: user.uid,
            reactionType,
            createdAt: serverTimestamp(),
          });
          currentCounts[reactionType] = (currentCounts[reactionType] || 0) + 1;
          finalUserReaction = reactionType;
        }

        transaction.update(postDocRef, {
          reactionCounts: currentCounts,
        });

        return { userReaction: finalUserReaction, newCounts: currentCounts };
      });
    } catch {
      // Fallback to local reaction toggle below
    }
  }

  const localReactions = getLocalReactionsMap();
  if (!localReactions[postId]) localReactions[postId] = {};
  const prevType = localReactions[postId][user.uid] || null;
  let finalUserReaction: ReactionType | null = null;

  if (prevType === reactionType) {
    delete localReactions[postId][user.uid];
    finalUserReaction = null;
  } else {
    localReactions[postId][user.uid] = reactionType;
    finalUserReaction = reactionType;
  }
  saveLocalReactionsMap(localReactions);

  const localPosts = getLocalPosts();
  const postIdx = localPosts.findIndex((p) => p.id === postId);
  let updatedCounts: ReactionCounts = { ...INITIAL_REACTIONS };

  if (postIdx !== -1) {
    const counts = { ...localPosts[postIdx].reactionCounts };
    if (prevType) {
      counts[prevType] = Math.max(0, (counts[prevType] || 0) - 1);
    }
    if (finalUserReaction) {
      counts[finalUserReaction] = (counts[finalUserReaction] || 0) + 1;
    }
    localPosts[postIdx].reactionCounts = counts;
    saveLocalPosts(localPosts);
    updatedCounts = counts;
  }

  notifyPostListeners();
  return { userReaction: finalUserReaction, newCounts: updatedCounts };
}

export async function addComment(
  postId: string,
  content: string,
  authorAlias: string,
  authorAvatar: string
): Promise<string> {
  const user = getCurrentUser();
  if (!user) throw new Error('Must be signed in to comment');

  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 300) {
    throw new Error('Comment must be between 1 and 300 characters');
  }

  const commentsCol = collection(db, 'posts', postId, 'comments');
  const newCommentDoc = doc(commentsCol);

  if (auth.currentUser) {
    try {
      const postDocRef = doc(db, 'posts', postId);
      await setDoc(newCommentDoc, {
        postId,
        authorId: user.uid,
        authorAlias: authorAlias.slice(0, 40),
        authorAvatar: authorAvatar.slice(0, 60),
        content: trimmed,
        createdAt: serverTimestamp(),
      });

      await updateDoc(postDocRef, {
        commentCount: increment(1),
      });

      return newCommentDoc.id;
    } catch {
      // Fallback to local comments below
    }
  }

  const localComments = getLocalCommentsMap();
  if (!localComments[postId]) localComments[postId] = [];
  const newComment: Comment = {
    id: newCommentDoc.id,
    postId,
    authorId: user.uid,
    authorAlias: authorAlias.slice(0, 40),
    authorAvatar: authorAvatar.slice(0, 60),
    content: trimmed,
    createdAt: new Date().toISOString(),
  };
  localComments[postId].push(newComment);
  saveLocalCommentsMap(localComments);
  notifyCommentListeners(postId);
  return newComment.id;
}

export function subscribeToComments(
  postId: string,
  onUpdate: (comments: Comment[]) => void,
  onError: (error: any) => void
): () => void {
  const commentsCol = collection(db, 'posts', postId, 'comments');
  const q = query(commentsCol, orderBy('createdAt', 'asc'));

  let remoteComments: Comment[] = [];

  const emitMerged = () => {
    const localMap = getLocalCommentsMap();
    const localForPost = localMap[postId] || [];
    const byId = new Map<string, Comment>();
    for (const c of remoteComments) byId.set(c.id, c);
    for (const lc of localForPost) byId.set(lc.id, lc);
    onUpdate(Array.from(byId.values()));
  };

  if (!commentListeners.has(postId)) {
    commentListeners.set(postId, new Set());
  }
  commentListeners.get(postId)!.add(emitMerged);

  const unsub = onSnapshot(
    q,
    (snapshot) => {
      remoteComments = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          postId,
          authorId: data.authorId,
          authorAlias: data.authorAlias || 'Anonymous',
          authorAvatar: data.authorAvatar || '🫖',
          content: data.content || '',
          createdAt: data.createdAt,
        };
      });
      emitMerged();
    },
    (err) => {
      console.warn('Comments listener fallback to local:', err?.message || err);
      emitMerged();
    }
  );

  return () => {
    commentListeners.get(postId)?.delete(emitMerged);
    unsub();
  };
}
