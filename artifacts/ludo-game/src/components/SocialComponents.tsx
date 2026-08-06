import React from 'react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock3,
  MessageCircle,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

/**
 * The social surfaces deliberately use the same midnight / glass language as
 * HomeScreen. Data is kept outside this module so these components can be
 * backed by any query, socket, or local store.
 */

export type SocialRelationshipStatus =
  | 'none'
  | 'request-sent'
  | 'friends'
  | 'incoming-request'
  | 'declined';

export interface SocialPlayerProfile {
  id: string;
  playerId: string;
  username: string;
  avatarUrl?: string | null;
  level: number;
  rank: string;
  isOnline: boolean;
  relationshipStatus: SocialRelationshipStatus;
  canMessage?: boolean;
  messagePermissionReason?: string | null;
}

export interface SocialFriend {
  id: string;
  username: string;
  avatarUrl?: string | null;
  isOnline: boolean;
  level: number;
  rank: string;
  lastSeenLabel?: string;
}

export interface SocialRequest {
  id: string;
  player: SocialPlayerProfile;
  receivedAtLabel?: string;
}

export type SocialSentRequest = SocialRequest;

export interface SocialChat {
  id: string;
  participant: SocialPlayerProfile;
  lastMessage?: string;
  updatedAtLabel?: string;
  unreadCount: number;
}

export interface PlayerProfileScreenProps {
  profile: SocialPlayerProfile;
  onBack?: () => void;
  onAddFriend: (profile: SocialPlayerProfile) => void;
  onAcceptRequest: (profile: SocialPlayerProfile) => void;
  onDeclineRequest: (profile: SocialPlayerProfile) => void;
  onMessage: (profile: SocialPlayerProfile) => void;
  canMessage?: boolean;
  initialMessagePermissionHint?: string;
  actionPending?: boolean;
}

export interface FriendsScreenProps {
  friends: SocialFriend[];
  incomingRequests: SocialRequest[];
  sentRequests?: SocialSentRequest[];
  searchQuery: string;
  searchResults: SocialPlayerProfile[];
  onSearchChange: (query: string) => void;
  onSearchSubmit?: () => void;
  onBack?: () => void;
  onOpenProfile: (profile: SocialPlayerProfile) => void;
  onMessageFriend: (friend: SocialFriend) => void;
  onAcceptRequest: (request: SocialRequest) => void;
  onDeclineRequest: (request: SocialRequest) => void;
  onCancelRequest?: (request: SocialSentRequest) => void;
  isLoading?: boolean;
  isSearchLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

const panelClass =
  'rounded-2xl border border-white/[0.1] bg-[#11152a]/65 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.25)]';
const smallLabelClass = 'text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40';

function initials(username: string): string {
  const parts = username.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.slice(0, 2) ?? 'PL').toUpperCase();
}

