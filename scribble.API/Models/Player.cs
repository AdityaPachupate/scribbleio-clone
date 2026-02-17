namespace scribble.API.Models
{
    public class Player
    {
        // SignalR connection ID - unique identifier for each connection
        public string ConnectionId { get; set; } = string.Empty;

        // Player's chosen username
        public string Username { get; set; } = string.Empty;

        // Current score (accumulates across rounds)
        public int Score { get; set; }

        // Is this player currently drawing?
        public bool IsDrawing { get; set; }

        // Has this player guessed correctly this round?
        public bool HasGuessedCorrectly { get; set; }

        // When did the player join?
        public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    }
}
