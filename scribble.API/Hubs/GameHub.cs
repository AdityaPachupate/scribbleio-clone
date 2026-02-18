using System;
using Microsoft.AspNetCore.SignalR;
using scribble.API.Models;
using scribble.API.Services;

namespace scribble.API.Hubs;

public class GameHub : Hub
{

    private readonly GameManager _gameManager;
    private readonly ILogger<GameHub> _logger;

    public GameHub(GameManager gameManager, ILogger<GameHub> logger)
    {
        _gameManager = gameManager;
        _logger = logger;
    }

    public async Task CreateRoom(string username)
    {
        //create room function
        // 1. generate room code
        var roomCode = _gameManager.GenerateRoomCode();
        //2. generate room with room code
        var room = _gameManager.CreateRoom(roomCode);
        //3.add first player as the room host
        var player = _gameManager.AddPlayer(
            roomCode,
            Context.ConnectionId,
            username
        );
        if (player != null)
        {
            //-> get player , check if not null
            await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomCode);
            //-> then add to group with current connection id and the room room code
            await Clients.Caller.SendAsync("RoomCreated", new
            {
                roomCode = room.RoomCode,
                players = room.Players
            });

            _logger.LogInformation($"Room {roomCode} created by {username}");
        }
    }

    public async Task JoinRoom(string roomCode, string username)
    {
        var room = _gameManager.GetRoom(roomCode);

        if (room == null)
        {
            await Clients.Caller.SendAsync("Error", "Room not found");
            return;
        }

        // Allow re-joining with same username (re-connection case)
        // If we want to prevent TWO players with same name, we'd check if the other connection is active
        // but for this project, updating is fine.

        var player = _gameManager.AddPlayer(roomCode, Context.ConnectionId, username);

        if (player != null)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomCode);

            // Sync the Joining player with current state
            await Clients.Caller.SendAsync("PlayerJoined", new
            {
                players = room.Players,
                newPlayer = player,
                chatHistory = room.ChatHistory,
                // ✅ Add full game state for mid-game join/refresh
                gameStarted = room.State != GameState.Waiting,
                currentDrawer = room.Players.FirstOrDefault(p => p.ConnectionId == room.CurrentDrawerId)?.Username,
                maskedWord = _gameManager.GetMaskedWord(room.RoomCode),
                roundEnded = room.State == GameState.RoundEnd,
                roundNumber = room.RoundNumber
            });

            // Broadcast to everyone else (and the caller) that players list changed
            await Clients.Group(room.RoomCode).SendAsync("PlayersUpdated", room.Players);

            var systemMessage = new ChatMessage
            {
                Username = "System",
                Message = $"{username} joined the game",
                IsSystemMessage = true
            };
            room.ChatHistory.Add(systemMessage);

            // Broadcast system message
            await Clients.Group(room.RoomCode).SendAsync("ReceiveMessage", systemMessage);

            _logger.LogInformation($"{username} joined room {room.RoomCode}");
        }
    }

    public async Task StartRound(string roomCode)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room == null) return;

        if (room.Players.Count < 2)
        {
            await Clients.Caller.SendAsync("Error", "Need at least 2 players to start");
            return;
        }

        _gameManager.StartNewRound(roomCode);

        var drawer = room.Players.First(p => p.IsDrawing);
        await Clients.Client(drawer.ConnectionId).SendAsync("YourTurnToDraw", new
        {
            word = room.CurrentWord,
            roundDuration = room.RoundDurationSeconds
        });

        var maskedWord = _gameManager.GetMaskedWord(roomCode);
        await Clients.GroupExcept(roomCode, drawer.ConnectionId).SendAsync("RoundStarted", new
        {
            drawer = drawer.Username,
            wordLength = room.CurrentWord.Length,
            maskedWord = maskedWord,
            roundDuration = room.RoundDurationSeconds
        });
        _logger.LogInformation($"Game started in room {roomCode}");
    }

    public async Task SendDrawing(string roomCode, DrawingData drawingData)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room == null) return;

        // Verify sender is the current drawer
        var player = room.Players.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
        if (player == null || !player.IsDrawing) return;

        // Broadcast to everyone EXCEPT the sender
        // (sender already has it on their own canvas)
        await Clients.OthersInGroup(roomCode).SendAsync("ReceiveDrawing", drawingData);
    }

    public async Task SendMessage(string roomCode, string message)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room == null) return;

        var player = room.Players.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
        if (player == null) return;

        if (player.IsDrawing)
        {
            var chatMsg = new ChatMessage
            {
                Username = player.Username,
                Message = message
            };
            room.ChatHistory.Add(chatMsg);
            await Clients.Group(roomCode).SendAsync("ReceiveMessage", chatMsg);
            return;
        }

        var isCorrect = _gameManager.CheckGuess(roomCode, Context.ConnectionId, message);

        if (isCorrect)
        {
            var correctMsg = new ChatMessage
            {
                Username = "System",
                Message = $"{player.Username} guesses the word!",
                IsSystemMessage = true,
                IsCorrectGuess = true

            };
            room.ChatHistory.Add(correctMsg);

            await Clients.Group(roomCode).SendAsync("CorrectGuess", new
            {
                username = player.Username,
                score = player.Score
            });

            await Clients.Group(roomCode).SendAsync("ReceiveMessage", correctMsg);
            // Update player scores
            await Clients.Group(roomCode).SendAsync("PlayersUpdated", room.Players);

            // Check if all non-drawers have guessed
            var allGuessed = room.Players
                .Where(p => !p.IsDrawing)
                .All(p => p.HasGuessedCorrectly);
            if (allGuessed)
            {
                await EndRound(roomCode);
            }
        }
        else
        {
            // Regular chat message
            var chatMsg = new ChatMessage
            {
                Username = player.Username,
                Message = message
            };
            room.ChatHistory.Add(chatMsg);
            await Clients.Group(roomCode).SendAsync("ReceiveMessage", chatMsg);
        }
    }

    public async Task EndRound(string roomCode)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room == null) return;

        room.State = GameState.RoundEnd;

        // Show results to everyone
        await Clients.Group(roomCode).SendAsync("RoundEnded", new
        {
            word = room.CurrentWord,
            players = room.Players.OrderByDescending(p => p.Score).ToList()
        });

        _logger.LogInformation($"Round ended in room {roomCode}");
    }

    public async Task NextRound(string roomCode)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room == null) return;

        // Clear everyone's canvas
        await Clients.Group(roomCode).SendAsync("ClearCanvas");

        // Start new round
        _gameManager.StartNewRound(roomCode);

        var drawer = room.Players.First(p => p.IsDrawing);

        // Notify drawer
        await Clients.Client(drawer.ConnectionId).SendAsync("YourTurnToDraw", new
        {
            word = room.CurrentWord,
            roundDuration = room.RoundDurationSeconds
        });

        // Notify guessers
        var maskedWord = _gameManager.GetMaskedWord(roomCode);
        await Clients.GroupExcept(roomCode, drawer.ConnectionId).SendAsync("RoundStarted", new
        {
            drawer = drawer.Username,
            wordLength = room.CurrentWord.Length,
            maskedWord = maskedWord,
            roundDuration = room.RoundDurationSeconds
        });
    }

    public async Task ClearCanvas(string roomCode)
    {
        var room = _gameManager.GetRoom(roomCode);
        if (room == null) return;

        // Verify sender is drawer
        var player = room.Players.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
        if (player == null || !player.IsDrawing) return;

        await Clients.Group(roomCode).SendAsync("ClearCanvas");
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        // Find which room the player was in
        foreach (var room in _gameManager.GetAllRooms())
        {
            var player = room.Players.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);

            if (player != null)
            {
                var wasDrawing = player.IsDrawing;

                // Remove player
                _gameManager.RemovePlayer(room.RoomCode, Context.ConnectionId);

                // Notify others
                var systemMessage = new ChatMessage
                {
                    Username = "System",
                    Message = $"{player.Username} left the game",
                    IsSystemMessage = true
                };

                await Clients.Group(room.RoomCode).SendAsync("PlayerLeft", new
                {
                    players = room.Players,
                    leftPlayer = player
                });

                await Clients.Group(room.RoomCode).SendAsync("ReceiveMessage", systemMessage);

                // If drawer left, end the round
                if (wasDrawing && room.Players.Count > 0)
                {
                    await EndRound(room.RoomCode);
                }

                _logger.LogInformation($"{player.Username} disconnected from room {room.RoomCode}");
                break;
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

}






