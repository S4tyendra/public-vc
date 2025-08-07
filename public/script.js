// public/script.js
document.addEventListener("DOMContentLoaded", () => {
    // --- STATE MANAGEMENT ---
    let currentUser = null;
    let localStream = null;
    let socket = null;
    let peerConnections = {}; // { peerId: RTCPeerConnection }
    let currentRoom = null;
    let isLocalMuted = false;
    let participants = {};
    let privateRooms = [];
    
    const peerConnectionConfig = {
        'iceServers': [
            { 'urls': 'stun:stun.l.google.com:19302' },
            { 'urls': 'stun:stun1.l.google.com:19302' }
        ]
    };

    // --- DOM ELEMENTS ---
    const views = {
        login: document.getElementById('login-view'),
        lobby: document.getElementById('lobby-view'),
        room: document.getElementById('room-view'),
    };
    
    // Login elements
    const loginButton = document.getElementById('login-button');
    const nameInput = document.getElementById('name-input');
    
    // Lobby elements
    const welcomeMessage = document.getElementById('welcome-message');
    const roomList = document.getElementById('room-list');
    const privateRoomList = document.getElementById('private-room-list');
    const refreshRoomsButton = document.getElementById('refresh-rooms-button');
    const createRoomButton = document.getElementById('create-room-button');
    const roomNameInput = document.getElementById('room-name-input');
    const isPublicCheckbox = document.getElementById('is-public-checkbox');
    const privateRoomIdInput = document.getElementById('private-room-id');
    const joinPrivateButton = document.getElementById('join-private-button');
    
    // Room elements
    const roomTitle = document.getElementById('room-title');
    const roomStatus = document.getElementById('room-status');
    const participantCount = document.getElementById('participant-count');
    const participantList = document.getElementById('participant-list');
    const audioContainer = document.getElementById('audio-container');
    const leaveRoomButton = document.getElementById('leave-room-button');
    const muteSelfButton = document.getElementById('mute-self-button');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatButton = document.getElementById('send-chat-button');

    // --- UI LOGIC ---
    function showView(viewName) {
        Object.values(views).forEach(view => view.classList.remove('active'));
        views[viewName].classList.add('active');
    }

    // --- INITIALIZATION ---
    async function init() {
        // Check URL for room ID
        const path = window.location.pathname;
        const roomMatch = path.match(/^\/room\/([a-f0-9]{24})$/);
        
        // Check for existing user in localStorage
        const storedUser = localStorage.getItem('lancall-user');
        const storedPrivateRooms = localStorage.getItem('lancall-private-rooms');
        
        if (storedPrivateRooms) {
            privateRooms = JSON.parse(storedPrivateRooms);
        }
        
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            if (roomMatch) {
                // Direct room join from URL
                const roomId = roomMatch[1];
                try {
                    const roomInfo = await api.get(`/room/${roomId}`);
                    joinRoom(roomId, roomInfo.name);
                } catch (error) {
                    console.error('Room not found:', error);
                    showLobby();
                }
            } else {
                showLobby();
            }
        } else {
            if (roomMatch) {
                // Store intended room for after login
                sessionStorage.setItem('intended-room', roomMatch[1]);
            }
            showView('login');
        }
    }

    // --- API HELPERS ---
    const api = {
        post: (endpoint, body) => fetch(`/api${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }).then(res => res.json()),
        get: (endpoint) => fetch(`/api${endpoint}`).then(res => res.json()),
    };

    // --- LOGIN LOGIC ---
    loginButton.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) return alert('Please enter a name.');
        
        try {
            const user = await api.post('/user', { name });
            currentUser = user;
            localStorage.setItem('lancall-user', JSON.stringify(user));
            
            // Check for intended room
            const intendedRoom = sessionStorage.getItem('intended-room');
            if (intendedRoom) {
                sessionStorage.removeItem('intended-room');
                try {
                    const roomInfo = await api.get(`/room/${intendedRoom}`);
                    joinRoom(intendedRoom, roomInfo.name);
                } catch (error) {
                    console.error('Room not found:', error);
                    showLobby();
                }
            } else {
                showLobby();
            }
        } catch (error) {
            console.error('Login failed:', error);
            alert('Login failed. Please try again.');
        }
    });
    
    nameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginButton.click();
    });

    // --- LOBBY LOGIC ---
    async function showLobby() {
        welcomeMessage.textContent = `Welcome, ${currentUser.name}!`;
        window.history.pushState({}, '', '/');
        showView('lobby');
        await loadPublicRooms();
        loadPrivateRooms();
    }

    async function loadPublicRooms() {
        try {
            const rooms = await api.get('/rooms');
            roomList.innerHTML = '';
            if (rooms.length === 0) {
                roomList.innerHTML = '<li class="room-item"><div class="room-info"><h4>No public rooms available</h4><p>Create one to get started!</p></div></li>';
            } else {
                rooms.forEach(room => {
                    const li = document.createElement('li');
                    li.className = 'room-item';
                    
                    const roomInfo = document.createElement('div');
                    roomInfo.className = 'room-info';
                    roomInfo.innerHTML = `
                        <h4>${escapeHtml(room.name)}</h4>
                        <p>${room.memberCount || 0} members</p>
                    `;
                    
                    const roomActions = document.createElement('div');
                    roomActions.className = 'room-actions';
                    const joinButton = document.createElement('button');
                    joinButton.textContent = 'Join';
                    joinButton.className = 'primary';
                    joinButton.onclick = () => joinRoom(room.id, room.name);
                    roomActions.appendChild(joinButton);
                    
                    li.appendChild(roomInfo);
                    li.appendChild(roomActions);
                    roomList.appendChild(li);
                });
            }
        } catch (error) {
            console.error('Failed to load rooms:', error);
            roomList.innerHTML = '<li class="room-item"><div class="room-info"><h4>Error loading rooms</h4><p>Please try again</p></div></li>';
        }
    }
    
    function loadPrivateRooms() {
        privateRoomList.innerHTML = '';
        if (privateRooms.length === 0) {
            privateRoomList.innerHTML = '<li class="room-item"><div class="room-info"><h4>No private rooms</h4><p>Join one by ID to see it here</p></div></li>';
        } else {
            privateRooms.forEach(room => {
                const li = document.createElement('li');
                li.className = 'room-item';
                
                const roomInfo = document.createElement('div');
                roomInfo.className = 'room-info';
                roomInfo.innerHTML = `
                    <h4>${escapeHtml(room.name)}</h4>
                    <p>Private Room</p>
                `;
                
                const roomActions = document.createElement('div');
                roomActions.className = 'room-actions';
                const joinButton = document.createElement('button');
                joinButton.textContent = 'Join';
                joinButton.className = 'primary';
                joinButton.onclick = () => joinRoom(room.id, room.name);
                roomActions.appendChild(joinButton);
                
                li.appendChild(roomInfo);
                li.appendChild(roomActions);
                privateRoomList.appendChild(li);
            });
        }
    }

    refreshRoomsButton.addEventListener('click', loadPublicRooms);

    createRoomButton.addEventListener('click', async () => {
        const name = roomNameInput.value.trim();
        if (!name) return alert('Please enter a room name.');

        try {
            const room = await api.post('/room', {
                name,
                isPublic: isPublicCheckbox.checked,
                creatorId: currentUser.id,
            });
            
            // Add to private rooms if it's private
            if (!room.isPublic) {
                addPrivateRoom(room.id, room.name);
            }
            
            joinRoom(room.id, room.name);
        } catch (error) {
            console.error('Failed to create room:', error);
            alert('Failed to create room.');
        }
    });
    
    joinPrivateButton.addEventListener('click', async () => {
        const roomId = privateRoomIdInput.value.trim();
        if (!roomId) return alert('Please enter a room ID.');
        
        try {
            const roomInfo = await api.get(`/room/${roomId}`);
            addPrivateRoom(roomId, roomInfo.name);
            joinRoom(roomId, roomInfo.name);
        } catch (error) {
            console.error('Room not found:', error);
            alert('Room not found. Please check the room ID.');
        }
    });
    
    function addPrivateRoom(roomId, roomName) {
        // Check if already exists
        if (!privateRooms.find(r => r.id === roomId)) {
            privateRooms.push({ id: roomId, name: roomName });
            localStorage.setItem('lancall-private-rooms', JSON.stringify(privateRooms));
            loadPrivateRooms();
        }
    }

    // --- ROOM LOGIC ---
    async function joinRoom(roomId, name) {
        currentRoom = { id: roomId, name: name };
        roomTitle.textContent = name;
        window.history.pushState({}, '', `/room/${roomId}`);
        showView('room');
        roomStatus.textContent = 'Getting microphone access...';

        try {
            // Request audio with specific constraints
            localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100
                }, 
                video: false 
            });
            
            console.log('Local stream obtained:', localStream);
            console.log('Audio tracks:', localStream.getAudioTracks());
            
            addLocalAudio();
            roomStatus.textContent = 'Connecting to room...';
            connectWebSocket(roomId);
        } catch (error) {
            console.error("Error getting user media:", error);
            roomStatus.textContent = `Error: Could not access microphone (${error.name})`;
            setTimeout(() => showLobby(), 3000);
        }
    }

    function addLocalAudio() {
        const audioCard = createAudioCard('local', 'You', true, currentRoom?.isAdmin || false);
        const audio = document.createElement('audio');
        audio.srcObject = localStream;
        audio.muted = true; // Mute self to prevent feedback
        audio.autoplay = true;
        
        // Add visual indicator for local audio
        const indicator = document.createElement('div');
        indicator.style.cssText = 'margin-top: 10px; color: #4CAF50; font-size: 12px;';
        indicator.textContent = '🎤 Microphone Active';
        audioCard.appendChild(indicator);
        
        // Don't add the audio element for local (it's muted anyway)
        // audioCard.appendChild(audio);
        audioContainer.appendChild(audioCard);
        
        updateMuteButton();
        updateParticipantList(); // Initial participant list update
    }

    leaveRoomButton.addEventListener('click', () => {
        if (socket) {
            socket.close();
        }
        cleanUpRoom();
        showLobby();
    });
    
    muteSelfButton.addEventListener('click', () => {
        isLocalMuted = !isLocalMuted;
        if (localStream) {
            localStream.getAudioTracks().forEach(track => {
                track.enabled = !isLocalMuted;
            });
        }
        updateMuteButton();
        updateLocalAudioCard();
    });
    
    function updateMuteButton() {
        muteSelfButton.textContent = isLocalMuted ? '🔊 Unmute' : '🔇 Mute';
    }
    
    function updateLocalAudioCard() {
        const localCard = document.getElementById('audio-card-local');
        if (localCard) {
            localCard.classList.toggle('muted', isLocalMuted);
        }
    }

    function cleanUpRoom() {
        // Close all peer connections
        for (const peerId in peerConnections) {
            if (peerConnections[peerId]) {
                peerConnections[peerId].close();
            }
        }
        peerConnections = {};
        participants = {};

        // Stop local media tracks
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        // Clear UI
        audioContainer.innerHTML = '';
        participantList.innerHTML = '';
        chatMessages.innerHTML = '';
        participantCount.textContent = '0';
        socket = null;
        
        // Reset room state
        if (currentRoom) {
            currentRoom.isAdmin = false;
        }
        currentRoom = null;
        isLocalMuted = false;
    }

    // --- CHAT LOGIC ---
    sendChatButton.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChatMessage();
    });
    
    function sendChatMessage() {
        const message = chatInput.value.trim();
        if (!message || !socket) return;
        
        socket.send(JSON.stringify({
            type: 'chat-message',
            payload: { message: message }
        }));
        
        chatInput.value = '';
    }
    
    function addChatMessage(senderId, senderName, message, timestamp, isOwn = false) {
        const messageEl = document.createElement('div');
        messageEl.className = `chat-message ${isOwn ? 'own' : ''}`;
        
        const time = new Date(timestamp * 1000).toLocaleTimeString();
        messageEl.innerHTML = `
            <div class="chat-sender">${escapeHtml(senderName)}</div>
            <div class="chat-text">${escapeHtml(message)}</div>
            <div class="chat-time">${time}</div>
        `;
        
        chatMessages.appendChild(messageEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // --- WEBSOCKET & WEBRTC LOGIC ---
    function connectWebSocket(roomId) {
        const wsURL = `wss://${window.location.host}/ws/${roomId}?userID=${currentUser.id}&userName=${encodeURIComponent(currentUser.name)}`;
        socket = new WebSocket(wsURL);

        socket.onopen = () => {
            roomStatus.textContent = 'Connected. Waiting for others...';
        };

        socket.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            console.log("WS Received:", message.type, message);

            switch (message.type) {
                case 'room-info':
                    const roomInfo = JSON.parse(message.payload);
                    roomStatus.textContent = `Connected to ${roomInfo.roomName}`;
                    updateParticipantCount(roomInfo.memberCount);
                    
                    // Set current room info including admin status
                    if (currentRoom) {
                        currentRoom.isAdmin = roomInfo.isAdmin;
                    }
                    
                    // Update participant list to show self with correct admin status
                    updateParticipantList();
                    break;
                    
                case 'existing-users':
                    const { userIds, users } = JSON.parse(message.payload);
                    console.log("Existing users:", userIds, users);
                    roomStatus.textContent = userIds.length > 0 ? `In room with ${userIds.length} other(s).` : 'Connected. Waiting for others...';
                    updateParticipantCount(userIds.length + 1); // +1 for self
                    
                    // Add existing participants
                    if (users && users.length > 0) {
                        users.forEach(user => {
                            console.log("Adding existing participant:", user);
                            addParticipant(user.userId, user.userName, user.isMuted, user.isAdmin);
                        });
                    }
                    
                    // Update participant list after adding all users
                    updateParticipantList();
                    
                    // Create offers for existing users (only if there are any)
                    if (userIds.length > 0) {
                        for (const userId of userIds) {
                            console.log("Creating offer for existing user:", userId);
                            await createAndSendOffer(userId);
                        }
                    }
                    break;
                
                case 'user-joined':
                    const joinData = JSON.parse(message.payload);
                    console.log("User joined:", joinData);
                    roomStatus.textContent = `${joinData.userName} joined.`;
                    updateParticipantCount(joinData.memberCount);
                    
                    // Add the new user to participants (this is important!)
                    if (joinData.userId !== currentUser.id) {
                        addParticipant(joinData.userId, joinData.userName, false, false);
                        updateParticipantList();
                        console.log("Added new participant:", joinData.userId, joinData.userName);
                        
                        // IMPORTANT: Existing users should also create an offer to the new user
                        // This creates a bidirectional connection
                        console.log("Creating offer for new user:", joinData.userId);
                        await createAndSendOffer(joinData.userId);
                    }
                    break;
                
                case 'user-left':
                    const leftData = JSON.parse(message.payload);
                    roomStatus.textContent = `${leftData.userName} left.`;
                    updateParticipantCount(leftData.memberCount);
                    if (peerConnections[leftData.userId]) {
                        peerConnections[leftData.userId].close();
                        delete peerConnections[leftData.userId];
                    }
                    removeParticipant(leftData.userId);
                    document.getElementById(`audio-card-${leftData.userId}`)?.remove();
                    break;

                case 'webrtc-offer':
                    await handleOffer(message.sender, JSON.parse(message.payload).offer);
                    break;
                
                case 'webrtc-answer':
                    await handleAnswer(message.sender, JSON.parse(message.payload).answer);
                    break;

                case 'webrtc-ice-candidate':
                    await handleIceCandidate(message.sender, JSON.parse(message.payload).candidate);
                    break;
                    
                case 'chat-message':
                    const chatData = JSON.parse(message.payload);
                    addChatMessage(
                        chatData.userId, 
                        chatData.userName, 
                        chatData.message, 
                        chatData.timestamp,
                        chatData.userId === currentUser.id
                    );
                    break;
                    
                case 'user-muted':
                    const muteData = JSON.parse(message.payload);
                    updateParticipantMuteStatus(muteData.userId, true);
                    if (muteData.userId === currentUser.id) {
                        roomStatus.textContent = 'You have been muted by an admin.';
                    }
                    break;
                    
                case 'user-unmuted':
                    const unmuteData = JSON.parse(message.payload);
                    updateParticipantMuteStatus(unmuteData.userId, false);
                    if (unmuteData.userId === currentUser.id) {
                        roomStatus.textContent = 'You have been unmuted by an admin.';
                    }
                    break;
            }
        };

        socket.onclose = () => {
            roomStatus.textContent = 'Disconnected.';
            setTimeout(() => {
                cleanUpRoom();
                showLobby();
            }, 2000);
        };

        socket.onerror = (err) => {
            console.error("WebSocket Error:", err);
            roomStatus.textContent = 'Connection error.';
        };
    }

    function createPeerConnection(peerId) {
        const pc = new RTCPeerConnection(peerConnectionConfig);
        
        // Add local stream tracks with proper configuration
        if (localStream) {
            localStream.getTracks().forEach(track => {
                console.log(`Adding local track to peer ${peerId}:`, track.kind, track.enabled);
                pc.addTrack(track, localStream);
            });
        }

        // Handle remote stream
        pc.ontrack = (event) => {
            console.log(`Track received from ${peerId}:`, event.track.kind, event.track.enabled);
            if (event.streams && event.streams[0]) {
                addRemoteAudio(peerId, event.streams[0]);
            }
        };

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`Sending ICE candidate to ${peerId}`);
                socket.send(JSON.stringify({
                    type: 'webrtc-ice-candidate',
                    target: peerId,
                    payload: { candidate: event.candidate }
                }));
            }
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            console.log(`Peer connection with ${peerId} state:`, pc.connectionState);
        };

        peerConnections[peerId] = pc;
        return pc;
    }

    async function createAndSendOffer(peerId) {
        console.log(`Creating offer for ${peerId}`);
        try {
            const pc = createPeerConnection(peerId);
            const offer = await pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
            });
            await pc.setLocalDescription(offer);
            
            console.log(`Sending offer to ${peerId}:`, offer);
            socket.send(JSON.stringify({
                type: 'webrtc-offer',
                target: peerId,
                payload: { offer: offer }
            }));
        } catch (error) {
            console.error(`Failed to create offer for ${peerId}:`, error);
        }
    }

    async function handleOffer(peerId, offer) {
        console.log(`Handling offer from ${peerId}:`, offer);
        try {
            const pc = createPeerConnection(peerId);
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            console.log(`Sending answer to ${peerId}:`, answer);
            socket.send(JSON.stringify({
                type: 'webrtc-answer',
                target: peerId,
                payload: { answer: answer }
            }));
        } catch (error) {
            console.error(`Failed to handle offer from ${peerId}:`, error);
        }
    }

    async function handleAnswer(peerId, answer) {
        console.log(`Handling answer from ${peerId}:`, answer);
        try {
            const pc = peerConnections[peerId];
            if (pc) {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
                console.log(`Answer processed for ${peerId}`);
            } else {
                console.error(`No peer connection found for ${peerId}`);
            }
        } catch (error) {
            console.error(`Failed to handle answer from ${peerId}:`, error);
        }
    }

    async function handleIceCandidate(peerId, candidate) {
        console.log(`Handling ICE candidate from ${peerId}`);
        const pc = peerConnections[peerId];
        if (pc && candidate) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
        }
    }

    function addRemoteAudio(peerId, stream) {
        if (document.getElementById(`audio-card-${peerId}`)) {
            console.log(`Audio card for ${peerId} already exists, updating stream`);
            const existingAudio = document.querySelector(`#audio-card-${peerId} audio`);
            if (existingAudio) {
                existingAudio.srcObject = stream;
            }
            return;
        }

        const participant = participants[peerId];
        const userName = participant ? participant.name : `User ${peerId.substring(0, 6)}...`;
        const isAdmin = participant ? participant.isAdmin : false;
        
        console.log(`Creating audio card for ${peerId} (${userName})`);
        
        const audioCard = createAudioCard(peerId, userName, false, isAdmin);
        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.controls = false; // Remove controls for cleaner UI
        audio.volume = 1.0;
        
        // Add event listeners for debugging
        audio.onloadedmetadata = () => {
            console.log(`Audio metadata loaded for ${peerId}`);
        };
        audio.onplay = () => {
            console.log(`Audio started playing for ${peerId}`);
        };
        audio.onerror = (e) => {
            console.error(`Audio error for ${peerId}:`, e);
        };
        
        // Try to play the audio
        audio.play().then(() => {
            console.log(`Audio play() succeeded for ${peerId}`);
        }).catch(e => {
            console.error(`Audio play() failed for ${peerId}:`, e);
            // Try again after user interaction
            setTimeout(() => {
                audio.play().catch(err => console.log('Retry audio play failed:', err));
            }, 1000);
        });
        
        audioCard.appendChild(audio);
        audioContainer.appendChild(audioCard);
    }
    
    function createAudioCard(id, name, isLocal = false, isAdmin = false) {
        const card = document.createElement('div');
        card.className = `audio-card ${isAdmin ? 'admin' : ''}`;
        card.id = `audio-card-${id}`;
        
        const nameEl = document.createElement('p');
        nameEl.textContent = name + (isAdmin ? ' (Admin)' : '') + (isLocal ? ' (You)' : '');
        card.appendChild(nameEl);
        
        return card;
    }
    
    // --- PARTICIPANT MANAGEMENT ---
    function addParticipant(userId, userName, isMuted, isAdmin) {
        console.log(`Adding participant: ${userId} (${userName})`);
        participants[userId] = { name: userName, isMuted, isAdmin };
        console.log("Current participants:", participants);
        updateParticipantList();
    }
    
    function removeParticipant(userId) {
        console.log(`Removing participant: ${userId}`);
        delete participants[userId];
        console.log("Current participants:", participants);
        updateParticipantList();
    }
    
    function updateParticipantMuteStatus(userId, isMuted) {
        if (participants[userId]) {
            participants[userId].isMuted = isMuted;
            updateParticipantList();
            
            // Update audio card
            const audioCard = document.getElementById(`audio-card-${userId}`);
            if (audioCard) {
                audioCard.classList.toggle('muted', isMuted);
            }
        }
    }
    
    function updateParticipantCount(count) {
        console.log("Updating participant count:", count);
        participantCount.textContent = count;
    }
    
    function updateParticipantList() {
        console.log("Updating participant list. Current participants:", participants);
        participantList.innerHTML = '';
        
        // Add self first with correct admin status
        const isCurrentUserAdmin = currentRoom && currentRoom.isAdmin;
        console.log("Current user admin status:", isCurrentUserAdmin);
        const selfEl = createParticipantElement(
            currentUser.id, 
            currentUser.name, 
            isLocalMuted, 
            isCurrentUserAdmin, 
            true
        );
        participantList.appendChild(selfEl);
        
        // Add other participants
        const participantEntries = Object.entries(participants);
        console.log("Adding participants:", participantEntries);
        participantEntries.forEach(([userId, participant]) => {
            console.log(`Adding participant UI: ${userId} - ${participant.name}`);
            const participantEl = createParticipantElement(
                userId, 
                participant.name, 
                participant.isMuted, 
                participant.isAdmin, 
                false
            );
            participantList.appendChild(participantEl);
        });
        
        console.log("Participant list updated. Total participants in UI:", participantList.children.length);
    }
    
    function createParticipantElement(userId, userName, isMuted, isAdmin, isSelf) {
        const el = document.createElement('div');
        el.className = `participant ${isAdmin ? 'admin' : ''} ${isMuted ? 'muted' : ''}`;
        
        const info = document.createElement('div');
        info.className = 'participant-info';
        info.innerHTML = `
            <div class="participant-name">${escapeHtml(userName)}${isAdmin ? ' (Admin)' : ''}${isSelf ? ' (You)' : ''}</div>
            <div class="participant-status">${isMuted ? 'Muted' : 'Active'}</div>
        `;
        
        const controls = document.createElement('div');
        controls.className = 'participant-controls';
        
        // Add admin controls if current user is admin and target is not self
        const isCurrentUserAdmin = currentRoom && currentRoom.isAdmin;
        if (isCurrentUserAdmin && !isSelf) {
            const muteBtn = document.createElement('button');
            muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
            muteBtn.onclick = () => toggleUserMute(userId, !isMuted);
            controls.appendChild(muteBtn);
        }
        
        el.appendChild(info);
        el.appendChild(controls);
        return el;
    }
    
    async function toggleUserMute(userId, shouldMute) {
        try {
            const endpoint = shouldMute ? 'mute' : 'unmute';
            await api.post(`/room/${currentRoom.id}/${endpoint}`, {
                adminUserId: currentUser.id,
                targetUserId: userId
            });
        } catch (error) {
            console.error('Failed to toggle mute:', error);
            alert('Failed to change mute status.');
        }
    }
    
    // --- UTILITY FUNCTIONS ---
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // --- START THE APP ---
    init();
    
    // Add click handler to enable audio context on user interaction
    document.addEventListener('click', function enableAudio() {
        // Try to resume any suspended audio contexts
        if (typeof AudioContext !== 'undefined') {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            if (audioContext.state === 'suspended') {
                audioContext.resume().then(() => {
                    console.log('Audio context resumed');
                });
            }
        }
        // Remove this listener after first click
        document.removeEventListener('click', enableAudio);
    }, { once: true });
});