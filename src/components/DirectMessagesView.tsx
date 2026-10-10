import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  UserPlus,
  UserCheck,
  Clock,
  Send,
  Lock,
  Check,
  X,
  MessageSquareLock,
  Users,
  Bell,
  Search,
  ShieldCheck,
  ArrowLeft,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  FriendRequest,
  DirectMessage,
  UserProfile,
  Post,
} from '../types';
import {
  sendFriendRequest,
  respondToFriendRequest,
  removeFriendOrRequest,
  sendDirectMessage,
  subscribeToDirectMessages,
  getFriendshipRelation,
} from '../firebase/dms';
import { timeAgo } from '../utils/timeAgo';

interface DirectMessagesViewProps {
  currentUserId: string;
  profile: UserProfile;
  friendRequests: FriendRequest[];
  posts: Post[];
  selectedPeerId?: string | null;
  onSelectPeer?: (peerId: string | null) => void;
}

interface CampusPeer {
  userId: string;
  alias: string;
  avatar: string;
  isDemoPersona?: boolean;
}

const DEMO_CAMPUS_PEERS: CampusPeer[] = [
  {
    userId: 'campus_peer_otter_29',
    alias: 'Sleepy Otter #29',
    avatar: '🦦',
    isDemoPersona: true,
  },
  {
    userId: 'campus_peer_chemist_14',
    alias: 'Caffeinated Chemist #14',
    avatar: '🍵',
    isDemoPersona: true,
  },
  {
    userId: 'campus_peer_panda_77',
    alias: 'Midterm Panda #77',
    avatar: '🐼',
    isDemoPersona: true,
  },
  {
    userId: 'campus_peer_fox_88',
    alias: 'Late-Night Fox #88',
    avatar: '🦊',
    isDemoPersona: true,
  },
];

