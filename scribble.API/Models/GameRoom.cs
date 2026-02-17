namespace scribble.API.Models
namespace ScribbleGame.API.Models
{
    /// <summary>
    /// Represents a game room/session
    /// </summary>
    public class GameRoom
    {
        // 6-character unique code (e.g., "ABC123")
        public string RoomCode { get; set; } = string.Empty;

        // All players in this room
        public List<Player> Players { get; set; } = new();

        // ConnectionId of the current drawer
        public string CurrentDrawerId { get; set; } = string.Empty;

        // The word being drawn (secret!)
        public string CurrentWord { get; set; } = string.Empty;

        // When did this round start?
        public DateTime RoundStartTime { get; set; }

        // Which round are we on?
        public int RoundNumber { get; set; }

        // How long is each round? (default 80 seconds)
        public int RoundDurationSeconds { get; set; } = 80;

        // Current game state
        public GameState State { get; set; } = GameState.Waiting;

        // Pool of words to choose from
        public List<string> WordPool { get; set; } = new()
        {
            "elephant", "guitar", "pizza", "rainbow", "computer",
            "mountain", "bicycle", "sunset", "robot", "castle",
            "butterfly", "lighthouse", "dinosaur", "volcano", "spaceship",
            "waterfall", "penguin", "keyboard", "umbrella", "telescope"
        };

        // Chat message history
        public List<ChatMessage> ChatHistory { get; set; } = new();

        // When was this room created?
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    /// <summary>
    /// Game state enum
    /// </summary>
    public enum GameState
    {
        Waiting,      // Waiting for players to join
        ChoosingWord, // (Future: Let drawer choose from 3 words)
        Drawing,      // Active drawing round
        RoundEnd,     // Round ended, showing results
        GameEnd       // (Future: Game completely over)
    }

    /// <summary>
    /// Chat message model
    /// </summary>
    public class ChatMessage
    {
        public string Username { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public bool IsSystemMessage { get; set; }
        public bool IsCorrectGuess { get; set; }
    }
}