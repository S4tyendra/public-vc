# LanCall - WebRTC Video Chat Application

A real-time video chat application built with Go (Fiber), WebRTC, and MongoDB. LanCall allows users to create and join video chat rooms with features like text chat, audio/video controls, and admin moderation.

## Features

- 🎥 **Real-time Video Chat** - WebRTC-powered peer-to-peer video communication
- 💬 **Text Chat** - Real-time messaging within rooms
- 🏠 **Public & Private Rooms** - Create public rooms or private invitation-only rooms
- 👑 **Admin Controls** - Room creators can mute/unmute participants
- 🎵 **Audio/Video Controls** - Toggle your microphone and camera
- 📱 **Responsive Design** - Works on desktop and mobile browsers
- 🔒 **HTTPS/WSS Support** - Secure connections with TLS certificates

## Technology Stack

- **Backend**: Go with Fiber framework
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Database**: MongoDB
- **Real-time Communication**: WebSockets + WebRTC
- **Containerization**: Docker & Docker Compose

## Prerequisites

- Docker and Docker Compose
- TLS certificates (for HTTPS/WebRTC)

## Quick Start with Docker

1. **Clone the repository**
   ```bash
   git clone https://github.com/S4tyendra/public-vc
   cd public-vc
   ```

2. **Set up TLS certificates**
   
   Create a `certs` directory and add your certificates:
   ```bash
   mkdir -p certs
   # Add your cert.pem and key.pem files to the certs directory
   ```
   
   For development, you can generate self-signed certificates:
   ```bash
   openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes
   ```

3. **Start the application**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - Open your browser and navigate to `https://localhost:3000`
   - Accept the self-signed certificate warning (for development)

## Manual Installation

### Prerequisites
- Go 1.24+ 
- MongoDB
- TLS certificates

### Setup

1. **Install dependencies**
   ```bash
   go mod download
   ```

2. **Set up MongoDB**
   - Install and start MongoDB
   - The application connects to `mongodb://localhost:27017` by default

3. **Set up TLS certificates**
   ```bash
   mkdir certs
   # Add cert.pem and key.pem files
   ```

4. **Run the application**
   ```bash
   go run main.go
   ```

## Configuration

The application uses the following default settings:

- **Port**: 3000 (HTTPS)
- **MongoDB**: `mongodb://localhost:27017`
- **Database**: `vc`
- **Collections**: `users`, `rooms`

### Environment Variables

You can customize the configuration using environment variables:

- `MONGO_URI` - MongoDB connection string
- `PORT` - Server port (default: 3000)
- `CERT_FILE` - Path to TLS certificate (default: certs/cert.pem)
- `KEY_FILE` - Path to TLS private key (default: certs/key.pem)

## API Endpoints

### Users
- `POST /api/user` - Create a new user
- `GET /api/user/:id` - Get user by ID

### Rooms
- `POST /api/room` - Create a new room
- `GET /api/rooms` - Get all public rooms
- `GET /api/room/:id` - Get room by ID
- `GET /api/room/:id/members` - Get room members

### Admin Actions
- `POST /api/room/:id/mute` - Mute a user (admin only)
- `POST /api/room/:id/unmute` - Unmute a user (admin only)

### WebSocket
- `GET /ws/:roomID` - WebSocket connection for real-time communication

## WebSocket Message Types

The application uses various WebSocket message types for real-time communication:

- `room-info` - Room information and admin status
- `existing-users` - List of users already in the room
- `user-joined` / `user-left` - User presence notifications
- `webrtc-offer` / `webrtc-answer` / `webrtc-ice-candidate` - WebRTC signaling
- `chat-message` - Text chat messages
- `user-muted` / `user-unmuted` - Mute status updates

## Browser Compatibility

LanCall requires a modern browser with WebRTC support:

- Chrome 56+
- Firefox 52+
- Safari 11+
- Edge 79+

## Security Considerations

- **HTTPS Required**: WebRTC requires HTTPS for camera/microphone access
- **STUN Servers**: Currently uses Google's public STUN servers
- **TURN Server**: For production, consider setting up your own TURN server for better connectivity

## Development

### Project Structure
```
____/
├── main.go              # Main application entry point
├── go.mod               # Go module dependencies
├── db/
│   └── mongo.go         # MongoDB connection and operations
├── hub/
│   └── hub.go          # WebSocket hub and room management
├── models/
│   └── models.go       # Data models
├── public/
│   ├── index.html      # Frontend HTML
│   └── script.js       # Frontend JavaScript
├── certs/
│   ├── cert.pem        # TLS certificate
│   └── key.pem         # TLS private key
└── docker-compose.yml  # Docker Compose configuration
```

### Adding Features

1. **Backend**: Add new routes in `main.go` and implement logic in appropriate modules
2. **Frontend**: Modify `public/script.js` and `public/index.html`
3. **Database**: Extend models in `models/models.go` and add operations in `db/mongo.go`

## Production Deployment

For production deployment:

1. **Use real TLS certificates** (Let's Encrypt, purchased certificates)
2. **Set up a TURN server** for better NAT traversal
3. **Configure MongoDB with authentication**
4. **Use environment variables** for configuration
5. **Set up reverse proxy** (nginx) for load balancing
6. **Enable logging and monitoring**

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- Check the [Issues](../../issues) page
- Create a new issue if your problem isn't already reported

## Roadmap

- [ ] Screen sharing support
- [ ] File sharing in chat
- [ ] Room password protection
- [ ] User registration and authentication
- [ ] Recording capabilities
- [ ] Mobile app (React Native/Flutter)
