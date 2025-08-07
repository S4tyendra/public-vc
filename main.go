// main.go
package main

import (
	"log"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

// Simple in-memory store for WebSocket connections
type ConnectionPool struct {
	mu          sync.Mutex
	connections map[*websocket.Conn]bool
}

func NewConnectionPool() *ConnectionPool {
	return &ConnectionPool{
		connections: make(map[*websocket.Conn]bool),
	}
}

func (p *ConnectionPool) Add(conn *websocket.Conn) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.connections[conn] = true
}

func (p *ConnectionPool) Remove(conn *websocket.Conn) {
	p.mu.Lock()
	defer p.mu.Unlock()
	delete(p.connections, conn)
}

func (p *ConnectionPool) Broadcast(sender *websocket.Conn, message []byte) {
	p.mu.Lock()
	defer p.mu.Unlock()
	for conn := range p.connections {
		// Don't send the message back to the sender
		if conn != sender {
			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Println("write error:", err)
				// Best effort, if write fails, the cleanup logic will handle it
			}
		}
	}
}

func main() {
	app := fiber.New()
	pool := NewConnectionPool()

	// Serve the static frontend files
	app.Static("/", "./public")

	// Upgrade HTTP requests to WebSocket
	app.Use("/ws", func(c *fiber.Ctx) error {
		if websocket.IsWebSocketUpgrade(c) {
			c.Locals("allowed", true)
			return c.Next()
		}
		return fiber.ErrUpgradeRequired
	})

	// WebSocket endpoint for signaling
	app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		log.Println("New client connected")
		pool.Add(c)
		defer func() {
			log.Println("Client disconnected")
			pool.Remove(c)
			c.Close()
		}()

		for {
			// Read message from client
			_, msg, err := c.ReadMessage()
			if err != nil {
				log.Println("read error:", err)
				break // Exit loop on error
			}
			log.Printf("Received message: %s", msg)

			// Broadcast message to all other clients
			pool.Broadcast(c, msg)
		}
	}))

	log.Println("Starting server on https://<your-local-ip>:3000")
	// Start the HTTPS server
	err := app.ListenTLS("0.0.0.0:3000", "certs/cert.pem", "certs/key.pem")
	if err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
