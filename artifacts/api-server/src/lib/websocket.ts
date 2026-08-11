/**
 * websocket.ts
 * Socket.IO real-time multiplayer server.
 * Manages in-memory game state and broadcasts events to room members.
 */

import { Server as HttpServer } from "http";
import { Server as SocketServer, type Socket } from "socket.io";
import { verifyToken } from "@clerk/express";
import { db } from "@workspace/db";
import {
  chatMessagesTable,
  friendshipsTable,
  gameRoomsTable,
  ludoGamesTable,
  notificationsTable,
  playerCareerStatsTable,
  playersTable,
  tournamentsTable,
} from "@workspace/db";
import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  createInitialState,
  rollDice,
  applyDiceRoll,
  applyMove,
  getValidMoves,
  type LudoGameState,
  type PlayerColor,
} from "./ludo.engine";
import { logger } from "./logger";
import {
  createSocialNotification,
  getDirectMessagePermission,
  getPlayerDisplayName,
} from "./social";

let socialIo: SocketServer | null = null;

export function emitSocialToUser(
  userId: string,
  event: string,
  payload: unknown,
): void {
  socialIo?.to(`user:${userId}`).emit(event, payload);
}

/* ── In-memory state ───────────────────────────────────────────────────────── */

// roomId → LudoGameState
const activeGames = new Map<string, LudoGameState>();
const gameStartLocks = new Map<string, Promise<LudoGameState | null>>();

// socketId → { clerkUserId, displayName, roomId }
const socketMeta = new Map<string, { clerkUserId: string; displayName: string; roomId: string }>();
const connectedUserSockets = new Map<string, number>();
const disconnectedSockets = new Set<string>();
const pendingRoomDisconnects = new Map<string, NodeJS.Timeout>();
const disconnectedGamePlayers = new Set<string>();
const RECONNECT_GRACE_MS = 45_000;
const AUTO_TURN_ACTION_MS = 15_000;
const autoTurnActionTimers = new Map<string, NodeJS.Timeout>();
const autoTurnActionMeta = new Map<
  string,
  { playerId: string; turnNumber: number; phase: LudoGameState["phase"]; deadlineAt: number }
>();

// Live tournament room → connected spectator socket IDs. This is intentionally
// in-memory presence state; the tournament schedule and match state remain
// server-owned elsewhere, while this map only answers "who is watching now?"
const spectatorRoomMembers = new Map<string, Set<string>>();
const socketSpectatorRooms = new Map<string, Set<string>>();

export function getSpectatorCount(roomId: string): number {
  return spectatorRoomMembers.get(roomId)?.size ?? 0;
}

function emitSpectatorCount(io: SocketServer, roomId: string): void {
  const payload = {
    roomId,
    count: getSpectatorCount(roomId),
  };
  // Spectators use their namespaced room; a real player game can use the
  // canonical match room. Broadcasting to both keeps both audiences in sync
  // without placing read-only spectators into a player-control room.
  io.to(`spectator:${roomId}`).emit("spectator:count", payload);
  io.to(roomId).emit("spectator:count", payload);
}

function addSpectator(socket: Socket, io: SocketServer, roomId: string): void {
  const members = spectatorRoomMembers.get(roomId) ?? new Set<string>();
  members.add(socket.id);
  spectatorRoomMembers.set(roomId, members);

  const rooms = socketSpectatorRooms.get(socket.id) ?? new Set<string>();
  rooms.add(roomId);
  socketSpectatorRooms.set(socket.id, rooms);
  socket.join(`spectator:${roomId}`);
  emitSpectatorCount(io, roomId);
}

/**
 * A spectator room is not a free-form Socket.IO room. It must identify a
 * running tournament's configured R128/R32 match, and that match must
 * currently be live. This keeps group-stage, later-round, and guessed room
 * identifiers out of the live feed even when a client bypasses the UI.
 */
