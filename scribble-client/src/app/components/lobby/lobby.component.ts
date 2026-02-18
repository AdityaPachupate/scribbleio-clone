import { Component, OnInit } from '@angular/core';
import { SignalrService } from '../../services/signalr.service';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule,FormsModule],
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.css',
})
export class LobbyComponent implements OnInit {
  username: string = '';
  roomCode: string = '';

  // Loading states
  isCreating: boolean = false;
  isJoining: boolean = false;
  errorMessage: string = '';
  isConnecting: boolean = false;

  constructor(
    private signalrService: SignalrService,
    private router: Router,
  ) {}

  async ngOnInit(): Promise<void> {
    this.setupSubscriptions();

    this.isConnecting = true;
    try {
      this.signalrService.startConnection();
      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;
      this.errorMessage =
        'Failed to connect to server. Please refresh the page.';
    }
  }

  private setupSubscriptions(): void {
    // After room is created
    this.signalrService.roomCreated$.subscribe((data) => {
      console.log('Room created:', data);
      localStorage.setItem('roomCode', data.roomCode);
      localStorage.setItem('username', this.username);
      this.isCreating = false;
      // Navigate to game
      this.router.navigate(['/game']);
    });

    // After player joins
    this.signalrService.playerJoined$.subscribe((data) => {
      console.log('Player joined:', data);
      localStorage.setItem('roomCode', this.roomCode);
      localStorage.setItem('username', this.username);
      this.isJoining = false;
      // Navigate to game
      this.router.navigate(['/game']);
    });

    // Handle errors
    this.signalrService.error$.subscribe((error) => {
      console.error('SignalR error:', error);
      this.errorMessage = error;
      this.isCreating = false;
      this.isJoining = false;
    });
  }

  async createRoom(): Promise<void> {
    if (!this.username.trim()) {
      this.errorMessage = 'Please enter a username';
      return;
    }

    this.errorMessage = '';
    this.isCreating = true;

    try {
      await this.signalrService.createRoom(this.username);
      // Navigate after successful invoke
      // (subscription will handle the final navigation)
    } catch (error) {
      this.errorMessage = 'Failed to create room';
      this.isCreating = false;
    }
  }

  /**
   * Join existing room
   */
  async joinRoom(): Promise<void> {
    if (!this.username.trim()) {
      this.errorMessage = 'Please enter a username';
      return;
    }

    if (!this.roomCode.trim()) {
      this.errorMessage = 'Please enter a room code';
      return;
    }

    this.errorMessage = '';
    this.isJoining = true;

    try {
      await this.signalrService.joinRoom(this.roomCode.toUpperCase(), this.username);
      // Navigation will happen via playerJoined$ subscription
    } catch (error) {
      this.errorMessage = 'Failed to join room';
      this.isJoining = false;
    }
  }
}
