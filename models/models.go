// models/models.go
package models

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID   primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name string             `bson:"name" json:"name"`
}

type Room struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name      string             `bson:"name" json:"name"`
	IsPublic  bool               `bson:"isPublic" json:"isPublic"`
	CreatorID primitive.ObjectID `bson:"creatorId" json:"creatorId"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	// Runtime fields (not stored in DB)
	MemberCount int `bson:"-" json:"memberCount"`
}

type RoomMember struct {
	UserID   string `json:"userId"`
	UserName string `json:"userName"`
	IsMuted  bool   `json:"isMuted"`
	IsAdmin  bool   `json:"isAdmin"`
}
