// hub/hub.go
package hub

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gofiber/websocket/v2"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Message represents a WebSocket message
type Message struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
	Sender  string          `json:"sender,omitempty"`
	Target  string          `json:"target,omitempty"`
}

// Client represents a connected WebSocket client
type Client struct {
	Conn     *websocket.Conn
	RoomID   string
	UserID   string
	UserName string
	IsMuted  bool
	IsAdmin  bool
}

// Room represents a chat/video room
type Room struct {
	ID        string
	Name      string
	CreatorID primitive.ObjectID
	Clients   map[*websocket.Conn]*Client
	mutex     sync.RWMutex
}

// Hub manages all rooms
type Hub struct {
	Rooms map[string]*Room
	mutex sync.RWMutex
}

// NewHub creates a new hub instance
func NewHub() *Hub {
	return &Hub{
		Rooms: make(map[string]*Room),
	}
}

// GetOrCreateRoom gets an existing room or creates a new one
func (h *Hub) GetOrCreateRoom(roomID string) *Room {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if room, exists := h.Rooms[roomID]; exists {
		return room
	}

	room := &Room{
		ID:      roomID,
		Clients: make(map[*websocket.Conn]*Client),
	}
	h.Rooms[roomID] = room
	return room
}

// GetRoom gets an existing room
func (h *Hub) GetRoom(roomID string) *Room {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	return h.Rooms[roomID]
}

// RemoveRoomIfEmpty removes a room if it has no clients
func (h *Hub) RemoveRoomIfEmpty(roomID string) {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	if room, exists := h.Rooms[roomID]; exists {
		room.mutex.RLock()
		isEmpty := len(room.Clients) == 0
		room.mutex.RUnlock()

		if isEmpty {
			delete(h.Rooms, roomID)
			log.Printf("Room %s removed (empty)", roomID)
		}
	}
}

// SetRoomInfo sets room metadata
func (r *Room) SetRoomInfo(name string, creatorID primitive.ObjectID) {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	r.Name = name
	r.CreatorID = creatorID
}

// AddClient adds a client to the room
func (r *Room) AddClient(client *Client) {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	// Check if user is the room creator (admin)
	if client.UserID == r.CreatorID.Hex() {
		client.IsAdmin = true
	}

	r.Clients[client.Conn] = client
}

// RemoveClient removes a client from the room
func (r *Room) RemoveClient(conn *websocket.Conn) {
	r.mutex.Lock()
	defer r.mutex.Unlock()
	delete(r.Clients, conn)
}

// GetMemberCount returns the number of clients in the room
func (r *Room) GetMemberCount() int {
	r.mutex.RLock()
	defer r.mutex.RUnlock()
	return len(r.Clients)
}

// GetMembers returns a list of all members in the room
func (r *Room) GetMembers() []map[string]interface{} {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	var members []map[string]interface{}
	for _, client := range r.Clients {
		members = append(members, map[string]interface{}{
			"userId":   client.UserID,
			"userName": client.UserName,
			"isMuted":  client.IsMuted,
			"isAdmin":  client.IsAdmin,
		})
	}
	return members
}

// MuteUser mutes a user (admin only)
func (r *Room) MuteUser(adminUserID, targetUserID string) bool {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	// Check if requester is admin
	var isAdmin bool
	for _, client := range r.Clients {
		if client.UserID == adminUserID && client.IsAdmin {
			isAdmin = true
			break
		}
	}

	if !isAdmin {
		return false
	}

	// Mute the target user
	for _, client := range r.Clients {
		if client.UserID == targetUserID {
			client.IsMuted = true
			return true
		}
	}
	return false
}

// UnmuteUser unmutes a user (admin only)
func (r *Room) UnmuteUser(adminUserID, targetUserID string) bool {
	r.mutex.Lock()
	defer r.mutex.Unlock()

	// Check if requester is admin
	var isAdmin bool
	for _, client := range r.Clients {
		if client.UserID == adminUserID && client.IsAdmin {
			isAdmin = true
			break
		}
	}

	if !isAdmin {
		return false
	}

	// Unmute the target user
	for _, client := range r.Clients {
		if client.UserID == targetUserID {
			client.IsMuted = false
			return true
		}
	}
	return false
}

// Broadcast sends a message to all clients in the room except the sender
func (r *Room) Broadcast(sender *websocket.Conn, message []byte) {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	for conn, _ := range r.Clients {
		if conn != sender {
			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("Error broadcasting message: %v", err)
			}
		}
	}
}

// BroadcastToAll sends a message to all clients in the room including sender
func (r *Room) BroadcastToAll(message []byte) {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	for conn, _ := range r.Clients {
		if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
			log.Printf("Error broadcasting message: %v", err)
		}
	}
}

// SendToTarget sends a message to a specific client in the room
func (r *Room) SendToTarget(targetUserID string, message []byte) {
	r.mutex.RLock()
	defer r.mutex.RUnlock()

	for conn, client := range r.Clients {
		if client.UserID == targetUserID {
			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("Error sending message to target %s: %v", targetUserID, err)
			}
			return
		}
	}
	log.Printf("Target user %s not found in room %s", targetUserID, r.ID)
}