async function isAuthorizedLiveSpectatorRoom(roomId: string): Promise<boolean> {
  const separator = roomId.indexOf(":");
  if (separator <= 0 || separator === roomId.length - 1) return false;

  const tournamentId = roomId.slice(0, separator);
  const matchId = roomId.slice(separator + 1);
  const [tournament] = await db
    .select({
      id: tournamentsTable.id,
      enabledStages: tournamentsTable.enabledStages,
      knockoutSchedule: tournamentsTable.knockoutSchedule,
    })
    .from(tournamentsTable)
    .where(and(eq(tournamentsTable.id, tournamentId), eq(tournamentsTable.status, "running")))
    .limit(1);
  if (!tournament || !Array.isArray(tournament.enabledStages)) return false;

  const liveStages = new Set(["round-of-128", "round-of-32"]);
  const configuredStages = tournament.enabledStages.filter(
    (stage): stage is string => typeof stage === "string" && liveStages.has(stage),
  );
  if (configuredStages.length === 0 || !Array.isArray(tournament.knockoutSchedule)) return false;

  const schedule = tournament.knockoutSchedule
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .filter(
      (item) =>
        typeof item.id === "string" &&
        typeof item.stage === "string" &&
        configuredStages.includes(item.stage),
    )
    .map((item) => ({
      id: String(item.id),
      stage: String(item.stage),
      matchNumber: typeof item.matchNumber === "number" ? item.matchNumber : 0,
      startsAt: typeof item.startsAt === "string" ? item.startsAt : "",
    }));
  const match = schedule.find((item) => item.id === matchId);
  if (!match || !Number.isInteger(match.matchNumber)) return false;

  const startsAt = new Date(match.startsAt).getTime();
  if (!Number.isFinite(startsAt) || startsAt > Date.now()) return false;
  const nextMatch = schedule
    .filter((item) => item.stage === match.stage && item.matchNumber > match.matchNumber)
    .sort((a, b) => a.matchNumber - b.matchNumber)[0];
  return !nextMatch || new Date(nextMatch.startsAt).getTime() > Date.now();
}

function removeSpectator(socket: Socket, io: SocketServer, roomId: string): void {
  const members = spectatorRoomMembers.get(roomId);
  if (!members) return;

  members.delete(socket.id);
  if (members.size === 0) spectatorRoomMembers.delete(roomId);
  socket.leave(`spectator:${roomId}`);

  const rooms = socketSpectatorRooms.get(socket.id);
  rooms?.delete(roomId);
  if (rooms && rooms.size === 0) socketSpectatorRooms.delete(socket.id);
  emitSpectatorCount(io, roomId);
}

function removeAllSpectatorRooms(socket: Socket, io: SocketServer): void {
  const rooms = [...(socketSpectatorRooms.get(socket.id) ?? [])];
  for (const roomId of rooms) removeSpectator(socket, io, roomId);
}

/* ── Bootstrap ─────────────────────────────────────────────────────────────── */

