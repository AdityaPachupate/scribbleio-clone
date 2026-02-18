import { Component, OnInit, OnDestroy, AfterViewInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
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
  roundEndData: any = null;

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
  private lastX: number = 0;
  private lastY: number = 0;

  constructor(
    private signalrService: SignalrService,
    private router: Router,
    private cdr: ChangeDetectorRef  // Add this
  ) {}

  async ngOnInit(): Promise<void> {
    this.roomCode = localStorage.getItem('roomCode') || '';
    this.username = localStorage.getItem('username') || '';

    if (!this.roomCode || !this.username) {
      this.router.navigate(['/']);
      return;
    }

    // Setup subscriptions BEFORE setupCanvas (canvas ref may not exist yet)
    this.setupSubscriptions();
  }

  ngAfterViewInit(): void {
    // Canvas ref is now available
    this.setupCanvas();
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
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
    // Player joined
    this.signalrService.playerJoined$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        console.log('Player joined:', data);
        this.players = data.players || [];
        this.cdr.markForCheck();  // ✅ Force update
      });

    // Players updated
    this.signalrService.playersUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((players) => {
        console.log('Players updated:', players);
        this.players = players;
        this.cdr.markForCheck();  // ✅ Force update
      });

    // Player left
    this.signalrService.playerLeft$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        console.log('Player left:', data);
        this.players = data.players || [];
        this.cdr.markForCheck();  // ✅ Force update
      });

    // Receive drawing
    this.signalrService.receiveDrawing$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (this.ctx) {
          this.ctx.strokeStyle = data.color;
          this.ctx.lineWidth = data.lineWidth;
          this.drawLine(data.prevX, data.prevY, data.x, data.y);
        }
      });

    // Receive message
    this.signalrService.receiveMessage$
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg) => {
        console.log('Message received:', msg);
        this.chatMessages.push(msg);
      });

    // Round started
    this.signalrService.roundStarted$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        console.log('Round started:', data);
        this.gameStarted = true;
        this.roundEnded = false;
        this.currentDrawer = data.drawer;
        this.isMyTurn = false;
        this.maskedWord = data.maskedWord;
        this.startTimer();
      });

    // Your turn to draw
    this.signalrService.yourTurnToDraw$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        console.log('Your turn to draw:', data);
        this.isMyTurn = true;
        this.currentWord = data.word;
        this.gameStarted = true;
      });

    // Correct guess
    this.signalrService.correctGuess$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        console.log('Correct guess:', data);
        this.chatMessages.push({
          username: 'System',
          message: `${data.username} guessed correctly!`,
          timestamp: new Date(),
          isSystemMessage: true,
          isCorrectGuess: true
        });
      });

    // Round ended
    this.signalrService.roundEnded$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        console.log('Round ended:', data);
        this.roundEnded = true;
        this.roundEndData = data;
        this.gameStarted = false;
        this.isMyTurn = false;
      });

    // Clear canvas
    this.signalrService.clearCanvas$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (this.ctx) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
      });

    // Error
    this.signalrService.error$
      .pipe(takeUntil(this.destroy$))
      .subscribe((error) => {
        console.error('SignalR error:', error);
      });
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
      if (this.timeRemaining <= 0) {  // ✅ Added opening parenthesis
        clearInterval(this.timerInterval);
      }
    }, 1000);
  }
}