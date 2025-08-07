// MongoDB initialization script
// This script creates the application database and a user with appropriate permissions

// Switch to the vc database
db = db.getSiblingDB('vc');

// Create a user for the application
db.createUser({
  user: 'lancall',
  pwd: 'lancall123',
  roles: [
    {
      role: 'readWrite',
      db: 'vc'
    }
  ]
});

// Create indexes for better performance
db.users.createIndex({ "name": 1 });
db.rooms.createIndex({ "name": 1 });
db.rooms.createIndex({ "isPublic": 1 });
db.rooms.createIndex({ "creatorId": 1 });
db.rooms.createIndex({ "createdAt": 1 });

print('Database initialized successfully');