export function initWebSocket(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/api/ws/socket.io",
  });
  socialIo = io;

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== "string" || !token) {
      next(new Error("Authenticated session required"));
      return;
    }

    try {
      const claims = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      if (!claims.sub) {
        next(new Error("Authenticated user not found"));
        return;
      }
      socket.data.clerkUserId = claims.sub;
      next();
    } catch (err) {
      logger.warn({ err }, "Rejected unauthenticated WebSocket connection");
      next(new Error("Invalid authenticated session"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const authenticatedUserId = socket.data.clerkUserId as string;
    socket.join(`user:${authenticatedUserId}`);
    connectedUserSockets.set(
      authenticatedUserId,
      (connectedUserSockets.get(authenticatedUserId) ?? 0) + 1,
    );
    void db
      .update(playersTable)
      .set({ isOnline: true, lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(playersTable.clerkUserId, authenticatedUserId));
    void (async () => {
      const friendships = await db
        .select()
        .from(friendshipsTable)
        .where(
          and(
            eq(friendshipsTable.status, "accepted"),
            or(
              eq(friendshipsTable.requesterId, authenticatedUserId),
              eq(friendshipsTable.recipientId, authenticatedUserId),
            ),
          ),
        );
      for (const friendship of friendships) {
        const friendId =
          friendship.requesterId === authenticatedUserId
            ? friendship.recipientId
            : friendship.requesterId;
        emitSocialToUser(friendId, "social:presence", {
          userId: authenticatedUserId,
          isOnline: true,
          lastSeenAt: new Date().toISOString(),
        });
      }

      // A newly connected client also needs the current presence snapshot of
      // friends who were already online. Without this, the friends list,
      // search results, and open profiles remain stale until a later
      // connect/disconnect event occurs.
      const friendIds = friendships.map((friendship) =>
        friendship.requesterId === authenticatedUserId
          ? friendship.recipientId
          : friendship.requesterId,
      );
      if (friendIds.length > 0) {
        const friendCondition = friendIds.reduce<ReturnType<typeof eq> | ReturnType<typeof or>>(
          (condition, friendId, index) =>
            index === 0
              ? eq(playersTable.clerkUserId, friendId)
              : or(condition as any, eq(playersTable.clerkUserId, friendId))!,
          eq(playersTable.clerkUserId, friendIds[0]),
        );
        const friendPlayers = await db
          .select({
            clerkUserId: playersTable.clerkUserId,
            isOnline: playersTable.isOnline,
            lastSeenAt: playersTable.lastSeenAt,
          })
          .from(playersTable)
          .where(friendCondition as any);
        for (const friend of friendPlayers) {
          emitSocialToUser(authenticatedUserId, "social:presence", {
            userId: friend.clerkUserId,
            isOnline: Boolean(friend.isOnline),
            lastSeenAt: friend.lastSeenAt?.toISOString(),
          });
        }
      }
    })().catch((err) => logger.warn({ err }, "Failed to broadcast online presence"));
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on(
      "social:dm_send",
      async (
        payload: { recipientId?: string; content?: string },
        ack?: (response: { ok?: boolean; error?: string }) => void,
      ) => {
        const senderId = socket.data.clerkUserId as string | undefined;
        const recipientId = payload?.recipientId;
        const content = payload?.content?.trim();
        if (!senderId || !recipientId || senderId === recipientId) {
          const message = "Invalid recipient";
          socket.emit("social:error", { message });
          ack?.({ error: message });
          return;
        }
        if (!content || content.length > 1000) {
          const message = "Content must be 1–1000 characters";
          socket.emit("social:error", { message });
          ack?.({ error: message });
          return;
        }

        try {
          const permission = await getDirectMessagePermission(
            senderId,
            recipientId,
          );
          if (!permission.allowed) {
            const message = permission.reason ?? "Message is not allowed";
            socket.emit("social:error", { message });
            ack?.({ error: message });
            return;
          }

          const sender = await getPlayerDisplayName(senderId);
          const [message] = await db
            .insert(chatMessagesTable)
            .values({
              senderId,
              senderName: sender.displayName,
              channel: "direct",
              recipientId,
              content,
            })
            .returning();
          const notification = await createSocialNotification({
            clerkUserId: recipientId,
            type: "chat_message",
            title: `Message from ${sender.displayName}`,
            body: content.slice(0, 120),
            imageUrl: sender.avatarUrl,
            data: { messageId: message.id, senderId },
          });
          emitSocialToUser(recipientId, "social:dm_received", {
            message,
            notification,
          });
          socket.emit("social:dm_sent", { message });
          ack?.({ ok: true });
        } catch (err) {
          logger.error({ err, senderId, recipientId }, "social:dm_send error");
          const message = "Message could not be sent";
          socket.emit("social:error", { message });
          ack?.({ error: message });
        }
      },
    );

    socket.on(
      "social:dm_read",
      async (payload: { otherUserId?: string }) => {
        const userId = socket.data.clerkUserId as string | undefined;
        const otherUserId = payload?.otherUserId;
        if (!userId || !otherUserId) return;
        await db
          .update(notificationsTable)
          .set({ isRead: true })
          .where(
            and(
              eq(notificationsTable.clerkUserId, userId),
              eq(notificationsTable.type, "chat_message"),
              eq(notificationsTable.isRead, false),
              sql`${notificationsTable.data}->>'senderId' = ${otherUserId}`,
            ),
          );
        socket.emit("social:dm_read_ack", { otherUserId });
      },
    );

    /* ── Tournament spectator: join / leave ─────────────────────────────── */
    socket.on(
      "spectator:join",
      (payload: { roomId?: string }) => {
        const roomId = payload?.roomId?.trim();
        if (!roomId || roomId.length > 200) {
          socket.emit("social:error", { message: "Invalid live match room" });
          return;
        }

         void isAuthorizedLiveSpectatorRoom(roomId).then((authorized) => {
           if (!authorized) {
             socket.emit("social:error", {
               message: "শুধু বর্তমানে চলমান R128/R32 ম্যাচ দেখা যাবে।",
             });
             return;
           }

           addSpectator(socket, io, roomId);
           socket.emit("spectator:joined", {
             roomId,
             count: getSpectatorCount(roomId),
           });

           // If this identifier is also an active game room, spectators receive
           // the current authoritative snapshot without gaining move permissions.
           const currentGame = activeGames.get(roomId);
           if (currentGame) {
             socket.emit("spectator:game_state", { roomId, game: currentGame });
           }
         }).catch((err) => {
           logger.warn({ err, roomId }, "Failed to authorize spectator room");
           socket.emit("social:error", { message: "লাইভ ম্যাচ যাচাই করা যায়নি।" });
         });
      },
    );

    socket.on(
      "spectator:leave",
      (payload: { roomId?: string }) => {
        const roomId = payload?.roomId?.trim();
        if (roomId) removeSpectator(socket, io, roomId);
      },
    );

    /* ── Room: join ─────────────────────────────────────────────────────── */
    socket.on(
      "room:join",
      async (payload: { roomId: string }) => {
        const { roomId } = payload;
        const clerkUserId = socket.data.clerkUserId as string | undefined;
        if (!clerkUserId) {
          socket.emit("error", { message: "Authenticated session required" });
          return;
        }

        try {
          const [room] = await db
            .select()
            .from(gameRoomsTable)
            .where(eq(gameRoomsTable.id, roomId))
            .limit(1);

          if (!room) {
            socket.emit("error", { message: "Room not found" });
            return;
          }

          const seats = (room.seats as Array<{
            clerkUserId: string;
            displayName: string;
          }>) ?? [];
          const seat = seats.find((candidate) => candidate.clerkUserId === clerkUserId);
          if (!seat) {
            socket.emit("error", { message: "You are not a member of this room" });
            return;
          }

          const reconnectKey = `${roomId}:${clerkUserId}`;
          const pending = pendingRoomDisconnects.get(reconnectKey);
          if (pending) {
            clearTimeout(pending);
            pendingRoomDisconnects.delete(reconnectKey);
          }
           clearAutoTurnActionForPlayer(roomId, clerkUserId, io);
          disconnectedGamePlayers.delete(reconnectKey);
          socket.join(roomId);
          socketMeta.set(socket.id, {
            clerkUserId,
            displayName: seat.displayName,
            roomId,
          });

          socket.to(roomId).emit("room:player_joined", {
            clerkUserId,
            displayName: seat.displayName,
          });
          io.to(roomId).emit("room:updated", { room });
           const resumedGame =
             activeGames.get(roomId) ??
             (room.status === "in_progress" ? await getOrStartGame(roomId) : null);
           socket.emit("room:joined", {
             room,
             game: resumedGame,
           });
           emitCurrentTurnDeadline(socket, roomId);
           scheduleAutoTurnAction(roomId, io);

          if (room.status === "waiting" && (room.seats as any[]).length >= room.maxPlayers) {
            const game = await getOrStartGame(roomId);
            if (game) io.to(roomId).emit("game:started", { game });
          }

          logger.info({ socketId: socket.id, roomId, clerkUserId }, "Player joined room");
        } catch (err) {
          logger.error({ err }, "room:join error");
          socket.emit("error", { message: "Failed to join room" });
        }
      },
    );

    /* ── Room: leave ────────────────────────────────────────────────────── */
    socket.on("room:leave", () => void handleDisconnect(socket, io, true));

    /* ── Game: start ────────────────────────────────────────────────────── */
    socket.on("game:start", async (payload: { roomId: string }) => {
      const { roomId } = payload;
      const meta = socketMeta.get(socket.id);
      if (!meta || meta.roomId !== roomId) {
        socket.emit("error", { message: "You are not in this room" });
        return;
      }
      try {
        const game = await getOrStartGame(roomId);
        if (!game) {
          socket.emit("error", { message: "Room is waiting for more players" });
          return;
        }
        io.to(roomId).emit("game:started", { game });
      } catch (err) {
        logger.error({ err }, "game:start error");
        socket.emit("error", { message: "Failed to start game" });
      }
    });

    /* ── Game: roll dice ────────────────────────────────────────────────── */
    socket.on("game:roll", async (payload: { roomId: string; clerkUserId: string }) => {
      const { roomId } = payload;
      const meta = socketMeta.get(socket.id);
      const clerkUserId = meta?.roomId === roomId ? meta.clerkUserId : undefined;
      if (!clerkUserId) {
        socket.emit("error", { message: "You are not in this room" });
        return;
      }
      const game = activeGames.get(roomId);
      if (!game) { socket.emit("error", { message: "No active game" }); return; }

      const currentPlayer = game.players[game.currentColorIndex];
      if (currentPlayer.clerkUserId !== clerkUserId) {
        socket.emit("error", { message: "Not your turn" });
        return;
      }
      if (game.phase !== "rolling") {
        socket.emit("error", { message: "Not in rolling phase" });
        return;
      }
      clearAutoTurnAction(roomId, io);

      const diceValue = rollDice(
        game.powerSixEnabled,
        game.powerSixCycleCount[currentPlayer.color] ?? -1,
      );
      const { state: newState, moves, event } = applyDiceRoll(game, diceValue);
      activeGames.set(roomId, newState);

      io.to(roomId).emit("game:dice_rolled", {
        diceValue,
        color: currentPlayer.color,
        moves,
        event,
        game: newState,
      });

      // If no moves, auto-advance was already done — broadcast updated state
      if (moves.length === 0) {
        io.to(roomId).emit("game:state", { game: newState });
      }

      await persistGameState(roomId, newState);
      scheduleAutoTurnAction(roomId, io);
    });

    /* ── Game: move token ───────────────────────────────────────────────── */
    socket.on(
      "game:move",
      async (payload: { roomId: string; clerkUserId: string; tokenIndex: number }) => {
        const { roomId, tokenIndex } = payload;
        const meta = socketMeta.get(socket.id);
        const clerkUserId = meta?.roomId === roomId ? meta.clerkUserId : undefined;
        if (!clerkUserId) {
          socket.emit("error", { message: "You are not in this room" });
          return;
        }
        const game = activeGames.get(roomId);
        if (!game) { socket.emit("error", { message: "No active game" }); return; }

        const currentPlayer = game.players[game.currentColorIndex];
        if (currentPlayer.clerkUserId !== clerkUserId) {
          socket.emit("error", { message: "Not your turn" });
          return;
        }
        if (game.phase !== "moving") {
          socket.emit("error", { message: "Dice must be rolled first" });
          return;
        }
        clearAutoTurnAction(roomId, io);

        try {
          const { state: newState, event, gameOver } = applyMove(game, tokenIndex);
          activeGames.set(roomId, newState);

          io.to(roomId).emit("game:moved", { event, game: newState });

          if (gameOver) {
            const finalized = await finalizeOnlineGame(roomId, newState);
            activeGames.delete(roomId);
            if (finalized) {
              io.to(roomId).emit("game:finished", {
                winnerId: newState.winnerId,
                winnerColor: newState.winnerColor,
                game: newState,
              });
            }
          } else {
            await persistGameState(roomId, newState);
          }
          scheduleAutoTurnAction(roomId, io);
        } catch (err) {
          logger.error({ err }, "game:move error");
          socket.emit("error", { message: "Invalid move" });
        }
      },
    );

    /* ── Chat: room message ─────────────────────────────────────────────── */
    socket.on(
      "chat:room",
      (payload: { roomId: string; senderId: string; senderName: string; content: string }) => {
        const { roomId, content } = payload;
        const meta = socketMeta.get(socket.id);
        if (!meta || meta.roomId !== roomId) {
          socket.emit("error", { message: "You are not in this room" });
          return;
        }
        if (!content?.trim()) return;
        io.to(roomId).emit("chat:room_message", {
          senderId: meta.clerkUserId,
          senderName: meta.displayName,
          content: content.slice(0, 500),
          timestamp: new Date().toISOString(),
        });
      },
    );

    /* ── Disconnect ─────────────────────────────────────────────────────── */
    socket.on("disconnect", () => void handleDisconnect(socket, io));
  });

  // Only forward real server-owned game snapshots. Do not manufacture a
  // timer-based board: a spectator must never be shown a fake match state.
  setInterval(() => {
    for (const roomId of spectatorRoomMembers.keys()) {
      const currentGame = activeGames.get(roomId);
      if (currentGame) {
        io.to(`spectator:${roomId}`).emit("spectator:game_state", {
          roomId,
          game: currentGame,
        });
      }
    }
  }, 1500);

  return io;
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */

async function persistGameState(roomId: string, state: LudoGameState): Promise<void> {
  try {
    await db
      .update(ludoGamesTable)
      .set({
        state: state as any,
        currentTurn: state.players[state.currentColorIndex].color,
        turnNumber: state.turnNumber,
        updatedAt: new Date(),
      })
      .where(eq(ludoGamesTable.roomId, roomId));
  } catch (err) {
    logger.error({ err }, "Failed to persist game state");
  }
}

/**
 * Finish a casual online match exactly once.
 *
 * Both the normal move handler and the disconnected-player auto-turn handler
 * can reach this function. The conditional ludo_games update is the
 * idempotency gate, so only the first caller updates career rows and publishes
 * the result.
 */
async function finalizeOnlineGame(
  roomId: string,
  state: LudoGameState,
): Promise<boolean> {
  const finishedAt = new Date();

  return db.transaction(async (tx) => {
    const [finishedGame] = await tx
      .update(ludoGamesTable)
      .set({
        state: state as any,
        currentTurn: state.winnerColor!,
        turnNumber: state.turnNumber,
        isFinished: true,
        winnerId: state.winnerId,
        winnerColor: state.winnerColor,
        updatedAt: finishedAt,
        finishedAt,
      })
      .where(
        and(
          eq(ludoGamesTable.roomId, roomId),
          eq(ludoGamesTable.isFinished, false),
        ),
      )
      .returning({ id: ludoGamesTable.id });

    if (!finishedGame) return false;

    await tx
      .update(gameRoomsTable)
      .set({ status: "finished", finishedAt, updatedAt: finishedAt })
      .where(eq(gameRoomsTable.id, roomId));

    for (const player of state.players) {
      const won = player.clerkUserId === state.winnerId;
      await tx
        .insert(playerCareerStatsTable)
        .values({
          clerkUserId: player.clerkUserId,
          displayName: player.displayName,
          onlineMatchesPlayed: 1,
          onlineWins: won ? 1 : 0,
          onlineLosses: won ? 0 : 1,
          lastPlayedAt: finishedAt,
        })
        .onConflictDoUpdate({
          target: playerCareerStatsTable.clerkUserId,
          set: {
            displayName: player.displayName,
            onlineMatchesPlayed: sql`${playerCareerStatsTable.onlineMatchesPlayed} + 1`,
            onlineWins: sql`${playerCareerStatsTable.onlineWins} + ${won ? 1 : 0}`,
            onlineLosses: sql`${playerCareerStatsTable.onlineLosses} + ${won ? 0 : 1}`,
            lastPlayedAt: finishedAt,
            updatedAt: finishedAt,
          },
        });
    }

    return true;
  });
}

async function handleDisconnect(
  socket: Socket,
  io: SocketServer,
  explicitLeave = false,
): Promise<void> {
  if (disconnectedSockets.has(socket.id)) return;
  disconnectedSockets.add(socket.id);

  // Spectator presence is independent from multiplayer seat metadata. Clean
  // it up first so a spectator-only socket cannot leave a stale count behind.
  // This must happen before the socketMeta guard below because viewers never
  // receive a player-room entry.
  removeAllSpectatorRooms(socket, io);

  const userId = socket.data.clerkUserId as string | undefined;
  if (userId) {
    const remaining = Math.max((connectedUserSockets.get(userId) ?? 1) - 1, 0);
    if (remaining === 0) {
      connectedUserSockets.delete(userId);
      await db
        .update(playersTable)
        .set({ isOnline: false, lastSeenAt: new Date(), updatedAt: new Date() })
        .where(eq(playersTable.clerkUserId, userId));
      const friendships = await db
        .select()
        .from(friendshipsTable)
        .where(
          and(
            eq(friendshipsTable.status, "accepted"),
            or(
              eq(friendshipsTable.requesterId, userId),
              eq(friendshipsTable.recipientId, userId),
            ),
          ),
        );
      for (const friendship of friendships) {
        const friendId =
          friendship.requesterId === userId
            ? friendship.recipientId
            : friendship.requesterId;
        emitSocialToUser(friendId, "social:presence", {
          userId,
          isOnline: false,
          lastSeenAt: new Date().toISOString(),
        });
      }
    } else {
      connectedUserSockets.set(userId, remaining);
    }
  }
  const meta = socketMeta.get(socket.id);
  if (!meta) return;

  // Delete the metadata first because explicit room:leave is followed by the
  // socket disconnect event. This makes cleanup idempotent.
  socketMeta.delete(socket.id);
  // Spectator-only connections do not have player room metadata.
  if (!meta) return;
  logger.info({ socketId: socket.id, ...meta }, "Socket disconnected");

  if (!explicitLeave) {
    const reconnectKey = `${meta.roomId}:${meta.clerkUserId}`;
    disconnectedGamePlayers.add(reconnectKey);
    const pending = setTimeout(() => {
      pendingRoomDisconnects.delete(reconnectKey);
      void handleReconnectGraceExpiry(meta, io);
    }, RECONNECT_GRACE_MS);
    pendingRoomDisconnects.set(reconnectKey, pending);
    io.to(meta.roomId).emit("room:player_disconnected", {
      clerkUserId: meta.clerkUserId,
      displayName: meta.displayName,
      graceSeconds: RECONNECT_GRACE_MS / 1000,
    });
    scheduleAutoTurnAction(meta.roomId, io);
    return;
  }

  const reconnectKey = `${meta.roomId}:${meta.clerkUserId}`;
  const pending = pendingRoomDisconnects.get(reconnectKey);
  if (pending) clearTimeout(pending);
  pendingRoomDisconnects.delete(reconnectKey);
  disconnectedGamePlayers.delete(reconnectKey);
  await finalizeRoomDisconnect(meta, io);
}

async function finalizeRoomDisconnect(
  meta: { clerkUserId: string; displayName: string; roomId: string },
  io: SocketServer,
): Promise<void> {
  clearAutoTurnAction(meta.roomId, io);
  io.to(meta.roomId).emit("room:player_left", {
    clerkUserId: meta.clerkUserId,
    displayName: meta.displayName,
  });

  // A waiting room must not keep seats for disconnected players. Otherwise a
  // later real player can be matched into an abandoned room and the server
  // starts a game with a ghost seat.
  try {
    const [room] = await db
      .select()
      .from(gameRoomsTable)
      .where(eq(gameRoomsTable.id, meta.roomId))
      .limit(1);
    if (!room || room.status !== "waiting") return;

    const seats = (room.seats as any[]) ?? [];
    const remainingSeats = seats.filter((seat) => seat.clerkUserId !== meta.clerkUserId);
    if (remainingSeats.length === seats.length) return;

    const newStatus =
      room.creatorId === meta.clerkUserId && remainingSeats.length === 0
        ? "cancelled"
        : "waiting";
    const [updatedRoom] = await db
      .update(gameRoomsTable)
      .set({
        seats: remainingSeats as any,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(gameRoomsTable.id, meta.roomId))
      .returning();
    io.to(meta.roomId).emit("room:updated", { room: updatedRoom });
  } catch (err) {
    logger.error({ err, roomId: meta.roomId }, "Failed to clean up disconnected room seat");
  }
}

async function handleReconnectGraceExpiry(
  meta: { clerkUserId: string; displayName: string; roomId: string },
  io: SocketServer,
): Promise<void> {
  const reconnectKey = `${meta.roomId}:${meta.clerkUserId}`;
  if (!disconnectedGamePlayers.has(reconnectKey)) return;

  const game = activeGames.get(meta.roomId);
  if (game && game.phase !== "finished") {
    io.to(meta.roomId).emit("room:player_away", {
      clerkUserId: meta.clerkUserId,
      displayName: meta.displayName,
      canRejoinUntilGameEnds: true,
    });
    scheduleAutoTurnAction(meta.roomId, io);
    return;
  }

  // Waiting rooms still clean up abandoned seats after the grace period.
  disconnectedGamePlayers.delete(reconnectKey);
  await finalizeRoomDisconnect(meta, io);
}

function clearAutoTurnAction(roomId: string, io?: SocketServer): void {
  const timer = autoTurnActionTimers.get(roomId);
  if (timer) clearTimeout(timer);
  const hadDeadline = autoTurnActionMeta.delete(roomId);
  autoTurnActionTimers.delete(roomId);
  if (hadDeadline && io) {
    io.to(roomId).emit("game:turn_deadline", { deadlineAt: null });
  }
}

function clearAutoTurnActionForPlayer(
  roomId: string,
  playerId: string,
  io: SocketServer,
): void {
  if (autoTurnActionMeta.get(roomId)?.playerId === playerId) {
    clearAutoTurnAction(roomId, io);
  }
}

function emitCurrentTurnDeadline(socket: Socket, roomId: string): void {
  const deadline = autoTurnActionMeta.get(roomId);
  if (!deadline) {
    socket.emit("game:turn_deadline", { deadlineAt: null });
    return;
  }
  socket.emit("game:turn_deadline", {
    clerkUserId: deadline.playerId,
    phase: deadline.phase,
    deadlineAt: deadline.deadlineAt,
    seconds: AUTO_TURN_ACTION_MS / 1000,
  });
}

function scheduleAutoTurnAction(roomId: string, io: SocketServer): void {
  const game = activeGames.get(roomId);
  if (!game || game.phase === "finished") {
    clearAutoTurnAction(roomId, io);
    return;
  }

  const currentPlayer = game.players[game.currentColorIndex];
  const reconnectKey = `${roomId}:${currentPlayer.clerkUserId}`;
  if (!disconnectedGamePlayers.has(reconnectKey)) {
    clearAutoTurnAction(roomId, io);
    return;
  }

  const existing = autoTurnActionMeta.get(roomId);
  if (
    existing &&
    existing.playerId === currentPlayer.clerkUserId &&
    existing.turnNumber === game.turnNumber &&
    existing.phase === game.phase
  ) {
    return;
  }

  clearAutoTurnAction(roomId, io);
  const deadlineAt = Date.now() + AUTO_TURN_ACTION_MS;
  const meta = {
    playerId: currentPlayer.clerkUserId,
    turnNumber: game.turnNumber,
    phase: game.phase,
    deadlineAt,
  };
  autoTurnActionMeta.set(roomId, meta);
  io.to(roomId).emit("game:turn_deadline", {
    clerkUserId: currentPlayer.clerkUserId,
    displayName: currentPlayer.displayName,
    phase: game.phase,
    deadlineAt,
    seconds: AUTO_TURN_ACTION_MS / 1000,
  });

  const timer = setTimeout(() => {
    autoTurnActionTimers.delete(roomId);
    const latestMeta = autoTurnActionMeta.get(roomId);
    if (
      latestMeta?.playerId !== meta.playerId ||
      latestMeta.turnNumber !== meta.turnNumber ||
      latestMeta.phase !== meta.phase
    ) {
      return;
    }
    autoTurnActionMeta.delete(roomId);
    void performAutoTurnAction(roomId, io, meta);
  }, AUTO_TURN_ACTION_MS);
  autoTurnActionTimers.set(roomId, timer);
}

async function performAutoTurnAction(
  roomId: string,
  io: SocketServer,
  expected: { playerId: string; turnNumber: number; phase: LudoGameState["phase"] },
): Promise<void> {
  const game = activeGames.get(roomId);
  if (!game || game.phase === "finished") return;
  const currentPlayer = game.players[game.currentColorIndex];
  if (
    currentPlayer.clerkUserId !== expected.playerId ||
    game.turnNumber !== expected.turnNumber ||
    game.phase !== expected.phase ||
    !disconnectedGamePlayers.has(`${roomId}:${currentPlayer.clerkUserId}`)
  ) {
    scheduleAutoTurnAction(roomId, io);
    return;
  }

  try {
    if (game.phase === "rolling") {
      const diceValue = rollDice(
        game.powerSixEnabled,
        game.powerSixCycleCount[currentPlayer.color] ?? -1,
      );
      const { state: newState, moves, event } = applyDiceRoll(game, diceValue);
      activeGames.set(roomId, newState);
      io.to(roomId).emit("game:dice_rolled", {
        diceValue,
        color: currentPlayer.color,
        moves,
        event,
        automatic: true,
        game: newState,
      });
      if (moves.length === 0) {
        io.to(roomId).emit("game:state", { game: newState });
      }
      await persistGameState(roomId, newState);
      scheduleAutoTurnAction(roomId, io);
      return;
    }

    const moves = getValidMoves(game, game.diceValue!);
    const selectedMove =
      moves.find((move) => move.capturesAt !== null) ??
      moves.find((move) => move.finishes) ??
      moves.find((move) => move.fromPos >= 0) ??
      moves[0];
    if (!selectedMove) {
      scheduleAutoTurnAction(roomId, io);
      return;
    }

    const { state: newState, event, gameOver } = applyMove(game, selectedMove.tokenIndex);
    activeGames.set(roomId, newState);
    io.to(roomId).emit("game:moved", { event, automatic: true, game: newState });
    if (gameOver) {
      const finalized = await finalizeOnlineGame(roomId, newState);
      activeGames.delete(roomId);
      if (finalized) {
        io.to(roomId).emit("game:finished", {
          winnerId: newState.winnerId,
          winnerColor: newState.winnerColor,
          game: newState,
        });
      }
      return;
    }
    await persistGameState(roomId, newState);
    scheduleAutoTurnAction(roomId, io);
  } catch (err) {
    logger.error({ err, roomId }, "Automatic disconnected-player action failed");
    scheduleAutoTurnAction(roomId, io);
  }
}

async function getOrStartGame(roomId: string): Promise<LudoGameState | null> {
  const activeGame = activeGames.get(roomId);
  if (activeGame) return activeGame;

  const existingStart = gameStartLocks.get(roomId);
  if (existingStart) return existingStart;

  const startPromise = (async () => {
    const [room] = await db
      .select()
      .from(gameRoomsTable)
      .where(eq(gameRoomsTable.id, roomId))
      .limit(1);
    if (!room) return null;

    // Restore a persisted game after an API/WebSocket process restart. Power
    // Six counters live in this JSON snapshot, so reconnects must use it
    // rather than creating a fresh game or losing the cycle.
    if (room.status === "in_progress") {
      const [gameRow] = await db
        .select()
        .from(ludoGamesTable)
        .where(eq(ludoGamesTable.roomId, roomId))
        .orderBy(desc(ludoGamesTable.updatedAt))
        .limit(1);
      const persisted = gameRow?.state as Partial<LudoGameState> | undefined;
      if (!persisted || !Array.isArray(persisted.players)) return null;

      const restored: LudoGameState = {
        ...(persisted as LudoGameState),
        powerSixEnabled:
          typeof persisted.powerSixEnabled === "boolean"
            ? persisted.powerSixEnabled
            : Boolean(room.powerSixEnabled),
        powerSixCycleCount: {
          red: persisted.powerSixCycleCount?.red ?? -1,
          green: persisted.powerSixCycleCount?.green ?? -1,
          blue: persisted.powerSixCycleCount?.blue ?? -1,
          yellow: persisted.powerSixCycleCount?.yellow ?? -1,
        },
      };
      activeGames.set(roomId, restored);
      return restored;
    }

    if (room.status !== "waiting") return null;

    const seats = (room.seats as any[]) ?? [];
    if (seats.length < room.maxPlayers) return null;

    const players = seats.map((s: any) => ({
      clerkUserId: s.clerkUserId,
      displayName: s.displayName,
      color: s.color as PlayerColor,
    }));
    const gameState = createInitialState(roomId, players, room.powerSixEnabled);
    activeGames.set(roomId, gameState);

    const [gameRow] = await db
      .insert(ludoGamesTable)
      .values({
        roomId,
        state: gameState as any,
        currentTurn: gameState.players[gameState.currentColorIndex].color,
        turnNumber: 0,
      })
      .returning();

    await db
      .update(gameRoomsTable)
      .set({
        status: "in_progress",
        gameId: gameRow.id,
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(gameRoomsTable.id, roomId));

    logger.info({ roomId }, "Game started");
    return gameState;
  })();

  gameStartLocks.set(roomId, startPromise);
  try {
    return await startPromise;
  } finally {
    gameStartLocks.delete(roomId);
  }
}