function Avatar({
  username,
  avatarUrl,
  isOnline,
  size = 'md',
}: {
  username: string;
  avatarUrl?: string | null;
  isOnline?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'h-10 w-10 text-xs',
    md: 'h-14 w-14 text-sm',
    lg: 'h-24 w-24 text-2xl',
  };

  return (
    <div className={`relative shrink-0 ${sizeClasses[size]}`}>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={`${username} avatar`}
          data-testid={`img-avatar-${username}`}
          className="h-full w-full rounded-full border-2 border-white/15 object-cover"
        />
      ) : (
        <div
          data-testid={`avatar-fallback-${username}`}
          className="flex h-full w-full items-center justify-center rounded-full border-2 border-cyan-300/25 bg-gradient-to-br from-cyan-400/80 via-blue-600/80 to-indigo-900 text-center font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
        >
          {initials(username)}
        </div>
      )}
      {typeof isOnline === 'boolean' && (
        <span
          data-testid={`status-dot-${username}`}
          className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#11152a] ${
            isOnline ? 'bg-emerald-400' : 'bg-white/25'
          }`}
          aria-label={isOnline ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
}

function ScreenHeader({
  title,
  subtitle,
  onBack,
  count,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  count?: number;
}) {
  return (
    <header className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-4 sm:px-6">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          data-testid="button-social-back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white active:scale-95"
          aria-label="Go back"
        >
          <ArrowLeft size={17} />
        </button>
      ) : (
        <div className="h-9 w-9 shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-extrabold tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-xs text-white/45">{subtitle}</p>}
      </div>
      {typeof count === 'number' && (
        <span
          data-testid="text-social-count"
          className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-xs font-bold text-cyan-200"
        >
          {count}
        </span>
      )}
    </header>
  );
}

function ProfileStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3 py-3">
      <p className={smallLabelClass}>{label}</p>
      <p className="mt-1 text-sm font-extrabold text-white" data-testid={`text-stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        {value}
      </p>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled = false,
  testId,
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 px-4 text-sm font-extrabold text-white shadow-[0_8px_22px_rgba(32,145,214,0.2)] transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled = false,
  testId,
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] px-4 text-sm font-bold text-white/80 transition-all hover:bg-white/[0.12] hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

function RelationshipActions({
  profile,
  onAddFriend,
  onAcceptRequest,
  onDeclineRequest,
  actionPending,
}: Pick<
  PlayerProfileScreenProps,
  'profile' | 'onAddFriend' | 'onAcceptRequest' | 'onDeclineRequest' | 'actionPending'
>) {
  switch (profile.relationshipStatus) {
    case 'request-sent':
      return (
        <SecondaryButton onClick={() => undefined} disabled testId="button-request-sent" className="flex-1">
          <Clock3 size={16} />
          Request Sent
        </SecondaryButton>
      );
    case 'friends':
      return (
        <SecondaryButton onClick={() => undefined} disabled testId="button-friends" className="flex-1 border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
          <CheckCircle2 size={16} />
          Friends
        </SecondaryButton>
      );
    case 'incoming-request':
      return (
        <div className="flex w-full gap-2">
          <PrimaryButton
            onClick={() => onAcceptRequest(profile)}
            disabled={actionPending}
            testId="button-accept-friend-request"
            className="flex-1"
          >
            <Check size={16} />
            Accept
          </PrimaryButton>
          <SecondaryButton
            onClick={() => onDeclineRequest(profile)}
            disabled={actionPending}
            testId="button-decline-friend-request"
            className="flex-1"
          >
            <X size={16} />
            Decline
          </SecondaryButton>
        </div>
      );
    case 'declined':
      return (
        <SecondaryButton onClick={() => undefined} disabled testId="button-request-declined" className="flex-1 text-red-200/70">
          Request Declined
        </SecondaryButton>
      );
    case 'none':
    default:
      return (
        <PrimaryButton
          onClick={() => onAddFriend(profile)}
          disabled={actionPending}
          testId="button-add-friend"
          className="flex-1"
        >
          <UserPlus size={16} />
          Add Friend
        </PrimaryButton>
      );
  }
}

