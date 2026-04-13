# Soulie API Endpoints Documentation

## Authentication
All endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Base URL
All endpoints are prefixed with `/soulie`

## Endpoints

### Home & Dashboard

#### Get Home Feed
- **GET** `/soulie/home`
- Returns the user's home feed data

#### Get Widget Data
- **GET** `/soulie/widget`
- Returns widget data for the user's dashboard

#### Get Profile Summary
- **GET** `/soulie/profile`
- Returns the user's profile summary

#### Update Profile
- **PATCH** `/soulie/profile`
- Updates the user's profile
- Request body: `{ name: string, bio: string, avatarUrl: string }`

### Friends

#### Get Friends List
- **GET** `/soulie/friends`
- Returns list of accepted friends
- Query parameters: `q` (optional search query)

#### Discover Users
- **GET** `/soulie/friends/discover`
- Returns list of users to discover and add as friends
- Query parameters: `q` (optional search query)

#### Get Friend Requests
- **GET** `/soulie/friends/requests`
- Returns pending friend requests

#### Create Friend Request
- **POST** `/soulie/friends/requests`
- Sends a friend request to another user
- Request body: `{ friendId: number }`

#### Accept Friend Request
- **POST** `/soulie/friends/requests/:requestId/accept`
- Accepts a friend request
- Path parameter: `requestId` - ID of the request to accept

#### Reject Friend Request
- **POST** `/soulie/friends/requests/:requestId/reject`
- Rejects a friend request
- Path parameter: `requestId` - ID of the request to reject

#### Remove Friend
- **DELETE** `/soulie/friends/:friendKey`
- Removes a friend
- Path parameter: `friendKey` - Key of the friend to remove

### Moments

#### Get Moments
- **GET** `/soulie/moments`
- Returns user's moments
- Query parameters:
  - `box` (sent or received)
  - `limit` (number of items to return)

#### Create Moment
- **POST** `/soulie/moments`
- Creates a new moment
- Request body: `{ recipientId: number, content: string, imageUrl: string, expiresAt: string }`

#### Mark Moment as Opened
- **POST** `/soulie/moments/:momentId/opened`
- Marks a moment as opened by the recipient
- Path parameter: `momentId` - ID of the moment to mark as opened

### Conversations & Messaging

#### Get Conversations
- **GET** `/soulie/conversations`
- Returns user's conversations
- Query parameter: `q` (optional search query)

#### Create Direct Conversation
- **POST** `/soulie/conversations/direct`
- Creates or gets an existing direct conversation
- Request body: `{ friendId: number }`

#### Get Conversation Messages
- **GET** `/soulie/conversations/:conversationId/messages`
- Returns messages in a conversation
- Path parameter: `conversationId` - ID of the conversation

#### Send Conversation Message
- **POST** `/soulie/conversations/:conversationId/messages`
- Sends a message in a conversation
- Path parameter: `conversationId` - ID of the conversation
- Request body: `{ content: string, imageUrl: string }`

#### Mark Conversation as Read
- **POST** `/soulie/conversations/:conversationId/read`
- Marks a conversation as read
- Path parameter: `conversationId` - ID of the conversation

### Journal

#### Get Journal
- **GET** `/soulie/journal`
- Returns journal aggregate data

### Camera

#### Get Camera Recipients
- **GET** `/soulie/camera/recipients`
- Returns list of recipients for camera functionality

### Legacy Chat Endpoints

#### Get Chats
- **GET** `/soulie/chats`
- Returns list of chats
- Query parameter: `q` (optional search query)

#### Get Chat Thread
- **GET** `/soulie/chats/:friendKey/messages`
- Returns messages for a specific chat thread
- Path parameter: `friendKey` - Key of the friend

#### Send Chat Message
- **POST** `/soulie/chats/:friendKey/messages`
- Sends a message to a specific chat
- Path parameter: `friendKey` - Key of the friend
- Request body: `{ content: string, imageUrl: string }`

## Data Models

### Request/Response Bodies

#### Create Friend Request
```json
{
  "friendId": 123
}
```

#### Create Moment Request
```json
{
  "recipientId": 123,
  "content": "Hello!",
  "imageUrl": "https://example.com/image.jpg",
  "expiresAt": "2026-04-01T10:00:00Z"
}
```

#### Send Message Request
```json
{
  "content": "Hello!",
  "imageUrl": "https://example.com/image.jpg"
}
```

#### Update Profile Request
```json
{
  "name": "John Doe",
  "bio": "Software Developer",
  "avatarUrl": "https://example.com/avatar.jpg"
}
```