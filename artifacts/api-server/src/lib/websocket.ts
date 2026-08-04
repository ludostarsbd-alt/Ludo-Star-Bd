/**
 * websocket.ts
 * Socket.IO real-time multiplayer server.
 * Manages in-memory game state and broadcasts events to room members.
 */

import { Server as HttpServer } from "http";
import { Server as SocketServer, type Socket } from "socket.io";
import { db } from "@workspace/db";
import { gameRoomsTable, ludoGamesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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

/* ── In-memory state ───────────────────────────────────────────────────────── */

// roomId → LudoGameState
const activeGames = new Map<string, LudoGameState>();

// socketId → { clerkUserId, displayName, roomId }
const socketMeta = new Map<string, { clerkUserId: string; displayName: string; roomId: string }>();

/* ── Bootstrap ─────────────────────────────────────────────────────────────── */

export function initWebSocket(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/api/ws/socket.io",
  });

  io.on("connection", (socket: Socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    /* ── Room: join ─────────────────────────────────────────────────────── */
    socket.on(
      "room:join",
      async (payload: { roomId: string; clerkUserId: string; displayName: string }) => {
        const { roomId, clerkUserId, displayName } = payload;

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

          socket.join(roomId);
          socketMeta.set(socket.id, { clerkUserId, displayName, roomId });

          socket.to(roomId).emit("room:player_joined", { clerkUserId, displayName });
          socket.emit("room:joined", {
            room,
            game: activeGames.get(roomId) ?? null,
          });

          logger.info({ socketId: socket.id, roomId, clerkUserId }, "Player joined room");
        } catch (err) {
          logger.error({ err }, "room:join error");
          socket.emit("error", { message: "Failed to join room" });
        }
      },
    );

    /* ── Room: leave ────────────────────────────────────────────────────── */
    socket.on("room:leave", () => handleDisconnect(socket, io));

    /* ── Game: start ────────────────────────────────────────────────────── */
    socket.on("game:start", async (payload: { roomId: string }) => {
      const { roomId } = payload;
      try {
        const [room] = await db
          .select()
          .from(gameRoomsTable)
          .where(eq(gameRoomsTable.id, roomId))
          .limit(1);

        if (!room || room.status !== "waiting") {
          socket.emit("error", { message: "Room not ready to start" });
          return;
        }

        const seats = (room.seats as any[]) ?? [];
        if (seats.length < 2) {
          socket.emit("error", { message: "Need at least 2 players" });
          return;
        }

        const players = seats.map((s: any) => ({
          clerkUserId: s.clerkUserId,
          displayName: s.displayName,
          color: s.color as PlayerColor,
        }));

        const gameState = createInitialState(roomId, players);
        activeGames.set(roomId, gameState);

        // Persist game row
        const [gameRow] = await db
          .insert(ludoGamesTable)
          .values({
            roomId,
            state: gameState as any,
            currentTurn: gameState.players[gameState.currentColorIndex].color,
            turnNumber: 0,
          })
          .returning();

        // Update room status
        await db
          .update(gameRoomsTable)
          .set({ status: "in_progress", gameId: gameRow.id, startedAt: new Date(), updatedAt: new Date() })
          .where(eq(gameRoomsTable.id, roomId));

        io.to(roomId).emit("game:started", { game: gameState });
        logger.info({ roomId }, "Game started");
      } catch (err) {
        logger.error({ err }, "game:start error");
        socket.emit("error", { message: "Failed to start game" });
      }
    });

    /* ── Game: roll dice ────────────────────────────────────────────────── */
    socket.on("game:roll", async (payload: { roomId: string; clerkUserId: string }) => {
      const { roomId, clerkUserId } = payload;
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

      const diceValue = rollDice();
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
        const { roomId, clerkUserId, tokenIndex } = payload;
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
        const { roomId, senderId, senderName, content } = payload;
        if (!content?.trim()) return;
        io.to(roomId).emit("chat:room_message", {
          senderId,
          senderName,
          content: content.slice(0, 500),
          timestamp: new Date().toISOString(),
        });
      },
    );

    /* ── Disconnect ─────────────────────────────────────────────────────── */
    socket.on("disconnect", () => handleDisconnect(socket, io));
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

function handleDisconnect(socket: Socket, io: SocketServer): void {
  const meta = socketMeta.get(socket.id);
  if (meta) {
    socket.to(meta.roomId).emit("room:player_left", {
      clerkUserId: meta.clerkUserId,
      displayName: meta.displayName,
    });
    socketMeta.delete(socket.id);
    logger.info({ socketId: socket.id, ...meta }, "Socket disconnected");
  }
}