export function PlayerProfileScreen({
  profile,
  onBack,
  onAddFriend,
  onAcceptRequest,
  onDeclineRequest,
  onMessage,
  canMessage,
  initialMessagePermissionHint = 'You can send one opening message. Continue after a reply or when the friend request is accepted.',
  actionPending = false,
}: PlayerProfileScreenProps) {
  const isMessageAllowed = canMessage ?? profile.canMessage ?? profile.relationshipStatus === 'friends';
  const relationshipLabel =
    profile.relationshipStatus === 'friends'
      ? 'In your friends list'
      : profile.relationshipStatus === 'request-sent'
        ? 'Friend request pending'
        : profile.relationshipStatus === 'incoming-request'
          ? 'Wants to be your friend'
          : profile.relationshipStatus === 'declined'
            ? 'Request declined'
          : 'Not connected yet';

  return (
    <main className="min-h-[100dvh] w-full bg-transparent text-white">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col">
        <ScreenHeader title="Player profile" onBack={onBack} />
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          <section className={`${panelClass} relative overflow-hidden p-5`}>
            <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-cyan-400/10 blur-3xl" />
            <div className="relative flex flex-col items-center text-center">
              <Avatar username={profile.username} avatarUrl={profile.avatarUrl} isOnline={profile.isOnline} size="lg" />
              <div className="mt-4 flex items-center gap-2">
                <h2 className="text-2xl font-extrabold tracking-tight text-white" data-testid="text-profile-username">
                  {profile.username}
                </h2>
                {profile.isOnline && <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">Online</span>}
              </div>
              <p className="mt-1 font-mono text-xs text-white/40" data-testid="text-profile-player-id">
                ID {profile.playerId}
              </p>
              <p className="mt-3 text-xs text-white/50" data-testid="status-profile-relationship">
                {relationshipLabel}
              </p>
            </div>
            <div className="relative mt-5 grid grid-cols-2 gap-2">
              <ProfileStat label="Level" value={profile.level} />
              <ProfileStat label="Rank" value={profile.rank} />
            </div>
          </section>

          <section className={`${panelClass} p-4`}>
            <p className={smallLabelClass}>Connection</p>
            <div className="mt-3 flex gap-2">
              <RelationshipActions
                profile={profile}
                onAddFriend={onAddFriend}
                onAcceptRequest={onAcceptRequest}
                onDeclineRequest={onDeclineRequest}
                actionPending={actionPending}
              />
              <SecondaryButton
                onClick={() => onMessage(profile)}
                disabled={!isMessageAllowed || actionPending}
                testId="button-message-player"
                className="min-w-[116px]"
              >
                <MessageCircle size={16} />
                Message
              </SecondaryButton>
            </div>
            {!isMessageAllowed && (
              <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-white/40" data-testid="text-message-permission-hint">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-cyan-300/70" />
                {initialMessagePermissionHint}
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function SearchBar({
  value,
  onChange,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}) {
  return (
    <form
      className="relative"
      onSubmit={event => {
        event.preventDefault();
        onSubmit?.();
      }}
    >
      <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        data-testid="input-search-friends"
        aria-label="Search players"
        placeholder="Search players by username or ID"
        className="h-12 w-full rounded-xl border border-white/10 bg-[#11152a]/70 pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/30 transition-colors focus:border-cyan-300/40 focus:bg-[#151b36]"
      />
    </form>
  );
}

function FriendRow({
  friend,
  onOpenProfile,
  onMessage,
}: {
  friend: SocialFriend;
  onOpenProfile: (friend: SocialFriend) => void;
  onMessage: (friend: SocialFriend) => void;
}) {
  const profileForOpen: SocialPlayerProfile = {
    id: friend.id,
    playerId: friend.id,
    username: friend.username,
    avatarUrl: friend.avatarUrl,
    level: friend.level,
    rank: friend.rank,
    isOnline: friend.isOnline,
    relationshipStatus: 'friends',
  };

  return (
    <div className={`${panelClass} flex items-center gap-3 p-3`} data-testid={`card-friend-${friend.id}`}>
      <button type="button" onClick={() => onOpenProfile(profileForOpen)} data-testid={`button-open-friend-${friend.id}`} className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-cyan-300/50">
        <Avatar username={friend.username} avatarUrl={friend.avatarUrl} isOnline={friend.isOnline} size="sm" />
      </button>
      <button type="button" onClick={() => onOpenProfile(profileForOpen)} data-testid={`button-friend-name-${friend.id}`} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-bold text-white">{friend.username}</span>
        <span className="mt-0.5 block truncate text-[11px] text-white/45">
          {friend.isOnline ? 'Online now' : friend.lastSeenLabel ?? 'Offline'} <span className="text-white/20">·</span> Lvl {friend.level} · {friend.rank}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onMessage(friend)}
        data-testid={`button-message-friend-${friend.id}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 transition-colors hover:bg-cyan-300/20 active:scale-95"
        aria-label={`Message ${friend.username}`}
      >
        <MessageCircle size={16} />
      </button>
      <button
        type="button"
        onClick={() => onOpenProfile(profileForOpen)}
        data-testid={`button-friend-menu-${friend.id}`}
        className="flex h-8 w-6 shrink-0 items-center justify-center text-white/35 transition-colors hover:text-white"
        aria-label={`More options for ${friend.username}`}
      >
        <MoreHorizontal size={17} />
      </button>
    </div>
  );
}

function RequestRow({
  request,
  onAccept,
  onDecline,
  actionPending,
}: {
  request: SocialRequest;
  onAccept: (request: SocialRequest) => void;
  onDecline: (request: SocialRequest) => void;
  actionPending: boolean;
}) {
  return (
    <div className={`${panelClass} flex items-center gap-3 p-3`} data-testid={`card-request-${request.id}`}>
      <Avatar username={request.player.username} avatarUrl={request.player.avatarUrl} isOnline={request.player.isOnline} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white" data-testid={`text-request-user-${request.id}`}>{request.player.username}</p>
        <p className="mt-0.5 truncate text-[11px] text-white/45">
          Level {request.player.level} <span className="text-white/20">·</span> {request.player.rank}
          {request.receivedAtLabel && <span className="text-white/25"> · {request.receivedAtLabel}</span>}
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={() => onAccept(request)}
          disabled={actionPending}
          data-testid={`button-accept-request-${request.id}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400 text-[#07101f] transition-colors hover:bg-cyan-300 active:scale-95 disabled:opacity-50"
          aria-label={`Accept ${request.player.username}`}
        >
          <Check size={17} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          onClick={() => onDecline(request)}
          disabled={actionPending}
          data-testid={`button-decline-request-${request.id}`}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.07] text-white/65 transition-colors hover:bg-red-400/10 hover:text-red-200 active:scale-95 disabled:opacity-50"
          aria-label={`Decline ${request.player.username}`}
        >
          <X size={17} />
        </button>
      </div>
    </div>
  );
}

function SearchResultRow({
  profile,
  onOpenProfile,
}: {
  profile: SocialPlayerProfile;
  onOpenProfile: (profile: SocialPlayerProfile) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenProfile(profile)}
      data-testid={`button-search-result-${profile.id}`}
      className={`${panelClass} flex w-full items-center gap-3 p-3 text-left transition-colors hover:border-cyan-300/25 hover:bg-[#151b36] active:scale-[0.99]`}
    >
      <Avatar username={profile.username} avatarUrl={profile.avatarUrl} isOnline={profile.isOnline} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-white">{profile.username}</span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-white/40">ID {profile.playerId} <span className="font-sans text-white/20">·</span> Lvl {profile.level} · {profile.rank}</span>
      </span>
      <span className="text-[11px] font-bold text-cyan-200">View</span>
    </button>
  );
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-sm font-extrabold text-white">{title}</h2>
      {typeof count === 'number' && <span className="text-xs font-semibold text-white/35">{count}</span>}
    </div>
  );
}

function EmptyState({ title, detail, icon }: { title: string; detail: string; icon: React.ReactNode }) {
  return (
    <div className={`${panelClass} flex flex-col items-center px-6 py-8 text-center`} data-testid="empty-social-state">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">{icon}</div>
      <p className="mt-3 text-sm font-bold text-white/80">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-white/40">{detail}</p>
    </div>
  );
}

function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2" data-testid="loading-social-rows">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`${panelClass} flex items-center gap-3 p-3`}>
          <div className="h-10 w-10 animate-pulse rounded-full bg-white/10" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/5 animate-pulse rounded-full bg-white/10" />
            <div className="h-2.5 w-3/5 animate-pulse rounded-full bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FriendsScreen({
  friends,
  incomingRequests,
  searchQuery,
  searchResults,
  onSearchChange,
  onSearchSubmit,
  onBack,
  onOpenProfile,
  onMessageFriend,
  onAcceptRequest,
  onDeclineRequest,
  sentRequests = [],
  onCancelRequest,
  isLoading = false,
  isSearchLoading = false,
  error = null,
  onRetry,
}: FriendsScreenProps) {
  const isSearching = searchQuery.trim().length > 0;

  return (
    <main className="min-h-[100dvh] w-full bg-transparent text-white">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col">
        <ScreenHeader title="Friends" subtitle="Build your circle for the next match" onBack={onBack} count={friends.length} />
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
          <SearchBar value={searchQuery} onChange={onSearchChange} onSubmit={onSearchSubmit} />

          {error && (
            <div className="rounded-2xl border border-red-300/20 bg-red-400/10 p-4" data-testid="status-social-error">
              <p className="text-sm font-bold text-red-100">Could not load your social list</p>
              <p className="mt-1 text-xs text-red-100/65">{error}</p>
              {onRetry && (
                <button type="button" onClick={onRetry} data-testid="button-retry-social" className="mt-3 text-xs font-bold text-red-100 underline underline-offset-4">
                  Try again
                </button>
              )}
            </div>
          )}

          {isSearching ? (
            <section className="space-y-3">
              <SectionTitle title="Search results" count={searchResults.length} />
              {isSearchLoading ? (
                <LoadingRows count={2} />
              ) : searchResults.length > 0 ? (
                <div className="space-y-2">
                  {searchResults.map(profile => <SearchResultRow key={profile.id} profile={profile} onOpenProfile={onOpenProfile} />)}
                </div>
              ) : (
                <EmptyState title="No players found" detail="Try a different username or player ID." icon={<Search size={19} />} />
              )}
            </section>
          ) : (
            <>
              <section className="space-y-3">
                <SectionTitle title="Incoming requests" count={incomingRequests.length} />
                {incomingRequests.length > 0 ? (
                  <div className="space-y-2">
                    {incomingRequests.map(request => (
                      <RequestRow
                        key={request.id}
                        request={request}
                        onAccept={onAcceptRequest}
                        onDecline={onDeclineRequest}
                        actionPending={isLoading}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-4 py-5 text-center" data-testid="empty-incoming-requests">
                    <p className="text-xs font-semibold text-white/45">No pending requests</p>
                  </div>
                )}
              </section>

              {sentRequests && sentRequests.length > 0 && (
                <section className="space-y-3">
                  <SectionTitle title="Sent requests" count={sentRequests.length} />
                  <div className="space-y-2">
                    {sentRequests.map(request => (
                      <div key={request.id} className={`${panelClass} flex items-center gap-3 p-3`} data-testid={`card-sent-request-${request.id}`}>
                        <Avatar username={request.player.username} avatarUrl={request.player.avatarUrl} isOnline={request.player.isOnline} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{request.player.username}</p>
                          <p className="mt-0.5 text-[11px] text-white/45">Request pending</p>
                        </div>
                        {onCancelRequest && (
                          <button
                            type="button"
                            onClick={() => onCancelRequest(request)}
                            disabled={isLoading}
                            data-testid={`button-cancel-request-${request.id}`}
                            className="rounded-lg border border-white/10 bg-white/[0.07] px-2.5 py-2 text-[11px] font-bold text-white/65 hover:bg-red-400/10 hover:text-red-200 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="space-y-3">
                <SectionTitle title="Your friends" count={friends.length} />
                {isLoading ? (
                  <LoadingRows />
                ) : friends.length > 0 ? (
                  <div className="space-y-2">
                    {friends.map(friend => (
                      <FriendRow key={friend.id} friend={friend} onOpenProfile={onOpenProfile} onMessage={onMessageFriend} />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="Your circle is quiet" detail="Search for a player above and send your first friend request." icon={<Users size={19} />} />
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
