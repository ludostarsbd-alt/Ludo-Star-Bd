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
  playersTable,
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
    })().catch((err) => logger.warn({ err }, "Failed to broadcast online presence"));
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on(
      "social:dm_send",
      async (payload: { recipientId?: string; content?: string }) => {
        const senderId = socket.data.clerkUserId as string | undefined;
        const recipientId = payload?.recipientId;
        const content = payload?.content?.trim();
        if (!senderId || !recipientId || senderId === recipientId) {
          socket.emit("social:error", { message: "Invalid recipient" });
          return;
        }
        if (!content || content.length > 1000) {
          socket.emit("social:error", {
            message: "Content must be 1–1000 characters",
          });
          return;
        }

        try {
          const permission = await getDirectMessagePermission(
            senderId,
            recipientId,
          );
          if (!permission.allowed) {
            socket.emit("social:error", { message: permission.reason });
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
        } catch (err) {
          logger.error({ err, senderId, recipientId }, "social:dm_send error");
          socket.emit("social:error", { message: "Message could not be sent" });
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
    socket.on("room:leave", () => void handleDisconnect(socket, io));

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

        try {
          const { state: newState, event, gameOver } = applyMove(game, tokenIndex);
          activeGames.set(roomId, newState);

          io.to(roomId).emit("game:moved", { event, game: newState });

          if (gameOver) {
            io.to(roomId).emit("game:finished", {
              winnerId: newState.winnerId,
              winnerColor: newState.winnerColor,
              game: newState,
            });

            await db
              .update(ludoGamesTable)
              .set({
                state: newState as any,
                currentTurn: newState.winnerColor!,
                turnNumber: newState.turnNumber,
                isFinished: true,
                winnerId: newState.winnerId,
                winnerColor: newState.winnerColor,
                updatedAt: new Date(),
                finishedAt: new Date(),
              })
              .where(eq(ludoGamesTable.roomId, roomId));

            await db
              .update(gameRoomsTable)
              .set({ status: "finished", finishedAt: new Date(), updatedAt: new Date() })
              .where(eq(gameRoomsTable.id, roomId));

            activeGames.delete(roomId);
          } else {
            await persistGameState(roomId, newState);
          }
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

async function handleDisconnect(socket: Socket, io: SocketServer): Promise<void> {
  if (disconnectedSockets.has(socket.id)) return;
  disconnectedSockets.add(socket.id);
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
  socket.to(meta.roomId).emit("room:player_left", {
    clerkUserId: meta.clerkUserId,
    displayName: meta.displayName,
  });
  logger.info({ socketId: socket.id, ...meta }, "Socket disconnected");

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
