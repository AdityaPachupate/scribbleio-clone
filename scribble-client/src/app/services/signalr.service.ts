import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

// Define interfaces for type safety
export interface Player {
  connectionId: string;
  username: string;
  score: number;
  isDrawing: boolean;
  hasGuessedCorrectly: boolean;
}

export interface ChatMessage {
  username: string;
  message: string;
  timestamp: Date;
  isSystemMessage: boolean;
  isCorrectGuess: boolean;
}

export interface DrawingData {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  color: string;
  lineWidth: number;
  action: string;
}

@Injectable({
  providedIn: 'root'  // Singleton service
})
export class SignalrService {
  // SignalR connection instance
  private hubConnection!: signalR.HubConnection;

  // Observables for real-time events
  // Think of these as event emitters that components can subscribe to
  public roomCreated$ = new Subject<any>();
  public playerJoined$ = new Subject<any>();
  public playerLeft$ = new Subject<any>();
  public playersUpdated$ = new Subject<Player[]>();
  public receiveDrawing$ = new Subject<DrawingData>();
  public receiveMessage$ = new Subject<ChatMessage>();
  public roundStarted$ = new Subject<any>();
  public yourTurnToDraw$ = new Subject<any>();
  public correctGuess$ = new Subject<any>();
  public roundEnded$ = new Subject<any>();
  public clearCanvas$ = new Subject<void>();
  public error$ = new Subject<string>();

  constructor() {}

  async startConnection(): Promise<void> {
    // Build connection
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:5001/gamehub', {
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | 
                   signalR.HttpTransportType.ServerSentEvents
      })
      .withAutomaticReconnect()  // Auto-reconnect on disconnect
      .build();

    // Set up event listeners
    this.setupEventListeners();

    try {
      // Actually connect
      await this.hubConnection.start();
      console.log('SignalR Connected');
    } catch (err) {
      console.error('Error connecting to SignalR:', err);
      throw err;
    }
  }


  private setupEventListeners(): void {
    // When server sends "RoomCreated" event
    this.hubConnection.on('RoomCreated', (data) => {
      this.roomCreated$.next(data);
    });

    // When server sends "PlayerJoined" event
    this.hubConnection.on('PlayerJoined', (data) => {
      this.playerJoined$.next(data);
    });

    // ... and so on for all events
    this.hubConnection.on('PlayerLeft', (data) => {
      this.playerLeft$.next(data);
    });

    this.hubConnection.on('PlayersUpdated', (players) => {
      this.playersUpdated$.next(players);
    });

    this.hubConnection.on('ReceiveDrawing', (data) => {
      this.receiveDrawing$.next(data);
    });

    this.hubConnection.on('ReceiveMessage', (message) => {
      this.receiveMessage$.next(message);
    });

    this.hubConnection.on('RoundStarted', (data) => {
      this.roundStarted$.next(data);
    });

    this.hubConnection.on('YourTurnToDraw', (data) => {
      this.yourTurnToDraw$.next(data);
    });

    this.hubConnection.on('CorrectGuess', (data) => {
      this.correctGuess$.next(data);
    });

    this.hubConnection.on('RoundEnded', (data) => {
      this.roundEnded$.next(data);
    });

    this.hubConnection.on('ClearCanvas', () => {
      this.clearCanvas$.next();
    });

    this.hubConnection.on('Error', (message) => {
      this.error$.next(message);
    });
  }


  async createRoom(username: string): Promise<void> {
    await this.hubConnection.invoke('CreateRoom', username);
  }

  async joinRoom(roomCode: string, username: string): Promise<void> {
    await this.hubConnection.invoke('JoinRoom', roomCode, username);
  }

  async startGame(roomCode: string): Promise<void> {
    await this.hubConnection.invoke('StartGame', roomCode);
  }

  async sendDrawing(roomCode: string, data: DrawingData): Promise<void> {
    await this.hubConnection.invoke('SendDrawing', roomCode, data);
  }

  async sendMessage(roomCode: string, message: string): Promise<void> {
    await this.hubConnection.invoke('SendMessage', roomCode, message);
  }

  async endRound(roomCode: string): Promise<void> {
    await this.hubConnection.invoke('EndRound', roomCode);
  }

  async nextRound(roomCode: string): Promise<void> {
    await this.hubConnection.invoke('NextRound', roomCode);
  }

  async clearCanvas(roomCode: string): Promise<void> {
    await this.hubConnection.invoke('ClearCanvas', roomCode);
  }

  async disconnect(): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.stop();
    }
  }
}