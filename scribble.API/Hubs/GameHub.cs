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
            await Groups.AddToGroupAsync(Context.ConnectionId, username);
            //-> then add to ggroup with current connection id and the room room code
            await Clients.Caller.SendAsync("RoomCreate", new
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

        if (room.Players.Any(p => p.Username.Equals(username, StringComparison.OrdinalIgnoreCase)))
        {
            await Clients.Caller.SendAsync("Error", "Username already exists in this room");
            return;
        }

        var player = _gameManager.AddPlayer(roomCode, Context.ConnectionId, username);

        if (player != null)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);

            await Clients.Group(roomCode).SendAsync("PlayerJoined", new
            {
                players = room.Players,
                newPlayer = player
            });

            var systemMessage = new ChatMessage
            {
                Username = "System",
                Message = $"{username} joined the game",
                IsSystemMessage = true
            };
            room.ChatHistory.Add(systemMessage);

            // Broadcast system message
            await Clients.Group(roomCode).SendAsync("ReceiveMessage", systemMessage);

            _logger.LogInformation($"{username} joined room {roomCode}");
        }
    }
}
