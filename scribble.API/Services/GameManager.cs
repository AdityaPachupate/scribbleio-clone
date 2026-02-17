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
            _rooms.TryGetValue(roomCode, out var room);
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

            // Create new player
            var player = new Player
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
            if (room == null) return;

            foreach (var player in room.Players)
            {
                player.HasGuessedCorrectly = false;
                player.IsDrawing = false;
            }

            var currentDrawerIndex = room.Players.FindIndex(p => p.ConnectionId == room.CurrentDrawerId);
            var nextDrawerIndex = (currentDrawerIndex + 1) % room.Players.Count;
            var nextDrawer = room.Players[nextDrawerIndex];

            room.CurrentDrawerId = nextDrawer.ConnectionId;
            nextDrawer.IsDrawing = true;

            room.CurrentWord = room.WordPool[_random.Next(room.WordPool.Count)];

            // Update round info
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

        /// <summary>
        /// Generate a random room code
        /// </summary>
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
