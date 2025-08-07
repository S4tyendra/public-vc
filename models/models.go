// models/models.go
package models

import "go.mongodb.org/mongo-driver/bson/primitive"

type User struct {
	ID   primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name string             `bson:"name" json:"name"`
}

type Room struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name      string             `bson:"name" json:"name"`
	IsPublic  bool               `bson:"isPublic" json:"isPublic"`
	CreatorID primitive.ObjectID `bson:"creatorId" json:"creatorId"`
}
