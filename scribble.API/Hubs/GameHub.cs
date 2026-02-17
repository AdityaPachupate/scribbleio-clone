using System;
using Microsoft.AspNetCore.SignalR;
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

}
