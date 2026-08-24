import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

export interface WSMessage {
  type: 
    | 'SUBSCRIBE' 
    | 'UNSUBSCRIBE' 
    | 'SCORE_UPDATED' 
    | 'MATCH_STATUS_CHANGED' 
    | 'BREAK_AD_ROTATION' 
    | 'SCOREBOARD_AD_POPUP'
    | 'SCOREBOARD_AD_SETTINGS_CHANGED'
    | 'EMERGENCY_ANNOUNCEMENT' 
    | 'PLAYER_ON_HAMMER'
    | 'BID_PLACED'
    | 'PLAYER_SOLD'
    | 'PLAYER_UNSOLD'
    | 'ACCELERATED_ROUND_STARTED'
    | 'PING' 
    | 'PONG'
    | string;
  room?: string;
  payload?: any;
}

class WebSocketHub {
  private wss: WebSocketServer | null = null;
  private clientRooms: Map<WebSocket, Set<string>> = new Map();

  public init(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clientRooms.set(ws, new Set());

      ws.on('message', (messageRaw: string) => {
        try {
          const data: WSMessage = JSON.parse(messageRaw.toString());
          this.handleMessage(ws, data);
        } catch (err) {
          console.error('Invalid WebSocket JSON received:', err);
        }
      });

      ws.on('close', () => {
        this.clientRooms.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('WebSocket client error:', err);
      });

      // Send initial welcome
      ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Connected to Antigravity Real-Time Sports Gateway' }));
    });

    console.log('⚡ WebSocket server attached to /ws');
  }

  private handleMessage(ws: WebSocket, msg: WSMessage) {
    const rooms = this.clientRooms.get(ws);
    if (!rooms) return;

    if (msg.type === 'SUBSCRIBE' && msg.room) {
      rooms.add(msg.room);
      ws.send(JSON.stringify({ type: 'SUBSCRIBED', room: msg.room }));
    } else if (msg.type === 'UNSUBSCRIBE' && msg.room) {
      rooms.delete(msg.room);
      ws.send(JSON.stringify({ type: 'UNSUBSCRIBED', room: msg.room }));
    } else if (msg.type === 'PING') {
      ws.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
    }
  }

  /**
   * Broadcast message to all clients subscribed to a specific room
   */
  public broadcastToRoom(room: string, type: WSMessage['type'], payload: any) {
    if (!this.wss) return;
    const msgString = JSON.stringify({ type, room, payload, timestamp: Date.now() });

    this.clientRooms.forEach((rooms, client) => {
      if (rooms.has(room) && client.readyState === WebSocket.OPEN) {
        client.send(msgString);
      }
    });
  }

  /**
   * Global broadcast to all connected clients
   */
  public broadcastGlobal(type: WSMessage['type'], payload: any) {
    if (!this.wss) return;
    const msgString = JSON.stringify({ type, payload, timestamp: Date.now() });

    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msgString);
      }
    });
  }
}

export const wsHub = new WebSocketHub();
