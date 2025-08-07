// main.go
package main

import (
	"encoding/json"
	"log"
	"time"

	"vc/db"
	"vc/hub"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/websocket/v2"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func main() {
	// --- Initialization ---
	store, err := db.NewStore()
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	log.Println("Database connected.")

	hubInstance := hub.NewHub()
	app := fiber.New()

	app.Use(cors.New()) // Add CORS for local development

	// --- Static Files & API Endpoints ---
	app.Static("/", "./public")

	api := app.Group("/api")

	// Create a new user
	api.Post("/user", func(c *fiber.Ctx) error {
		var body struct {
			Name string `json:"name"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cannot parse json"})
		}
		user, err := store.CreateUser(body.Name)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "could not create user"})
		}
		return c.JSON(user)
	})

	// Get user by ID
	api.Get("/user/:id", func(c *fiber.Ctx) error {
		idStr := c.Params("id")
		id, err := primitive.ObjectIDFromHex(idStr)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid user id"})
		}

		user, err := store.GetUser(id)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "user not found"})
		}
		return c.JSON(user)
	})

	// Create a new room
	api.Post("/room", func(c *fiber.Ctx) error {
		var body struct {
			Name      string `json:"name"`
			IsPublic  bool   `json:"isPublic"`
			CreatorID string `json:"creatorId"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cannot parse json"})
		}
		creatorID, err := primitive.ObjectIDFromHex(body.CreatorID)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid creator id"})
		}

		room, err := store.CreateRoom(body.Name, body.IsPublic, creatorID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "could not create room"})
		}
		return c.JSON(room)
	})

	// Get all public rooms with member counts
	api.Get("/rooms", func(c *fiber.Ctx) error {
		rooms, err := store.GetPublicRooms()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "could not get rooms"})
		}

		// Add member counts from hub
		for i := range rooms {
			if room := hubInstance.GetRoom(rooms[i].ID.Hex()); room != nil {
				rooms[i].MemberCount = room.GetMemberCount()
			}
		}

		return c.JSON(rooms)
	})

	// Get room by ID
	api.Get("/room/:id", func(c *fiber.Ctx) error {
		roomID := c.Params("id")

		room, err := store.GetRoomByIdString(roomID)
		if err != nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "room not found"})
		}

		// Add member count from hub
		if hubRoom := hubInstance.GetRoom(roomID); hubRoom != nil {
			room.MemberCount = hubRoom.GetMemberCount()
		}

		return c.JSON(room)
	})

	// Get room members
	api.Get("/room/:id/members", func(c *fiber.Ctx) error {
		roomID := c.Params("id")

		room := hubInstance.GetRoom(roomID)
		if room == nil {
			return c.JSON([]interface{}{}) // Return empty array if room not active
		}

		members := room.GetMembers()
		return c.JSON(members)
	})

	// Admin actions - mute user
	api.Post("/room/:id/mute", func(c *fiber.Ctx) error {
		roomID := c.Params("id")
		var body struct {
			AdminUserID  string `json:"adminUserId"`
			TargetUserID string `json:"targetUserId"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cannot parse json"})
		}

		room := hubInstance.GetRoom(roomID)
		if room == nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "room not found"})
		}

		success := room.MuteUser(body.AdminUserID, body.TargetUserID)
		if !success {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "unauthorized or user not found"})
		}

		// Broadcast mute status to room
		muteMsg := mustMarshal(hub.Message{
			Type: "user-muted",
			Payload: mustMarshal(map[string]interface{}{
				"userId":  body.TargetUserID,
				"mutedBy": body.AdminUserID,
			}),
		})
		room.BroadcastToAll(muteMsg)

		return c.JSON(fiber.Map{"success": true})
	})

	// Admin actions - unmute user
	api.Post("/room/:id/unmute", func(c *fiber.Ctx) error {
		roomID := c.Params("id")
		var body struct {
			AdminUserID  string `json:"adminUserId"`
			TargetUserID string `json:"targetUserId"`
		}
		if err := c.BodyParser(&body); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "cannot parse json"})
		}

		room := hubInstance.GetRoom(roomID)
		if room == nil {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "room not found"})
		}

		success := room.UnmuteUser(body.AdminUserID, body.TargetUserID)
		if !success {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "unauthorized or user not found"})
		}

		// Broadcast unmute status to room
		unmuteMsg := mustMarshal(hub.Message{
			Type: "user-unmuted",
			Payload: mustMarshal(map[string]interface{}{
				"userId":    body.TargetUserID,
				"unmutedBy": body.AdminUserID,
			}),
		})
		room.BroadcastToAll(unmuteMsg)

		return c.JSON(fiber.Map{"success": true})
	})

	// Serve room pages
	app.Get("/room/:id", func(c *fiber.Ctx) error {
		return c.SendFile("./public/index.html")
	})

	app.Get("/create-room", func(c *fiber.Ctx) error {
		return c.SendFile("./public/index.html")
	})

	// --- WebSocket Handling ---
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	app.Get("/ws/:roomID", websocket.New(func(c *websocket.Conn) {
		roomID := c.Params("roomID")
		userID := c.Query("userID")
		userName := c.Query("userName")

		if roomID == "" || userID == "" {
			log.Println("RoomID or UserID is missing")
			c.Close()
			return
		}

		// Get room info from database
		roomInfo, err := store.GetRoomByIdString(roomID)
		if err != nil {
			log.Printf("Room %s not found in database: %v", roomID, err)
			c.Close()
			return
		}

		room := hubInstance.GetOrCreateRoom(roomID)
		room.SetRoomInfo(roomInfo.Name, roomInfo.CreatorID)

		client := &hub.Client{
			Conn:     c,
			RoomID:   roomID,
			UserID:   userID,
			UserName: userName,
			IsMuted:  false,
			IsAdmin:  userID == roomInfo.CreatorID.Hex(),
		}

		// Get list of existing users BEFORE adding the new client
		existingUsers := []map[string]interface{}{}
		existingUserIDs := []string{}

		for _, existingClient := range room.Clients {
			if existingClient.UserID != userID {
				existingUserIDs = append(existingUserIDs, existingClient.UserID)
				existingUsers = append(existingUsers, map[string]interface{}{
					"userId":   existingClient.UserID,
					"userName": existingClient.UserName,
					"isMuted":  existingClient.IsMuted,
					"isAdmin":  existingClient.IsAdmin,
				})
			}
		}

		// Now add the client to the room
		room.AddClient(client)

		log.Printf("Client %s (%s) connected to room %s", userName, userID, roomID)

		// Send room info to the new client
		roomInfoMsg := mustMarshal(hub.Message{
			Type: "room-info",
			Payload: mustMarshal(map[string]interface{}{
				"roomId":      roomID,
				"roomName":    roomInfo.Name,
				"memberCount": room.GetMemberCount(),
				"isAdmin":     client.IsAdmin,
			}),
		})
		c.WriteMessage(1, roomInfoMsg)

		// Send the list of existing users to the new client
		c.WriteJSON(hub.Message{
			Type: "existing-users",
			Payload: mustMarshal(map[string]interface{}{
				"userIds": existingUserIDs,
				"users":   existingUsers,
			}),
		})

		// Announce new user to the room
		room.Broadcast(c, mustMarshal(hub.Message{
			Type: "user-joined",
			Payload: mustMarshal(map[string]interface{}{
				"userId":      userID,
				"userName":    userName,
				"memberCount": room.GetMemberCount(),
			}),
		}))

		defer func() {
			room.RemoveClient(c)
			memberCount := room.GetMemberCount()

			// Announce user has left
			room.Broadcast(nil, mustMarshal(hub.Message{
				Type: "user-left",
				Payload: mustMarshal(map[string]interface{}{
					"userId":      userID,
					"userName":    userName,
					"memberCount": memberCount,
				}),
			}))

			hubInstance.RemoveRoomIfEmpty(roomID)
			c.Close()
			log.Printf("Client %s (%s) disconnected from room %s", userName, userID, roomID)
		}()

		// WebSocket message loop
		for {
			_, msg, err := c.ReadMessage()
			if err != nil {
				log.Println("read error:", err)
				break
			}

			var message hub.Message
			if err := json.Unmarshal(msg, &message); err != nil {
				log.Println("json unmarshal error:", err)
				continue
			}

			// Add sender information to the message
			message.Sender = userID

			// Route message based on type
			switch message.Type {
			case "webrtc-offer", "webrtc-answer", "webrtc-ice-candidate":
				// These messages are targeted to a specific peer
				if message.Target != "" {
					repackedMsg, _ := json.Marshal(message)
					room.SendToTarget(message.Target, repackedMsg)
				}
			case "chat-message":
				// Broadcast chat messages to all users
				var chatPayload struct {
					Message string `json:"message"`
				}
				if err := json.Unmarshal(message.Payload, &chatPayload); err == nil {
					chatMsg := mustMarshal(hub.Message{
						Type:   "chat-message",
						Sender: userID,
						Payload: mustMarshal(map[string]interface{}{
							"message":   chatPayload.Message,
							"userName":  userName,
							"userId":    userID,
							"timestamp": time.Now().Unix(),
						}),
					})
					room.BroadcastToAll(chatMsg)
				}
			default:
				// Broadcast other messages (e.g., voice activity)
				repackedMsg, _ := json.Marshal(message)
				room.Broadcast(c, repackedMsg)
			}
		}
	}))

	log.Println("Starting server on https://<your-local-ip>:3000")
	err = app.ListenTLS("0.0.0.0:3000", "certs/cert.pem", "certs/key.pem")
	if err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

// Helper to marshal JSON without handling the error everywhere
func mustMarshal(v interface{}) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return json.RawMessage(b)
}
