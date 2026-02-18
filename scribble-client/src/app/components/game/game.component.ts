import { Component, OnInit, ViewChild, ElementRef, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { SignalrService, Player, ChatMessage, DrawingData } from '../../services/signalr.service'

@Component({
  selector: 'app-game',
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css']
})
export class GameComponent implements OnInit, OnDestroy {
  // Get reference to canvas element
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  
  // Canvas context for drawing
  private ctx!: CanvasRenderingContext2D;
  
  // Drawing state
  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;

  // Game state
  roomCode: string = '';
  username: string = '';
  players: Player[] = [];
  chatMessages: ChatMessage[] = [];
  currentMessage: string = '';
  
  // Round info
  isMyTurn = false;
  currentWord: string = '';
  maskedWord: string = '';
  currentDrawer: string = '';
  
  // Game flow
  gameStarted = false;
  roundEnded = false;
  roundEndData: any = null;
  
  // Drawing tools
  selectedColor: string = '#000000';
  selectedLineWidth: number = 2;
  
  colors = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', 
            '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080'];
  lineWidths = [2, 5, 10, 15];

  // Timer
  timeRemaining: number = 0;
  private timerInterval: any;

  constructor(
    private signalrService: SignalrService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    // Get room info from localStorage (set in lobby)
    this.roomCode = localStorage.getItem('roomCode') || '';
    this.username = localStorage.getItem('username') || '';

    // If no room info, redirect to lobby
    if (!this.roomCode || !this.username) {
      this.router.navigate(['/']);
      return;
    }

    // Initialize canvas and subscriptions
    this.setupCanvas();
    this.setupSubscriptions();
  }

  ngOnDestroy(): void {
    // Clean up timer when component is destroyed
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  /**
   * Initialize canvas
   */
  private setupCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    
    // Set line style
    this.ctx.lineCap = 'round';   // Rounded line ends
    this.ctx.lineJoin = 'round';  // Rounded corners
  }

  /**
   * Subscribe to all SignalR events
   */
  private setupSubscriptions(): void {
    // Player joined
    this.signalrService.playerJoined$.subscribe((data) => {
      this.players = data.players;
      this.addSystemMessage(`${data.newPlayer.username} joined the game`);
    });

    // Player left
    this.signalrService.playerLeft$.subscribe((data) => {
      this.players = data.players;
      this.addSystemMessage(`${data.leftPlayer.username} left the game`);
    });

    // Scores updated
    this.signalrService.playersUpdated$.subscribe((players) => {
      this.players = players;
    });

    // Round started (for guessers)
    this.signalrService.roundStarted$.subscribe((data) => {
      this.gameStarted = true;
      this.roundEnded = false;
      this.isMyTurn = false;
      this.currentDrawer = data.drawer;
      this.maskedWord = data.maskedWord;
      this.timeRemaining = data.roundDuration;
      this.startTimer();
      this.addSystemMessage(`${data.drawer} is drawing!`);
    });

    // Your turn to draw
    this.signalrService.yourTurnToDraw$.subscribe((data) => {
      this.gameStarted = true;
      this.roundEnded = false;
      this.isMyTurn = true;
      this.currentWord = data.word;
      this.timeRemaining = data.roundDuration;
      this.startTimer();
      this.addSystemMessage(`Your turn! Draw: ${data.word}`);
    });

    // Receive drawing data
    this.signalrService.receiveDrawing$.subscribe((data) => {
      this.drawOnCanvas(data);
    });

    // Receive chat message
    this.signalrService.receiveMessage$.subscribe((message) => {
      this.chatMessages.push(message);
      this.scrollChatToBottom();
    });

    // Correct guess
    this.signalrService.correctGuess$.subscribe((data) => {
      // Player list will be updated via playersUpdated$
    });

    // Round ended
    this.signalrService.roundEnded$.subscribe((data) => {
      this.roundEnded = true;
      this.roundEndData = data;
      this.isMyTurn = false;
      this.stopTimer();
      this.addSystemMessage(`Round ended! The word was: ${data.word}`);
    });

    // Clear canvas
    this.signalrService.clearCanvas$.subscribe(() => {
      this.clearCanvas();
    });

    // Errors
    this.signalrService.error$.subscribe((error) => {
      alert(error);
    });
  }

  /**
   * Start countdown timer
   */
  private startTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    this.timerInterval = setInterval(() => {
      this.timeRemaining--;
      if (this.timeRemaining <= 0) {
        this.stopTimer();
        if (this.isMyTurn) {
          this.endRound();
        }
      }
    }, 1000);  // Update every second
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  /**
   * Start the game
   */
  async startGame(): Promise<void> {
    await this.signalrService.startGame(this.roomCode);
  }

  /**
   * End current round
   */
  async endRound(): Promise<void> {
    await this.signalrService.endRound(this.roomCode);
  }

  /**
   * Start next round
   */
  async nextRound(): Promise<void> {
    await this.signalrService.nextRound(this.roomCode);
  }

  /**
   * Mouse down - start drawing
   */
  onMouseDown(event: MouseEvent): void {
    if (!this.isMyTurn) return;
    
    this.isDrawing = true;
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.lastX = event.clientX - rect.left;
    this.lastY = event.clientY - rect.top;
  }

  /**
   * Mouse move - draw line
   */
  onMouseMove(event: MouseEvent): void {
    if (!this.isDrawing || !this.isMyTurn) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Create drawing data
    const drawingData: DrawingData = {
      x: x,
      y: y,
      prevX: this.lastX,
      prevY: this.lastY,
      color: this.selectedColor,
      lineWidth: this.selectedLineWidth,
      action: 'draw'
    };

    // Draw on own canvas
    this.drawOnCanvas(drawingData);
    
    // Send to other players
    this.signalrService.sendDrawing(this.roomCode, drawingData);

    // Update last position
    this.lastX = x;
    this.lastY = y;
  }

  /**
   * Mouse up - stop drawing
   */
  onMouseUp(): void {
    this.isDrawing = false;
  }

  /**
   * Mouse leave - stop drawing
   */
  onMouseLeave(): void {
    this.isDrawing = false;
  }

  /**
   * Draw line on canvas
   */
  private drawOnCanvas(data: DrawingData): void {
    this.ctx.strokeStyle = data.color;
    this.ctx.lineWidth = data.lineWidth;
    
    this.ctx.beginPath();
    this.ctx.moveTo(data.prevX, data.prevY);
    this.ctx.lineTo(data.x, data.y);
    this.ctx.stroke();
  }

  /**
   * Clear canvas
   */
  clearCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /**
   * Clear canvas button click
   */
  async clearCanvasClick(): Promise<void> {
    if (!this.isMyTurn) return;
    this.clearCanvas();
    await this.signalrService.clearCanvas(this.roomCode);
  }

  /**
   * Select color
   */
  selectColor(color: string): void {
    this.selectedColor = color;
  }

  /**
   * Select brush size
   */
  selectLineWidth(width: number): void {
    this.selectedLineWidth = width;
  }

  /**
   * Send chat message
   */
  async sendMessage(): Promise<void> {
    if (!this.currentMessage.trim()) return;

    await this.signalrService.sendMessage(this.roomCode, this.currentMessage);
    this.currentMessage = '';
  }

  /**
   * Add system message to chat
   */
  private addSystemMessage(message: string): void {
    this.chatMessages.push({
      username: 'System',
      message: message,
      timestamp: new Date(),
      isSystemMessage: true,
      isCorrectGuess: false
    });
    this.scrollChatToBottom();
  }

  /**
   * Scroll chat to bottom
   */
  private scrollChatToBottom(): void {
    setTimeout(() => {
      const chatBox = document.querySelector('.chat-messages');
      if (chatBox) {
        chatBox.scrollTop = chatBox.scrollHeight;
      }
    }, 100);
  }

  /**
   * Copy room code to clipboard
   */
  copyRoomCode(): void {
    navigator.clipboard.writeText(this.roomCode);
    alert('Room code copied to clipboard!');
  }

  /**
   * Leave room
   */
  leaveRoom(): void {
    if (confirm('Are you sure you want to leave?')) {
      this.signalrService.disconnect();
      localStorage.removeItem('roomCode');
      localStorage.removeItem('username');
      this.router.navigate(['/']);
    }
  }

  /**
   * Get players sorted by score
   */
  getPlayersSorted(): Player[] {
    return [...this.players].sort((a, b) => b.score - a.score);
  }
}