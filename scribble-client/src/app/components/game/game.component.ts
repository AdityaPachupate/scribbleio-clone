import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SignalrService, DrawingData, ChatMessage, Player } from '../../services/signalr.service';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './game.component.html',
  styleUrls: ['./game.component.css']
})
export class GameComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('chatMessagesContainer') chatMessagesContainer!: ElementRef;

  // Game state
  roomCode: string = '';
  username: string = '';
  players: Player[] = [];
  chatMessages: ChatMessage[] = [];
  currentMessage: string = '';
  gameStarted: boolean = false;
  roundEnded: boolean = false;
  isMyTurn: boolean = false;
  currentWord: string = '';
  maskedWord: string = '';
  currentDrawer: string = '';
  timeRemaining: number = 80;
  roundNumber: number = 0;
  roundEndData: any = null;
  nextRoundCountdown: number = 0;  // ✅ Countdown before next round auto-starts

  // Drawing tools
  colors: string[] = ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500'];
  lineWidths: number[] = [2, 4, 6, 8, 12];
  selectedColor: string = '#000000';
  selectedLineWidth: number = 2;

  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private isDrawing = false;
  private destroy$ = new Subject<void>();
  private timerInterval: any;
  private nextRoundInterval: any;  // ✅ Countdown interval between rounds
  private lastX: number = 0;
  private lastY: number = 0;

  constructor(
    private signalrService: SignalrService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone  // ✅ Inject NgZone
  ) { }

  async ngOnInit(): Promise<void> {
    this.roomCode = (localStorage.getItem('roomCode') || '').toUpperCase();
    this.username = localStorage.getItem('username') || '';

    if (!this.roomCode || !this.username) {
      this.router.navigate(['/']);
      return;
    }

    if (!this.roomCode || !this.username) {
      this.router.navigate(['/']);
      return;
    }

    // Setup subscriptions BEFORE setupCanvas
    this.setupSubscriptions();

    // Always call joinRoom (it's idempotent) to ensure the player is in the group 
    // and receives the initial state (players, chat history).
    try {
      if (!this.signalrService.isConnected) {
        await this.signalrService.startConnection();
      }
      await this.signalrService.joinRoom(this.roomCode, this.username);
    } catch (err) {
      console.error('Error connecting/syncing:', err);
      // Optional: Show error to user or navigate back
    }
  }

  ngAfterViewInit(): void {
    // Canvas ref is now available
    this.setupCanvas();
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    if (this.nextRoundInterval) {
      clearInterval(this.nextRoundInterval);  // ✅ Clean up countdown
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupCanvas(): void {
    try {
      this.canvas = this.canvasRef.nativeElement;
      this.ctx = this.canvas.getContext('2d')!;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.lineWidth = this.selectedLineWidth;
      this.ctx.strokeStyle = this.selectedColor;
      console.log('Canvas initialized');
    } catch (err) {
      console.error('Error initializing canvas:', err);
    }
  }

  private setupSubscriptions(): void {
    // Player joined (handles sync on rejoin/refresh)
    this.signalrService.playerJoined$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.ngZone.run(() => {
          console.log('Player joined/synced:', data);
          this.players = data.players || [];

          // ✅ Sync full game state (mid-game join/refresh)
          this.gameStarted = data.gameStarted || false;
          this.roundEnded = data.roundEnded || false;
          this.currentDrawer = data.currentDrawer || '';
          this.maskedWord = data.maskedWord || '';
          this.roundNumber = data.roundNumber || 1;

          // ✅ Sync chat history if provided
          if (data.chatHistory) {
            this.chatMessages = data.chatHistory.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            }));
            this.scrollToBottom();
          }
          this.cdr.detectChanges();
        });
      });

    // Players updated
    this.signalrService.playersUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((players) => {
        this.ngZone.run(() => {
          console.log('Players updated:', players);
          this.players = players;
          this.cdr.detectChanges();
        });
      });

    // Player left
    this.signalrService.playerLeft$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.ngZone.run(() => {
          console.log('Player left:', data);
          this.players = data.players || [];
          this.cdr.detectChanges();
        });
      });

    // Receive drawing
    this.signalrService.receiveDrawing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.ngZone.run(() => {
          if (this.ctx) {
            this.ctx.strokeStyle = data.color;
            this.ctx.lineWidth = data.lineWidth;
            this.drawLine(data.prevX, data.prevY, data.x, data.y);
          }
        });
      });

    // Receive message
    this.signalrService.receiveMessage$
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg) => {
        this.ngZone.run(() => {
          console.log('Message received:', msg);
          this.chatMessages.push(msg);
          this.cdr.detectChanges();
          this.scrollToBottom();
        });
      });

    // Round started
    this.signalrService.roundStarted$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.ngZone.run(() => {
          console.log('Round started:', data);
          this.gameStarted = true;
          this.roundEnded = false;
          this.currentDrawer = data.drawer;
          this.isMyTurn = false;
          this.maskedWord = data.maskedWord;
          this.roundNumber = data.roundNumber || this.roundNumber + 1;
          this.startTimer();
          this.cdr.detectChanges();
        });
      });

    // Your turn to draw
    this.signalrService.yourTurnToDraw$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.ngZone.run(() => {
          console.log('Your turn to draw:', data);
          this.isMyTurn = true;
          this.currentWord = data.word;
          this.gameStarted = true;
          this.roundEnded = false;
          this.roundNumber = data.roundNumber || this.roundNumber + 1;
          this.startTimer();
          this.cdr.detectChanges();
        });
      });

    // Correct guess
    this.signalrService.correctGuess$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.ngZone.run(() => {
          console.log('Correct guess:', data);
          const player = this.players.find(p => p.username === data.username);
          if (player) {
            player.score = data.score;
            player.hasGuessedCorrectly = true;
          }
          this.cdr.detectChanges();
          this.scrollToBottom();
        });
      });

    // Round ended
    this.signalrService.roundEnded$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.ngZone.run(() => {
          console.log('Round ended:', data);
          this.roundEnded = true;
          this.roundEndData = data;
          this.gameStarted = false;
          this.isMyTurn = false;
          if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
          }
          this.nextRoundCountdown = 5;
          if (this.nextRoundInterval) clearInterval(this.nextRoundInterval);
          this.nextRoundInterval = setInterval(() => {
            this.ngZone.run(() => {
              this.nextRoundCountdown--;
              this.cdr.detectChanges();
              if (this.nextRoundCountdown <= 0) {
                clearInterval(this.nextRoundInterval);
                this.nextRoundInterval = null;
                this.signalrService.nextRound(this.roomCode)
                  .catch(err => console.error('Error starting next round:', err));
              }
            });
          }, 1000);
          this.cdr.detectChanges();
        });
      });

    // Clear canvas
    this.signalrService.clearCanvas$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.ngZone.run(() => {
          if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
          }
        });
      });

    // Error
    this.signalrService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe((error) => {
        this.ngZone.run(() => {
          console.error('SignalR error:', error);
        });
      });
  }

  get isHost(): boolean {
    const me = this.players.find(p => p.username === this.username);
    return me?.isHost || false;
  }

  get hostName(): string {
    const host = this.players.find(p => p.isHost);
    return host?.username || 'Unknown';
  }

  async startGame(): Promise<void> {
    await this.signalrService.startGame(this.roomCode);
  }

  onMouseDown(event: MouseEvent): void {
    if (!this.isMyTurn || !this.canvas) return;
    this.isDrawing = true;
    const rect = this.canvas.getBoundingClientRect();
    this.lastX = event.clientX - rect.left;
    this.lastY = event.clientY - rect.top;
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.isDrawing || !this.isMyTurn || !this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    this.drawLine(this.lastX, this.lastY, x, y);

    this.signalrService.sendDrawing(this.roomCode, {
      x,
      y,
      prevX: this.lastX,
      prevY: this.lastY,
      color: this.selectedColor,
      lineWidth: this.selectedLineWidth,
      action: 'draw'
    }).catch(err => console.error('Error sending drawing:', err));

    this.lastX = x;
    this.lastY = y;
  }

  onMouseUp(): void {
    this.isDrawing = false;
  }

  onMouseLeave(): void {
    this.isDrawing = false;
  }

  private drawLine(fromX: number, fromY: number, toX: number, toY: number): void {
    if (!this.ctx) return;
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.stroke();
  }

  selectColor(color: string): void {
    this.selectedColor = color;
    if (this.ctx) {
      this.ctx.strokeStyle = color;
    }
  }

  selectLineWidth(width: number): void {
    this.selectedLineWidth = width;
    if (this.ctx) {
      this.ctx.lineWidth = width;
    }
  }

  clearCanvasClick(): void {
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.signalrService.clearCanvas(this.roomCode).catch(err => console.error('Error clearing canvas:', err));
  }

  async sendMessage(): Promise<void> {
    if (!this.currentMessage.trim()) return;
    await this.signalrService.sendMessage(this.roomCode, this.currentMessage);
    this.currentMessage = '';
  }

  async leaveRoom(): Promise<void> {
    await this.signalrService.disconnect();
    this.router.navigate(['/']);
  }

  async nextRound(): Promise<void> {
    await this.signalrService.nextRound(this.roomCode);
  }

  getPlayersSorted(): Player[] {
    return [...this.players].sort((a, b) => b.score - a.score);
  }

  private startTimer(): void {
    this.timeRemaining = 80;
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.timeRemaining--;
      this.cdr.markForCheck();  // ✅ Update timer display every second
      if (this.timeRemaining <= 0) {
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        // ✅ Only the drawer ends the round to avoid duplicate calls
        if (this.isMyTurn) {
          this.signalrService.endRound(this.roomCode)
            .catch(err => console.error('Error ending round:', err));
        }
      }
    }, 1000);
  }

  private scrollToBottom(): void {
    try {
      setTimeout(() => {
        if (this.chatMessagesContainer) {
          this.chatMessagesContainer.nativeElement.scrollTop =
            this.chatMessagesContainer.nativeElement.scrollHeight;
        }
      }, 50);
    } catch (err) { }
  }
}