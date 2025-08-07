// main.go
package main

import (
	"encoding/json"
	"log"

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

	// Get all public rooms
	api.Get("/rooms", func(c *fiber.Ctx) error {
		rooms, err := store.GetPublicRooms()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "could not get rooms"})
		}
		return c.JSON(rooms)
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

		if roomID == "" || userID == "" {
			log.Println("RoomID or UserID is missing")
			c.Close()
			return
		}

		room := hubInstance.GetOrCreateRoom(roomID)
		client := &hub.Client{Conn: c, RoomID: roomID, UserID: userID}
		room.AddClient(client)

		log.Printf("Client %s connected to room %s", userID, roomID)

		// Announce new user to the room
		// First, get list of existing users to send to the newcomer
		existingUserIDs := []string{}
		room.Broadcast(c, mustMarshal(hub.Message{
			Type:    "user-joined",
			Payload: json.RawMessage(`{"userId":"` + userID + `"}`),
		}))

		for _, existingClient := range room.Clients {
			if existingClient.UserID != userID {
				existingUserIDs = append(existingUserIDs, existingClient.UserID)
			}
		}

		// Send the list of existing users to the new client
		c.WriteJSON(hub.Message{
			Type:    "existing-users",
			Payload: mustMarshal(map[string][]string{"userIds": existingUserIDs}),
		})

		defer func() {
			room.RemoveClient(c)
			hubInstance.RemoveRoomIfEmpty(roomID)
			// Announce user has left
			room.Broadcast(nil, mustMarshal(hub.Message{
				Type:    "user-left",
				Payload: json.RawMessage(`{"userId":"` + userID + `"}`),
			}))
			c.Close()
			log.Printf("Client %s disconnected from room %s", userID, roomID)
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
			default:
				// Broadcast other messages (e.g., chat)
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
