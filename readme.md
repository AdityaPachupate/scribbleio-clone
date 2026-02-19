# 🎨 Scribbl.io Clone — Iterative Prototyping Guide

> **Repo:** [AdityaPachupate/scribbleio-clone](https://github.com/AdityaPachupate/scribbleio-clone)  
> **Stack:** .NET Core · Angular · SignalR
> **Note:** This guide uses `GameHub.cs` — your actual file name in the repo (not `DrawingHub.cs`)  
> **Approach:** Prototype-first. Build small, run it, then improve.

---

## 🗺️ Roadmap Overview

| Phase | Goal | Output |
|---|---|---|
| **Prototype v1** | Basic drawing sync | Two users see the same canvas |
| **Prototype v2** | Rooms + Chat | Multiple rooms, chat box |
| **Prototype v3** | Game Loop | Words, turns, timer |
| **Prototype v4** | Scoring + Guessing | Points, correct guess detection |
| **Final Model** | Polish + Production | Full game, UI, edge cases |

---

---

# PART 1 — SYSTEM FLOW & ARCHITECTURE

## 1️⃣ Overall Game Flow

```
Player draws on canvas
        │
        ▼
Angular CanvasComponent
(captures mousedown / mousemove / mouseup)
        │
        ▼
SignalR Client  ──── HubConnectionBuilder ────►  ws://localhost:5000/game-hub
        │
        ▼
GameHub (.NET Core)
        │
        ▼
Game State Update (in-memory Dictionary)
        │
        ▼
Broadcast to SignalR Group (room)
        │
        ▼
All Angular clients receive stroke
        │
        ▼
Canvas redraws the stroke on screen
```

**Guessing path (v4):**

```
Player types guess in ChatComponent
        │
        ▼
SignalR → GameHub.SendMessage()
        │
        ├─ word matches? ──► award points → Broadcast CorrectGuess
        │
        └─ no match? ──────► broadcast as normal chat message
```

---

## 2️⃣ High-Level Architecture

### Backend (`scribble.API`)

```
scribble.API/
├── Hubs/
│   └── GameHub.cs         ← All SignalR methods live here
├── Models/
│   ├── GameState.cs          ← Per-room game data (drawer, word, round)
│   ├── Player.cs             ← Name, connectionId, score
│   └── Room.cs               ← RoomCode, list of players
├── Services/
│   └── GameService.cs        ← Timer logic, word selection, scoring
└── Program.cs                ← CORS, SignalR registration
```

**Key backend concepts:**

- **GameHub** — extends `Hub`, handles all real-time methods
- **GameState** — plain C# object stored in a `ConcurrentDictionary<string, GameState>`
- **Room Management** — SignalR Groups map directly to game rooms
- **Timer** — `System.Threading.Timer` fires every second per active room
- **In-memory storage** — no database needed until Final Model

### Frontend (`scribble-client`)

```
scribble-client/src/app/
├── lobby/
│   └── lobby.component.ts    ← Create/join room
├── game-room/
│   └── game-room.component.ts ← Hosts canvas + chat + leaderboard
├── canvas/
│   └── canvas.component.ts   ← Drawing surface
├── chat/
│   └── chat.component.ts     ← Guesses + messages
├── leaderboard/
│   └── leaderboard.component.ts ← Score display
└── services/
    └── signalr.service.ts    ← Single shared HubConnection
```

---

## 3️⃣ Why Prototype-First Works Here

Real-time systems have **feedback loops** — you can't reason about them from code alone. You need to *see* strokes appear in a second tab, *hear* the timer tick, *watch* the score update. Building everything upfront means debugging a system you've never seen run.

The iterative approach works because:

- Each prototype gives you a **running system** to poke and break
- SignalR bugs surface immediately when you open two tabs
- Architecture decisions (rooms, state, timers) only make sense once you've felt the pain of not having them
- You avoid over-engineering features you'll change anyway

---

---

# PART 2 — ITERATIVE PROTOTYPING GUIDE

---

## 🟢 PROTOTYPE v1 — Basic Drawing Sync

### 📚 Topics To Learn Before This Phase

**.NET:**
- What is a `Hub` class in SignalR — it's just a class with methods clients can call
- `Clients.All.SendAsync("MethodName", data)` — how to broadcast to everyone
- CORS in `Program.cs` — Angular (port 4200) needs permission to talk to .NET (port 5000)

**Angular:**
- `HubConnectionBuilder` — creates the WebSocket connection to the hub
- `.on("MethodName", callback)` — how to listen for server broadcasts
- Canvas API basics — `getContext("2d")`, `lineTo()`, `stroke()`

**SignalR:**
- SignalR uses WebSockets under the hood but falls back to long polling automatically
- Connection lifecycle: `start()` → use → `stop()`

---

### 🎯 Goal

Two browser tabs open. Draw on one. The stroke appears on the other in real-time. No rooms, no login, no scoring. Just raw drawing sync.

---

### 📁 Files To Create

```
scribble.API/
└── Hubs/GameHub.cs        ← NEW

scribble-client/src/app/
└── canvas/
    ├── canvas.component.ts   ← NEW
    └── canvas.component.html ← NEW

scribble-client/src/app/
└── services/signalr.service.ts ← NEW

Program.cs                    ← EDIT (add SignalR + CORS)
```

---

### 🧠 Why This Is The Correct First Slice

Before rooms, words, or scoring — you need to prove the pipeline works. The entire game depends on: `mouse event → SignalR → Hub → broadcast → other client draws it`. If that chain works, everything else is just features on top. If it doesn't, nothing else matters.

---

### 🧩 Minimal Code Skeleton

**`GameHub.cs`**
```csharp
using Microsoft.AspNetCore.SignalR;

public class GameHub : Hub
{
    // Client calls this → Hub broadcasts to everyone else
    public async Task SendStroke(object strokeData)
    {
        await Clients.Others.SendAsync("ReceiveStroke", strokeData);
    }
}
```

**`Program.cs` (key additions)**
```csharp
builder.Services.AddSignalR();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
        policy.WithOrigins("http://localhost:4200")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials());
});

// ...

app.UseCors();
app.MapHub<GameHub>("/game-hub");
```

**`signalr.service.ts`**
```typescript
import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';

@Injectable({ providedIn: 'root' })
export class SignalrService {
  private connection = new signalR.HubConnectionBuilder()
    .withUrl('http://localhost:5000/game-hub')
    .withAutomaticReconnect()
    .build();

  async start() {
    await this.connection.start();
  }

  sendStroke(stroke: any) {
    this.connection.invoke('SendStroke', stroke);
  }

  onReceiveStroke(callback: (stroke: any) => void) {
    this.connection.on('ReceiveStroke', callback);
  }
}
```

**`canvas.component.ts` (key logic)**
```typescript
export class CanvasComponent implements AfterViewInit {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;

  constructor(private signalr: SignalrService) {}

  async ngAfterViewInit() {
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    await this.signalr.start();

    // Listen for strokes from other players
    this.signalr.onReceiveStroke(stroke => this.drawStroke(stroke));
  }

  onMouseDown(e: MouseEvent) { this.isDrawing = true; [this.lastX, this.lastY] = [e.offsetX, e.offsetY]; }
  onMouseUp() { this.isDrawing = false; }

  onMouseMove(e: MouseEvent) {
    if (!this.isDrawing) return;
    const stroke = { x: e.offsetX, y: e.offsetY, prevX: this.lastX, prevY: this.lastY, color: '#000', size: 3 };
    this.drawStroke(stroke);
    this.signalr.sendStroke(stroke);
    [this.lastX, this.lastY] = [e.offsetX, e.offsetY];
  }

  drawStroke(s: any) {
    this.ctx.beginPath();
    this.ctx.moveTo(s.prevX, s.prevY);
    this.ctx.lineTo(s.x, s.y);
    this.ctx.strokeStyle = s.color;
    this.ctx.lineWidth = s.size;
    this.ctx.stroke();
  }
}
```

**`canvas.component.html`**
```html
<canvas #canvas width="800" height="600"
  (mousedown)="onMouseDown($event)"
  (mousemove)="onMouseMove($event)"
  (mouseup)="onMouseUp()"
  style="border: 2px solid #333; cursor: crosshair;">
</canvas>
```

---

### 🔁 How To Test

1. Run backend: `dotnet run` in `scribble.API/`
2. Run frontend: `ng serve` in `scribble-client/`
3. Open `http://localhost:4200` in **two browser tabs**
4. Draw in Tab 1 → strokes must appear in Tab 2
5. Draw in Tab 2 → strokes must appear in Tab 1

---

### ⚠️ What We Intentionally Ignore

- No rooms — all clients share one global canvas
- No player names or authentication
- No undo, eraser, or color picker
- No persistence — canvas clears on refresh
- No error handling on SignalR disconnect

---

---

## 🟡 PROTOTYPE v2 — Rooms + Chat

### 📚 Topics To Learn Before This Phase

**.NET:**
- `Groups.AddToGroupAsync(connectionId, groupName)` — SignalR's way to isolate clients into rooms
- `Clients.Group("roomCode").SendAsync(...)` — broadcast only to one room
- `Context.ConnectionId` — unique ID per connected client, available inside any Hub method
- `ConcurrentDictionary<K,V>` — thread-safe dictionary for storing rooms in memory

**Angular:**
- `ActivatedRoute` — reading `:roomCode` from the URL
- `Router.navigate()` — programmatic navigation after joining a room
- Component communication — how `GameRoomComponent` passes data down to `CanvasComponent` and `ChatComponent`

**SignalR:**
- Groups are not persisted — they exist only in memory for the duration of the server process
- When a client disconnects, they are automatically removed from all groups

---

### 🎯 Goal

Players can create or join rooms using a 6-character code. Drawing is now room-scoped — Tab 1 in Room ABC can't see Tab 2 in Room XYZ. A chat box sits beside the canvas.

---

### 📁 Backend Updates

```
scribble.API/Hubs/GameHub.cs    ← Add JoinRoom, LeaveRoom, SendMessage
scribble.API/Models/Room.cs        ← NEW (RoomCode, Players list)
```

**`Room.cs`**
```csharp
public class Room
{
    public string RoomCode { get; set; } = string.Empty;
    public List<string> Players { get; set; } = new();
}
```

**`GameHub.cs` additions**
```csharp
// Static in-memory store (OK for prototype — replace later)
private static ConcurrentDictionary<string, Room> Rooms = new();

public async Task JoinRoom(string roomCode, string playerName)
{
    await Groups.AddToGroupAsync(Context.ConnectionId, roomCode);

    Rooms.AddOrUpdate(roomCode,
        new Room { RoomCode = roomCode, Players = new List<string> { playerName } },
        (key, existing) => { existing.Players.Add(playerName); return existing; });

    await Clients.Group(roomCode).SendAsync("PlayerJoined", playerName);
}

public async Task LeaveRoom(string roomCode, string playerName)
{
    await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomCode);
    if (Rooms.TryGetValue(roomCode, out var room))
        room.Players.Remove(playerName);

    await Clients.Group(roomCode).SendAsync("PlayerLeft", playerName);
}

// Update SendStroke to be room-scoped
public async Task SendStroke(string roomCode, object strokeData)
{
    await Clients.OthersInGroup(roomCode).SendAsync("ReceiveStroke", strokeData);
}

public async Task SendMessage(string roomCode, string playerName, string message)
{
    await Clients.Group(roomCode).SendAsync("ReceiveMessage", playerName, message);
}
```

---

### 📁 Frontend Updates

```
scribble-client/src/app/
├── lobby/lobby.component.ts        ← NEW
├── game-room/game-room.component.ts ← NEW
└── chat/chat.component.ts          ← NEW
```

**`lobby.component.ts` (key logic)**
```typescript
export class LobbyComponent {
  playerName = '';
  joinCode = '';

  constructor(private router: Router, private signalr: SignalrService) {}

  createRoom() {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.joinRoom(code);
  }

  async joinRoom(code?: string) {
    const roomCode = code ?? this.joinCode;
    await this.signalr.start();
    await this.signalr.joinRoom(roomCode, this.playerName);
    this.router.navigate(['/room', roomCode], { state: { playerName: this.playerName } });
  }
}
```

**`chat.component.ts` (key logic)**
```typescript
export class ChatComponent {
  @Input() roomCode = '';
  @Input() playerName = '';
  messages: { name: string, text: string }[] = [];
  inputText = '';

  constructor(private signalr: SignalrService) {
    this.signalr.onReceiveMessage((name, text) => {
      this.messages.push({ name, text });
    });
  }

  send() {
    if (!this.inputText.trim()) return;
    this.signalr.sendMessage(this.roomCode, this.playerName, this.inputText);
    this.inputText = '';
  }
}
```

---

### 🧠 Why We Add Rooms Now

With global broadcast (v1), one canvas is shared by every connected client globally. The moment a second pair of users opens the app, drawings bleed across. Rooms solve this by scoping everything — strokes, chat, and later game state — to a `Group`. This is the foundational isolation that makes the game work.

---

### 🔁 Testing Steps

1. Open Tab 1 → enter name → Create Room → note the room code
2. Open Tab 2 → enter name → Join Room with same code
3. Draw in Tab 1 → should appear only in Tab 2 (same room)
4. Open Tab 3 → join a **different** room code → draw → Tab 1 & 2 should NOT see it
5. Type in chat → message appears in both tabs of same room

---

### ⚠️ Common Beginner Mistakes

- **Forgetting `AllowCredentials()` in CORS** — SignalR's WebSocket handshake will fail silently
- **Using `Clients.All` instead of `Clients.Group(roomCode)`** — drawing leaks across all rooms
- **Not passing `roomCode` to `SendStroke`** — the Hub has no other way to know which group to broadcast to
- **Creating the HubConnection multiple times** — always use a single shared `SignalrService`, not one per component

---

---

## 🟠 PROTOTYPE v3 — Game Loop

### 📚 Topics To Learn Before This Phase

**.NET:**
- `System.Threading.Timer` — fires a callback on an interval; use it for the per-turn countdown
- `Clients.Client(connectionId)` — send a message to *one specific* client (drawer gets the real word, others don't)
- `IHubContext<GameHub>` — inject the hub context into a service class so `GameService` can broadcast without being inside a Hub method

**Angular:**
- `BehaviorSubject` — track reactive state (current drawer, time left) that multiple components need to observe
- `*ngIf` — conditionally show drawing toolbar only for the active drawer

**Concurrency:**
- Timer callbacks run on a thread pool thread, not the same thread as Hub methods — always use `lock` or `ConcurrentDictionary` to touch shared state from timers

---

### 🎯 Goal

A real game flow: one player draws, others see a masked word. A 60-second timer counts down server-side. When it hits zero (or all players guess correctly), the next player becomes the drawer. Turns rotate through all players.

---

### 🧠 GameState Design

```csharp
// Models/GameState.cs
public class GameState
{
    public string RoomCode { get; set; } = string.Empty;
    public List<Player> Players { get; set; } = new();
    public int CurrentDrawerIndex { get; set; } = 0;
    public string CurrentWord { get; set; } = string.Empty;
    public int RoundNumber { get; set; } = 1;
    public int TotalRounds { get; set; } = 3;
    public DateTime TurnStartTime { get; set; }
    public bool GameStarted { get; set; } = false;
    public List<string> CorrectGuessers { get; set; } = new();

    public Player CurrentDrawer => Players[CurrentDrawerIndex];

    public string MaskedWord => string.Join(" ", CurrentWord.Select(c => c == ' ' ? '/' : '_'));
}

// Models/Player.cs
public class Player
{
    public string ConnectionId { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int Score { get; set; } = 0;
}
```

---

### 🧩 Word Selection

```csharp
// Services/GameService.cs (word list excerpt)
private static readonly List<string> WordList = new()
{
    "elephant", "guitar", "volcano", "submarine", "butterfly",
    "telescope", "cactus", "tornado", "lighthouse", "penguin"
    // add more in Final Model
};

private static readonly Random Rng = new();

public string PickWord(List<string> usedWords)
{
    var available = WordList.Except(usedWords).ToList();
    if (!available.Any()) available = WordList; // reset if exhausted
    return available[Rng.Next(available.Count)];
}
```

---

### ⏱ Timer Logic

```csharp
// In GameService.cs
private Dictionary<string, Timer> _timers = new();
private const int TurnDurationSeconds = 60;

public void StartTurnTimer(string roomCode, Func<Task> onTimerEnd)
{
    int secondsLeft = TurnDurationSeconds;

    _timers[roomCode] = new Timer(async _ =>
    {
        secondsLeft--;
        await _hubContext.Clients.Group(roomCode)
                         .SendAsync("TimeUpdate", secondsLeft);

        if (secondsLeft <= 0)
        {
            _timers[roomCode].Dispose();
            await onTimerEnd(); // triggers NextTurn
        }
    }, null, 1000, 1000); // start after 1s, repeat every 1s
}
```

**GameHub methods to add:**
```csharp
public async Task StartGame(string roomCode)
{
    // pick first drawer, pick word, start timer
    await _gameService.StartGame(roomCode);
}

public async Task NextTurn(string roomCode)
{
    // rotate drawer index, pick new word, restart timer
    await _gameService.NextTurn(roomCode);
}
```

---

### 🔁 Testing Steps

1. Open 3 tabs, all join the same room
2. One player clicks **Start Game**
3. The drawer tab sees the actual word; other tabs see `_ _ _ _ _ _`
4. Watch timer count down from 60 in all tabs
5. At 0, verify the next player becomes drawer automatically
6. After all players have drawn once, verify round number increments

---

### ⚠️ Race Condition Risks

- **Timer fires after game ends** — always cancel (`Dispose()`) the timer when a turn ends manually (all guessed correctly), or you get a second `NextTurn` call
- **Two `StartGame` calls** — add a `GameStarted` flag to `GameState` and return early if already started
- **Player list mutation while timer reads it** — use `ConcurrentDictionary` and lock when modifying `Players`

---

---

## 🔴 PROTOTYPE v4 — Guessing + Scoring

### 📚 Topics To Learn Before This Phase

**.NET:**
- `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)` — case-insensitive comparison with `.Trim()`
- `lock` statement — when multiple concurrent guess messages arrive, only one should be processed as "first correct guesser"

**Angular:**
- `*ngIf` / conditional CSS classes — hide the actual word in chat when a correct guess is submitted
- `pipe: async` — subscribing to score streams in templates

**Concurrency:**
- Race condition: two players submit the correct answer at nearly the same moment — both shouldn't get "first guesser" bonus. Use `lock` around the correct-guess check.

---

### 🎯 Goal

When a player types the correct word, they earn points based on speed. The drawer earns points per correct guesser. When all non-drawers guess correctly, the turn ends early. After each turn, a leaderboard overlay appears for 3 seconds.

---

### 🧠 Score Calculation Logic

```
Guesser points  = max(10, 100 - secondsElapsed)
Drawer points   = 50 per correct guesser
```

So if the word is guessed in 10 seconds:
- Guesser earns: `100 - 10 = 90 pts`
- Drawer earns: `50 pts`

If guessed in 95 seconds (overtime edge): minimum `10 pts`.

---

### 🧩 Correct Guess Detection

```csharp
// In GameHub.SendMessage — modify existing method
public async Task SendMessage(string roomCode, string playerName, string message)
{
    if (!GameStates.TryGetValue(roomCode, out var state) || !state.GameStarted)
    {
        // Not in game — treat as normal chat
        await Clients.Group(roomCode).SendAsync("ReceiveMessage", playerName, message);
        return;
    }

    bool isCorrectGuess = message.Trim().Equals(state.CurrentWord, StringComparison.OrdinalIgnoreCase);
    bool alreadyGuessed = state.CorrectGuessers.Contains(playerName);
    bool isDrawer = state.CurrentDrawer.Name == playerName;

    if (isCorrectGuess && !alreadyGuessed && !isDrawer)
    {
        lock (state) // prevent race on simultaneous correct guesses
        {
            int secondsElapsed = (int)(DateTime.UtcNow - state.TurnStartTime).TotalSeconds;
            int guesserPoints = Math.Max(10, 100 - secondsElapsed);

            var guesser = state.Players.First(p => p.Name == playerName);
            guesser.Score += guesserPoints;
            state.CurrentDrawer.Score += 50;
            state.CorrectGuessers.Add(playerName);
        }

        // Broadcast success (don't show the actual word in chat)
        await Clients.Group(roomCode).SendAsync("CorrectGuess", playerName);

        // Check if all non-drawers have guessed
        int nonDrawers = state.Players.Count - 1;
        if (state.CorrectGuessers.Count >= nonDrawers)
            await _gameService.EndTurnEarly(roomCode);
    }
    else if (!isCorrectGuess)
    {
        // Normal chat message (wrong guess)
        await Clients.Group(roomCode).SendAsync("ReceiveMessage", playerName, message);
    }
    // If correct but already guessed — do nothing, don't leak the word
}
```

---

### 🔁 Testing Steps

1. Open 3 tabs, start game
2. Tab 1 is drawer — they can see the word. Tabs 2 & 3 see `_ _ _ _ _`
3. Tab 2 types a wrong guess → appears as normal chat in all tabs
4. Tab 2 types the correct word → all tabs see "✅ Player2 guessed correctly!" — word is NOT shown
5. Tab 3 also guesses correctly → turn ends early
6. Leaderboard appears for 3 seconds showing updated scores
7. Next turn begins with new drawer

---

### ⚠️ Concurrency & Cheating Risks

- **Double-award bug** — without `lock`, two simultaneous correct guesses can both add points. The `lock(state)` block prevents this.
- **Drawer guessing own word** — the `isDrawer` check blocks this
- **Already-guessed replay** — `alreadyGuessed` check prevents spamming the correct word for more points
- **Client-side word exposure** — NEVER send the real word to guessers via SignalR. Only the drawer's `connectionId` should receive it via `Clients.Client(drawerId)`

---

---

## 🏁 FINAL MODEL — Stability & Production Thinking

### 📚 Topics To Learn Before This Phase

**.NET:**
- `IHostedService` or `BackgroundService` — better alternative to raw `System.Threading.Timer` for production timers
- `ConcurrentDictionary` throughout — replace all `static Dictionary` + `lock` patterns
- `OnDisconnectedAsync(Exception? ex)` override in Hub — handle disconnects gracefully

**Angular:**
- `HubConnectionState` enum — check if connection is active before invoking methods
- Exponential backoff — retry with increasing delays: 0s, 2s, 10s, 30s
- `withAutomaticReconnect([0, 2000, 10000, 30000])` — built-in SignalR reconnect config

**Architecture:**
- SignalR Backplane (Azure SignalR Service or Redis) — only needed when scaling to multiple server instances

---

### 🎯 Goal

A stable, edge-case-handled version that survives real multiplayer scenarios: players dropping mid-game, browsers refreshing, rooms going empty, and games needing replay.

---

### 🔒 Thread Safety Improvements

Replace all `static Dictionary` with `ConcurrentDictionary`:

```csharp
// Before (unsafe under concurrency)
private static Dictionary<string, GameState> GameStates = new();

// After (thread-safe)
private static ConcurrentDictionary<string, GameState> GameStates = new();
```

Use `Interlocked` for counters, `lock` only for multi-step read-modify-write operations.

---

### ♻️ Room Cleanup

Override `OnDisconnectedAsync` in `GameHub`:

```csharp
public override async Task OnDisconnectedAsync(Exception? exception)
{
    // Find which room this connection belongs to
    if (ConnectionRoomMap.TryRemove(Context.ConnectionId, out var roomCode))
    {
        if (GameStates.TryGetValue(roomCode, out var state))
        {
            var player = state.Players.FirstOrDefault(p => p.ConnectionId == Context.ConnectionId);
            if (player != null)
            {
                state.Players.Remove(player);
                await Clients.Group(roomCode).SendAsync("PlayerLeft", player.Name);

                // If drawer left, skip to next turn
                if (state.CurrentDrawer?.ConnectionId == Context.ConnectionId)
                    await _gameService.EndTurnEarly(roomCode);

                // If room is now empty, clean it up
                if (state.Players.Count == 0)
                {
                    GameStates.TryRemove(roomCode, out _);
                    _gameService.CancelTimer(roomCode);
                }
            }
        }
    }

    await base.OnDisconnectedAsync(exception);
}
```

---

### 🔁 Reconnection Handling (Angular)

```typescript
// In signalr.service.ts
private connection = new signalR.HubConnectionBuilder()
  .withUrl('http://localhost:5000/game-hub')
  .withAutomaticReconnect([0, 2000, 10000, 30000]) // retry after 0s, 2s, 10s, 30s
  .build();

constructor() {
  this.connection.onreconnecting(() => {
    console.warn('SignalR: Reconnecting...');
    // show "Reconnecting..." banner in UI
  });

  this.connection.onreconnected(async () => {
    console.log('SignalR: Reconnected');
    // re-join the room using stored roomCode + playerName
    const { roomCode, playerName } = this.getStoredSession();
    if (roomCode && playerName)
      await this.connection.invoke('RejoinRoom', roomCode, playerName);
  });
}
```

---

### 🚀 Scaling Discussion (Brief)

Your current setup runs on **one server**. SignalR Groups are in-memory on that server. If you scale to two servers, a player on Server A can't receive messages from a player on Server B because their Groups are separate.

**The fix is a SignalR Backplane** — a shared message bus all servers publish to and subscribe from.

Two options:

- **Azure SignalR Service** — easiest; replace `AddSignalR()` with `AddAzureSignalR(connectionString)`
- **Redis Backplane** — self-hosted; `AddSignalR().AddStackExchangeRedis(connectionString)`

You don't need this until you deploy to multiple servers. For a single-server deployment, your in-memory setup is fine.

---

### 🎨 UI Polish Checklist (Final Steps)

```
□ Responsive layout: canvas left, chat + player list right
□ Drawing toolbar: color picker, brush sizes (3/6/12px), eraser, clear button
□ Animated word reveal between turns (show letters one by one)
□ "It's [Player]'s turn to draw!" banner
□ End game screen: final scores, Play Again button
□ TailwindCSS for all styling
□ Canvas clears automatically on new turn
□ Mobile touch events (touchstart, touchmove, touchend)
```

### 🧪 Final QA Checklist

```
□ 3+ players in same room all see the same canvas
□ Players in different rooms cannot see each other
□ Turn rotation: each player draws once per round
□ Score calculation: faster guess = more points
□ Drawer points increase per correct guesser
□ Timer resets correctly on new turn
□ Disconnect mid-game: game continues without the player
□ Drawer disconnect: turn skips to next player
□ Room auto-cleans when last player leaves
□ Refresh tab: can rejoin game in progress
□ No duplicate room codes possible
```

---

---

# 📍 CONTEXT ANCHOR

## Current System Capability (after reading this guide)

- You understand the full vertical slice: `mouse event → SignalR → Hub → broadcast → canvas render`
- You know how to build and test each of the 5 phases independently
- You understand what files belong to backend vs frontend and why
- You know which concurrency risks exist at each phase and how to mitigate them
- You understand that in-memory state is fine for prototypes and when/why to migrate away

## What Is Intentionally Missing From This Guide

- Database persistence (rooms/scores reset on server restart)
- Authentication / player accounts
- Word selection with 3-choice picker for drawer
- Spectator mode for joining mid-game
- Mobile-first UI and touch drawing
- Production deployment config (Docker, reverse proxy)

## What Your Repo Already Has

Based on the repo structure (`scribble-client` + `scribble.API`, TypeScript + C#), your scaffold is in place. Your next steps are to verify:

1. `Program.cs` has SignalR and CORS correctly configured
2. `GameHub.cs` exists in `scribble.API/Hubs/` ✅ (confirmed — you already have this)
3. `@microsoft/signalr` is in `package.json`
4. A `SignalrService` exists and is injected into your canvas component

---

## 🔄 Continuation Instructions

When you say **"Continue to next prototype"**, the response will:

1. Summarize current state in 5 bullets
2. Continue only the next logical phase
3. Never restart architecture explanation
4. Always deliver a runnable slice (backend change + frontend change together)

---

> 💡 **Key Reminder:** Always test with 3+ browser tabs simultaneously. Two tabs catch most bugs, but the third reveals the multi-player edge cases (especially in scoring and turn rotation) that two tabs hide.