export const DirectMessagesView: React.FC<DirectMessagesViewProps> = ({
  currentUserId,
  profile,
  friendRequests,
  posts,
  selectedPeerId,
  onSelectPeer,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'friends' | 'requests' | 'discover'>('friends');
  const [internalPeerId, setInternalPeerId] = useState<string | null>(selectedPeerId || null);
  const activePeerId = selectedPeerId !== undefined ? selectedPeerId : internalPeerId;
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [msgInput, setMsgInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchPeerQuery, setSearchPeerQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectPeer = (peerId: string | null) => {
    setInternalPeerId(peerId);
    onSelectPeer?.(peerId);
    setError(null);
  };

  const knownPeers = useMemo(() => {
    const map = new Map<string, CampusPeer>();

    for (const demo of DEMO_CAMPUS_PEERS) {
      if (demo.userId !== currentUserId) {
        map.set(demo.userId, demo);
      }
    }

    for (const post of posts) {
      if (post.authorId && post.authorId !== currentUserId) {
        map.set(post.authorId, {
          userId: post.authorId,
          alias: post.authorAlias,
          avatar: post.authorAvatar,
        });
      }
    }

    for (const req of friendRequests) {
      const isMeSender = req.fromUserId === currentUserId;
      const peerId = isMeSender ? req.toUserId : req.fromUserId;
      const peerAlias = isMeSender ? req.toAlias : req.fromAlias;
      const peerAvatar = isMeSender ? req.toAvatar : req.fromAvatar;
      if (peerId && peerId !== currentUserId) {
        map.set(peerId, {
          userId: peerId,
          alias: peerAlias,
          avatar: peerAvatar,
          isDemoPersona: DEMO_CAMPUS_PEERS.some((d) => d.userId === peerId),
        });
      }
    }

    return Array.from(map.values());
  }, [posts, friendRequests, currentUserId]);

  const acceptedRequests = useMemo(
    () => friendRequests.filter((r) => r.status === 'accepted'),
    [friendRequests]
  );

  const incomingRequests = useMemo(
    () =>
      friendRequests.filter(
        (r) => r.status === 'pending' && r.toUserId === currentUserId
      ),
    [friendRequests, currentUserId]
  );

  const outgoingRequests = useMemo(
    () =>
      friendRequests.filter(
        (r) => r.status === 'pending' && r.fromUserId === currentUserId
      ),
    [friendRequests, currentUserId]
  );

  const activePeer: CampusPeer | null = useMemo(() => {
    if (!activePeerId) return null;
    const found = knownPeers.find((p) => p.userId === activePeerId);
    if (found) return found;
    return {
      userId: activePeerId,
      alias: 'Campus Student',
      avatar: '🫖',
    };
  }, [activePeerId, knownPeers]);

  const activeRelation = useMemo(() => {
    if (!activePeerId) return { status: 'none' as const };
    return getFriendshipRelation(friendRequests, currentUserId, activePeerId);
  }, [friendRequests, currentUserId, activePeerId]);

  useEffect(() => {
    if (!activePeerId || activeRelation.status !== 'accepted') {
      return;
    }

    const unsub = subscribeToDirectMessages(currentUserId, activePeerId, (incoming) => {
      setMessages(incoming);
    });

    return () => {
      unsub();
      setMessages([]);
    };
  }, [currentUserId, activePeerId, activeRelation.status]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendFriendRequest = async (peer: CampusPeer) => {
    setError(null);
    try {
      await sendFriendRequest(
        peer.userId,
        peer.alias,
        peer.avatar,
        profile.alias,
        profile.avatar
      );
      selectPeer(peer.userId);
    } catch (err: any) {
      setError(err?.message || 'Failed to send friend request.');
    }
  };

  const handleRespondRequest = async (
    req: FriendRequest,
    decision: 'accepted' | 'rejected'
  ) => {
    setError(null);
    try {
      await respondToFriendRequest(req.id, decision);
      if (decision === 'accepted') {
        const peerId = req.fromUserId === currentUserId ? req.toUserId : req.fromUserId;
        selectPeer(peerId);
        setActiveSubTab('friends');
      }
    } catch (err: any) {
      setError(err?.message || 'Could not update friend request.');
    }
  };

  const handleSimulatePeerAccept = async (req: FriendRequest) => {
    setError(null);
    try {
      await respondToFriendRequest(req.id, 'accepted');
      const peerId = req.fromUserId === currentUserId ? req.toUserId : req.fromUserId;
      selectPeer(peerId);
      setActiveSubTab('friends');
    } catch (err: any) {
      setError(err?.message || 'Could not accept request.');
    }
  };

  const handleSendDm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePeer || !msgInput.trim() || isSending) return;

    if (activeRelation.status !== 'accepted') {
      setError('You must be accepted friends before sending a 1-on-1 DM!');
      return;
    }

    const text = msgInput.trim();
    setIsSending(true);
    setError(null);

    try {
      await sendDirectMessage(
        activePeer.userId,
        text,
        profile.alias,
        profile.avatar,
        friendRequests
      );
      setMsgInput('');
    } catch (err: any) {
      setError(err?.message || 'Failed to send DM.');
    } finally {
      setIsSending(false);
    }
  };

  const filteredDiscoverPeers = useMemo(() => {
    const q = searchPeerQuery.trim().toLowerCase();
    if (!q) return knownPeers;
    return knownPeers.filter((p) => p.alias.toLowerCase().includes(q));
  }, [knownPeers, searchPeerQuery]);

  return (
    <main className="flex-1 max-w-2xl w-full flex flex-col bg-white rounded-3xl border border-stone-200/90 shadow-xs overflow-hidden h-[calc(100vh-7.5rem)] min-h-[540px]">
      {/* Top DM Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-stone-200/80 bg-[#fdfbf7] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300/60 flex items-center justify-center text-amber-800">
            <MessageSquareLock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-extrabold text-stone-900 text-sm sm:text-base">
                Personal 1-on-1 DMs
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200">
                Friend Req Required
              </span>
            </div>
            <p className="text-[11px] text-stone-500">
              Send a friend request & wait for acceptance to unlock private DMs
            </p>
          </div>
        </div>

        {/* Sub-navigation Pills */}
        <div className="flex items-center gap-1 bg-stone-200/70 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab('friends')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeSubTab === 'friends'
                ? 'bg-white text-stone-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>DMs ({acceptedRequests.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('requests')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer relative ${
              activeSubTab === 'requests'
                ? 'bg-white text-stone-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Requests</span>
            {(incomingRequests.length > 0 || outgoingRequests.length > 0) && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  incomingRequests.length > 0
                    ? 'bg-rose-500 text-white'
                    : 'bg-amber-200 text-amber-900'
                }`}
              >
                {incomingRequests.length + outgoingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('discover')}
            className={`px-2.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1 cursor-pointer ${
              activeSubTab === 'discover'
                ? 'bg-white text-stone-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Add Friend</span>
          </button>
        </div>
      </div>

      {/* Main Split Body */}
      <div className="flex-1 flex overflow-hidden">
        <div
          className={`${
            activePeerId ? 'hidden sm:flex' : 'flex'
          } w-full sm:w-64 border-r border-stone-200/80 flex-col bg-stone-50/50`}
        >
          {/* TAB 1: ACCEPTED FRIENDS LIST */}
          {activeSubTab === 'friends' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="px-1 py-1 flex items-center justify-between">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">
                  Accepted Friends ({acceptedRequests.length})
                </span>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('discover')}
                  className="text-[11px] font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
                >
                  + Find Students
                </button>
              </div>

              {acceptedRequests.length === 0 ? (
                <div className="p-5 text-center space-y-3 bg-white rounded-2xl border border-stone-200/70 mt-2">
                  <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-stone-800">
                      No DM Friends Yet
                    </p>
                    <p className="text-[11px] text-stone-500 leading-relaxed">
                      You must send a friend request and have it accepted before you can 1-on-1 DM.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('discover')}
                    className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Send a Friend Request
                  </button>
                </div>
              ) : (
                acceptedRequests.map((req) => {
                  const isMeSender = req.fromUserId === currentUserId;
                  const peerId = isMeSender ? req.toUserId : req.fromUserId;
                  const peerAlias = isMeSender ? req.toAlias : req.fromAlias;
                  const peerAvatar = isMeSender ? req.toAvatar : req.fromAvatar;
                  const isSelected = activePeerId === peerId;

                  return (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => selectPeer(peerId)}
                      className={`w-full p-2.5 rounded-2xl flex items-center gap-2.5 text-left transition-all cursor-pointer border ${
                        isSelected
                          ? 'bg-amber-50/90 border-amber-300 shadow-2xs'
                          : 'bg-white hover:bg-stone-100/70 border-stone-200/70'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-amber-100/80 flex items-center justify-center text-lg shrink-0">
                        {peerAvatar}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-stone-900 truncate">
                          {peerAlias}
                        </p>
                        <p className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          <span>Friends • Tap to DM</span>
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: INCOMING & OUTGOING FRIEND REQUESTS */}
          {activeSubTab === 'requests' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              <div className="space-y-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400 px-1 block">
                  Incoming Requests ({incomingRequests.length})
                </span>
                {incomingRequests.length === 0 ? (
                  <p className="text-[11px] text-stone-400 bg-white p-3 rounded-xl border border-stone-200/60">
                    No incoming friend requests right now.
                  </p>
                ) : (
                  incomingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="p-3 rounded-2xl bg-white border border-amber-300/80 shadow-2xs space-y-2.5"
                    >
                      <div
                        onClick={() => selectPeer(req.fromUserId)}
                        className="flex items-center gap-2.5 cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center text-base">
                          {req.fromAvatar}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-stone-900 truncate">
                            {req.fromAlias}
                          </p>
                          <p className="text-[10px] text-amber-700 font-medium">
                            Wants to 1-on-1 DM you
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleRespondRequest(req, 'accepted')}
                          className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Accept</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRespondRequest(req, 'rejected')}
                          className="py-1.5 px-2.5 bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-600 rounded-xl text-[11px] font-bold cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400 px-1 block">
                  Sent / Pending ({outgoingRequests.length})
                </span>
                {outgoingRequests.length === 0 ? (
                  <p className="text-[11px] text-stone-400 bg-white p-3 rounded-xl border border-stone-200/60">
                    No pending sent requests.
                  </p>
                ) : (
                  outgoingRequests.map((req) => (
                    <div
                      key={req.id}
                      onClick={() => selectPeer(req.toUserId)}
                      className="p-3 rounded-2xl bg-white border border-stone-200/80 space-y-2 cursor-pointer hover:border-amber-300 transition-all"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-stone-100 flex items-center justify-center text-base">
                          {req.toAvatar}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-stone-900 truncate">
                            {req.toAlias}
                          </p>
                          <p className="text-[10px] text-amber-700 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Waiting for acceptance</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSimulatePeerAccept(req);
                          }}
                          className="flex-1 py-1 px-2 bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs rounded-lg flex items-center justify-center gap-1 cursor-pointer"
                          title="Simulate the other user accepting your friend request for demo testing"
                        >
                          <Zap className="w-3 h-3" />
                          <span>Demo Accept</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFriendOrRequest(req.id);
                          }}
                          className="py-1 px-2 bg-stone-100 hover:bg-rose-50 text-stone-500 hover:text-rose-600 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DISCOVER CAMPUS STUDENTS */}
          {activeSubTab === 'discover' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchPeerQuery}
                  onChange={(e) => setSearchPeerQuery(e.target.value)}
                  placeholder="Find student alias..."
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-stone-200 rounded-xl text-xs text-stone-800 outline-none focus:border-amber-400"
                />
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-stone-400 px-1 block">
                  Active Campus Students
                </span>
                {filteredDiscoverPeers.map((peer) => {
                  const rel = getFriendshipRelation(
                    friendRequests,
                    currentUserId,
                    peer.userId
                  );

                  return (
                    <div
                      key={peer.userId}
                      onClick={() => selectPeer(peer.userId)}
                      className="p-2.5 rounded-2xl bg-white border border-stone-200/80 hover:border-amber-300 flex items-center justify-between gap-2 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-base shrink-0">
                          {peer.avatar}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-stone-900 truncate">
                            {peer.alias}
                          </p>
                          <p className="text-[10px] text-stone-400">
                            {rel.status === 'accepted'
                              ? 'Already Friends'
                              : rel.status === 'pending_outgoing'
                              ? 'Request Sent'
                              : rel.status === 'pending_incoming'
                              ? 'Sent you a request!'
                              : 'Send req to DM'}
                          </p>
                        </div>
                      </div>

                      {rel.status === 'none' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSendFriendRequest(peer);
                          }}
                          className="p-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold shrink-0 cursor-pointer"
                          title="Send Friend Request"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {rel.status === 'pending_outgoing' && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                          Pending
                        </span>
                      )}
                      {rel.status === 'accepted' && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
                          DM Open
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Pane */}
        <div
          className={`${
            activePeerId ? 'flex' : 'hidden sm:flex'
          } flex-1 flex-col bg-white`}
        >
          {!activePeer ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3 text-stone-400">
              <div className="w-14 h-14 rounded-3xl bg-amber-50 border border-amber-200/70 flex items-center justify-center text-amber-700">
                <MessageSquareLock className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-xs">
                <h3 className="font-extrabold text-stone-800 text-sm">
                  Select a Student to 1-on-1 DM
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  To protect student privacy, 1-on-1 DMs are locked until you send a friend request and the other student accepts it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSubTab('discover')}
                className="mt-1 px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-full text-xs font-bold transition-colors cursor-pointer"
              >
                Browse Campus Students
              </button>
            </div>
          ) : (
            <>
              {/* Active Peer Header */}
              <div className="px-4 py-3 border-b border-stone-200/80 flex items-center justify-between bg-[#fdfbf7]/60">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => selectPeer(null)}
                    className="sm:hidden p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-lg">
                    {activePeer.avatar}
                  </div>
                  <div>
                    <h3 className="font-bold text-stone-900 text-xs sm:text-sm">
                      {activePeer.alias}
                    </h3>
                    <p className="text-[10px] text-stone-500 flex items-center gap-1">
                      {activeRelation.status === 'accepted' ? (
                        <span className="text-emerald-700 font-semibold">
                          ● Friend Request Accepted • Private 1-on-1 DM
                        </span>
                      ) : activeRelation.status === 'pending_outgoing' ? (
                        <span className="text-amber-700 font-semibold">
                          ⏳ Friend Request Pending Acceptance
                        </span>
                      ) : activeRelation.status === 'pending_incoming' ? (
                        <span className="text-amber-700 font-semibold">
                          👋 Sent you a Friend Request
                        </span>
                      ) : (
                        <span>Not friends yet • Friend request required to DM</span>
                      )}
                    </p>
                  </div>
                </div>

                {activeRelation.request && (
                  <button
                    type="button"
                    onClick={() => removeFriendOrRequest(activeRelation.request!.id)}
                    className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Remove friend or cancel request"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* GATE 1: NOT FRIENDS YET */}
              {activeRelation.status === 'none' && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
                  <div className="w-14 h-14 rounded-3xl bg-amber-50 border border-amber-200 flex items-center justify-center text-2xl">
                    {activePeer.avatar}
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <div className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                      <Lock className="w-3 h-3" />
                      <span>DMs Locked</span>
                    </div>
                    <h4 className="font-extrabold text-stone-900 text-base">
                      Send a Friend Request to {activePeer.alias}
                    </h4>
                    <p className="text-xs text-stone-500 leading-relaxed">
                      You have to send a friend request and {activePeer.alias} has to accept it before you can send 1-on-1 direct messages.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSendFriendRequest(activePeer)}
                    className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-bold text-xs rounded-full shadow-sm flex items-center gap-2 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Send Friend Request</span>
                  </button>
                </div>
              )}

              {/* GATE 2: OUTGOING FRIEND REQUEST PENDING */}
              {activeRelation.status === 'pending_outgoing' && activeRelation.request && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
                  <div className="w-14 h-14 rounded-3xl bg-amber-50 border border-amber-300 flex items-center justify-center text-amber-700">
                    <Clock className="w-7 h-7 animate-pulse" />
                  </div>
                  <div className="space-y-1.5 max-w-sm">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-900 bg-amber-100 px-2.5 py-0.5 rounded-full">
                      Waiting for Acceptance
                    </span>
                    <h4 className="font-extrabold text-stone-900 text-base">
                      Friend Request Sent to {activePeer.alias}
                    </h4>
                    <p className="text-xs text-stone-500 leading-relaxed">
                      1-on-1 DMs are locked until <strong>{activePeer.alias}</strong> accepts your friend request.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleSimulatePeerAccept(activeRelation.request!)}
                      className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs rounded-full border border-amber-300 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-700" />
                      <span>Simulate {activePeer.alias} Accepting (Demo)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => removeFriendOrRequest(activeRelation.request!.id)}
                      className="px-4 py-2 bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-600 font-semibold text-xs rounded-full cursor-pointer"
                    >
                      Cancel Request
                    </button>
                  </div>
                </div>
              )}

              {/* GATE 3: INCOMING FRIEND REQUEST */}
              {activeRelation.status === 'pending_incoming' && activeRelation.request && (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
                  <div className="w-14 h-14 rounded-3xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-2xl">
                    {activePeer.avatar}
                  </div>
                  <div className="space-y-1.5 max-w-sm">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      Incoming Friend Request
                    </span>
                    <h4 className="font-extrabold text-stone-900 text-base">
                      {activePeer.alias} wants to DM you!
                    </h4>
                    <p className="text-xs text-stone-500 leading-relaxed">
                      Accept their friend request to unlock your private 1-on-1 DM conversation.
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        handleRespondRequest(activeRelation.request!, 'accepted')
                      }
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-full shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                      <span>Accept & Unlock DM</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleRespondRequest(activeRelation.request!, 'rejected')
                      }
                      className="px-4 py-2.5 bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-600 font-bold text-xs rounded-full cursor-pointer"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              )}

              {/* GATE 4: ACCEPTED FRIENDS */}
              {activeRelation.status === 'accepted' && (
                <>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#fcfaf7]/50">
                    <div className="text-center py-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] text-emerald-800 font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>
                          Friend request accepted! You & {activePeer.alias} can now DM privately.
                        </span>
                      </span>
                    </div>

                    {messages.length === 0 ? (
                      <div className="py-12 text-center text-xs text-stone-400">
                        Say hi to <strong className="text-stone-600">{activePeer.alias}</strong>! Your messages are private 1-on-1.
                      </div>
                    ) : (
                      messages.map((m) => {
                        const isMine = m.senderId === currentUserId;
                        return (
                          <div
                            key={m.id}
                            className={`flex items-end gap-2 ${
                              isMine ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            {!isMine && (
                              <div className="w-7 h-7 rounded-xl bg-amber-100 flex items-center justify-center text-sm shrink-0">
                                {m.senderAvatar}
                              </div>
                            )}
                            <div
                              className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                                isMine
                                  ? 'bg-stone-900 text-white rounded-br-xs'
                                  : 'bg-white border border-stone-200/90 text-stone-800 rounded-bl-xs shadow-2xs'
                              }`}
                            >
                              <p className="break-words">{m.content}</p>
                              <span
                                className={`block text-[9px] mt-1 ${
                                  isMine ? 'text-stone-400 text-right' : 'text-stone-400'
                                }`}
                              >
                                {timeAgo(m.createdAt)}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  {error && (
                    <div className="px-4 py-2 bg-rose-50 border-t border-rose-200 text-rose-700 text-xs">
                      {error}
                    </div>
                  )}

                  <form
                    onSubmit={handleSendDm}
                    className="p-3 border-t border-stone-200/80 bg-white flex items-center gap-2"
                  >
                    <input
                      type="text"
                      value={msgInput}
                      onChange={(e) => setMsgInput(e.target.value)}
                      maxLength={500}
                      placeholder={`Message ${activePeer.alias} privately...`}
                      className="flex-1 px-4 py-2.5 bg-stone-100/80 focus:bg-white border border-transparent focus:border-amber-400 rounded-full text-xs sm:text-sm text-stone-900 outline-none transition-all"
                    />
                    <button
                      type="submit"
                      disabled={!msgInput.trim() || isSending}
                      className="p-2.5 rounded-full bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white transition-all cursor-pointer shrink-0"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
};
