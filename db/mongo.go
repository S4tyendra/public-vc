// db/mongo.go
package db

import (
	"context"
	"time"

	"vc/models" // <-- Replace with your go.mod module name

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Store struct {
	client *mongo.Client
	db     *mongo.Database
}

func NewStore() (*Store, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI("mongodb://localhost:27017"))
	if err != nil {
		return nil, err
	}

	db := client.Database("webrtc_chat")
	return &Store{client: client, db: db}, nil
}

func (s *Store) CreateUser(name string) (*models.User, error) {
	user := &models.User{
		ID:   primitive.NewObjectID(),
		Name: name,
	}
	_, err := s.db.Collection("users").InsertOne(context.TODO(), user)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (s *Store) GetUser(id primitive.ObjectID) (*models.User, error) {
	var user models.User
	err := s.db.Collection("users").FindOne(context.TODO(), bson.M{"_id": id}).Decode(&user)
	return &user, err
}

func (s *Store) CreateRoom(name string, isPublic bool, creatorID primitive.ObjectID) (*models.Room, error) {
	room := &models.Room{
		ID:        primitive.NewObjectID(),
		Name:      name,
		IsPublic:  isPublic,
		CreatorID: creatorID,
		CreatedAt: time.Now(),
	}
	_, err := s.db.Collection("rooms").InsertOne(context.TODO(), room)
	if err != nil {
		return nil, err
	}
	return room, nil
}

func (s *Store) GetPublicRooms() ([]models.Room, error) {
	var rooms []models.Room
	cursor, err := s.db.Collection("rooms").Find(context.TODO(), bson.M{"isPublic": true})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(context.TODO())

	if err = cursor.All(context.TODO(), &rooms); err != nil {
		return nil, err
	}
	return rooms, nil
}

func (s *Store) GetRoom(id primitive.ObjectID) (*models.Room, error) {
	var room models.Room
	err := s.db.Collection("rooms").FindOne(context.TODO(), bson.M{"_id": id}).Decode(&room)
	return &room, err
}

func (s *Store) GetRoomByIdString(idStr string) (*models.Room, error) {
	id, err := primitive.ObjectIDFromHex(idStr)
	if err != nil {
		return nil, err
	}
	return s.GetRoom(id)
}
