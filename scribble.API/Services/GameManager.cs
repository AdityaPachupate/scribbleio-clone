using Microsoft.AspNetCore.Mvc.Diagnostics;
using scribble.API.Models;
using System.Collections.Concurrent;

namespace scribble.API.Services
{
    public class GameManager
    {
        private readonly ConcurrentDictionary<string, GameRoom> _rooms = new();

        private readonly Random _random = new();

        public GameRoom CreateRoom(string roomCode)
        {
            var room = new GameRoom
            {
                RoomCode = roomCode.ToUpper(), // Always uppercase for consistency
                State = GameState.Waiting
            };

            _rooms.TryAdd(room.RoomCode, room);

            return room;
        }

        public GameRoom? GetRoom(string roomCode)
        {
            _rooms.TryGetValue(roomCode.ToUpper(), out var room);
            return room;
        }

        public bool RemoveRoom(string roomCode)
        {
            return _rooms.TryRemove(roomCode.ToUpper(), out _);
        }

        public Player? AddPlayer(string roomCode, string connectionId, string username)
        {
            var room = GetRoom(roomCode);
            if (room == null) return null;

            // Check if player already exists by username (re-connection case)
            var player = room.Players.FirstOrDefault(p => p.Username.Equals(username, StringComparison.OrdinalIgnoreCase));

            if (player != null)
            {
                // Update connection ID for the existing player
                player.ConnectionId = connectionId;

                // CRITICAL: If this player was the drawer, update the Room's CurrentDrawerId
                // because the HUB uses room.CurrentDrawerId to check permissions!
                if (player.IsDrawing)
                {
                    room.CurrentDrawerId = connectionId;
                }

                return player;
            }

            // Create new player
            player = new Player
            {
                ConnectionId = connectionId,
                Username = username,
                Score = 0,
                IsDrawing = false
            };

            // Add to room's player list
            room.Players.Add(player);

            return player;
        }


        public bool RemovePlayer(string roomCode, string connectionId)
        {
            var room = GetRoom(roomCode);
            if (room == null) return false;

            // Find the player
            var player = room.Players.FirstOrDefault(p => p.ConnectionId == connectionId);
            if (player == null) return false;

            // Remove from list
            room.Players.Remove(player);

            // If room is empty, delete it
            if (room.Players.Count == 0)
            {
                RemoveRoom(roomCode);
            }

            return true;
        }

        public void StartNewRound(string roomCode)
        {
            var room = GetRoom(roomCode);
            if (room == null || room.Players.Count == 0) return;

            // 1. Reset all players
            foreach (var player in room.Players)
            {
                player.HasGuessedCorrectly = false;
                player.IsDrawing = false;
            }

            // 2. Determine index of current drawer (if any)
            var currentDrawerIndex = room.Players.FindIndex(p => p.ConnectionId == room.CurrentDrawerId);

            // 3. Select next drawer safely
            int nextDrawerIndex;
            if (currentDrawerIndex == -1)
            {
                // No current drawer or drawer left: start with first player
                nextDrawerIndex = 0;
            }
            else
            {
                // Rotate to next player
                nextDrawerIndex = (currentDrawerIndex + 1) % room.Players.Count;
            }

            var nextDrawer = room.Players[nextDrawerIndex];
            room.CurrentDrawerId = nextDrawer.ConnectionId;
            nextDrawer.IsDrawing = true;

            // 4. Select a new secret word
            if (room.WordPool != null && room.WordPool.Count > 0)
            {
                room.CurrentWord = room.WordPool[_random.Next(room.WordPool.Count)];
            }
            else
            {
                room.CurrentWord = "apples"; // Fallback
            }

            // 5. Update round info
            room.RoundStartTime = DateTime.UtcNow;
            room.RoundNumber++;
            room.State = GameState.Drawing;
        }

        public bool CheckGuess(string roomCode, string connectionId, string guess)
        {
            // Check for room
            var room = GetRoom(roomCode);
            if (room == null) return false;

            //Find player who is guessing with the connection id 
            var player = room.Players.FirstOrDefault(p => p.ConnectionId == connectionId);

            // Can't guess if:
            // - Player not found
            // - Already guessed correctly
            // - Is the drawer
            if (player == null || player.HasGuessedCorrectly || player.IsDrawing) return false;

            // Check if the guess is correct
            if (string.Equals(guess.Trim(), room.CurrentWord, StringComparison.OrdinalIgnoreCase))
            {
                // After the guess is correct

                player.HasGuessedCorrectly = true;

                // Calculate score 
                var elapsedSeconds = (DateTime.UtcNow - room.RoundStartTime).TotalSeconds;
                var timeBonus = Math.Max(0, room.RoundDurationSeconds - (int)elapsedSeconds);

                // Base score + time bonus
                player.Score += 100 + timeBonus;

                return true;
            }

            return false;
        }

        public string GetMaskedWord(string roomCode)
        {
            var room = GetRoom(roomCode);
            if (room == null) return "";

            // Replace each character with underscore
            return new string('_', room.CurrentWord.Length);
        }

        public List<GameRoom> GetAllRooms()
        {
            return _rooms.Values.ToList();
        }
        public string GenerateRoomCode()
        {
            const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            var code = new char[6];

            for (int i = 0; i < 6; i++)
            {
                code[i] = chars[_random.Next(chars.Length)];
            }

            return new string(code);
        }
    }
}
