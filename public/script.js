// public/script.js
document.addEventListener("DOMContentLoaded", () => {
    // --- STATE MANAGEMENT ---
    let currentUser = null;
    let localStream = null;
    let socket = null;
    let peerConnections = {}; // { peerId: RTCPeerConnection }
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
    const loginButton = document.getElementById('login-button');
    const nameInput = document.getElementById('name-input');
    const welcomeMessage = document.getElementById('welcome-message');
    const roomList = document.getElementById('room-list');
    const refreshRoomsButton = document.getElementById('refresh-rooms-button');
    const createRoomButton = document.getElementById('create-room-button');
    const roomNameInput = document.getElementById('room-name-input');
    const isPublicCheckbox = document.getElementById('is-public-checkbox');
    const roomTitle = document.getElementById('room-title');
    const statusEl = document.getElementById('status');
    const audioContainer = document.getElementById('audio-container');
    const leaveRoomButton = document.getElementById('leave-room-button');

    // --- UI LOGIC ---
    function showView(viewName) {
        Object.values(views).forEach(view => view.classList.remove('active'));
        views[viewName].classList.add('active');
    }

    // --- INITIALIZATION ---
    async function init() {
        // Check for existing user in localStorage
        const storedUser = localStorage.getItem('webrtc-user');
        if (storedUser) {
            currentUser = JSON.parse(storedUser);
            showLobby();
        } else {
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
            localStorage.setItem('webrtc-user', JSON.stringify(user));
            showLobby();
        } catch (error) {
            console.error('Login failed:', error);
            alert('Login failed. Please try again.');
        }
    });

    // --- LOBBY LOGIC ---
    async function showLobby() {
        welcomeMessage.textContent = `Welcome, ${currentUser.name}!`;
        showView('lobby');
        await loadPublicRooms();
    }

    async function loadPublicRooms() {
        try {
            const rooms = await api.get('/rooms');
            roomList.innerHTML = '';
            if (rooms.length === 0) {
                roomList.innerHTML = '<li>No public rooms available. Create one!</li>';
            } else {
                rooms.forEach(room => {
                    const li = document.createElement('li');
                    li.textContent = room.name;
                    const joinButton = document.createElement('button');
                    joinButton.textContent = 'Join';
                    joinButton.onclick = () => joinRoom(room.id, room.name);
                    li.appendChild(joinButton);
                    roomList.appendChild(li);
                });
            }
        } catch (error) {
            console.error('Failed to load rooms:', error);
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
            joinRoom(room.id, room.name);
        } catch (error) {
            console.error('Failed to create room:', error);
            alert('Failed to create room.');
        }
    });

    // --- ROOM LOGIC ---
    async function joinRoom(roomId, name) {
        roomTitle.textContent = name;
        showView('room');
        statusEl.textContent = 'Getting microphone...';

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            addLocalAudio();
            statusEl.textContent = 'Connecting to room...';
            connectWebSocket(roomId);
        } catch (error) {
            console.error("Error getting user media:", error);
            statusEl.textContent = "Error: Could not access microphone.";
            showLobby(); // Go back to lobby on error
        }
    }

    function addLocalAudio() {
        const audioCard = createAudioCard('local', 'You (Muted for you)');
        const audio = document.createElement('audio');
        audio.srcObject = localStream;
        audio.muted = true; // Mute self to prevent feedback
        audio.play(); // May not be necessary with autoplay
        audioCard.appendChild(audio);
        audioContainer.appendChild(audioCard);
    }

    leaveRoomButton.addEventListener('click', () => {
        if (socket) {
            socket.close();
        }
        cleanUpRoom();
        showLobby();
    });

    function cleanUpRoom() {
        // Close all peer connections
        for (const peerId in peerConnections) {
            if (peerConnections[peerId]) {
                peerConnections[peerId].close();
            }
        }
        peerConnections = {};

        // Stop local media tracks
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        // Clear UI
        audioContainer.innerHTML = '';
        socket = null;
    }

    // --- WEBSOCKET & WEBRTC LOGIC ---
    function connectWebSocket(roomId) {
        const wsURL = `wss://${window.location.host}/ws/${roomId}?userID=${currentUser.id}`;
        socket = new WebSocket(wsURL);

        socket.onopen = () => {
            statusEl.textContent = 'Connected. Waiting for others...';
        };

        socket.onmessage = async (event) => {
            const message = JSON.parse(event.data);
            console.log("WS Received:", message.type, message);

            switch (message.type) {
                // Initial connection: Server sends list of users already in the room
                case 'existing-users':
                    const { userIds } = JSON.parse(message.payload);
                    statusEl.textContent = `In room with ${userIds.length} other(s).`;
                    // For each existing user, create an offer
                    for (const userId of userIds) {
                        createAndSendOffer(userId);
                    }
                    break;
                
                // Another user joined after you
                case 'user-joined':
                    const { userId: newUserId } = JSON.parse(message.payload);
                    statusEl.textContent = `User ${newUserId.substring(0, 6)}... joined.`;
                    // New user joined, existing clients will ignore this, as the new client initiates contact
                    break;
                
                // A user left
                case 'user-left':
                    const { userId: leftUserId } = JSON.parse(message.payload);
                    statusEl.textContent = `User ${leftUserId.substring(0, 6)}... left.`;
                    if (peerConnections[leftUserId]) {
                        peerConnections[leftUserId].close();
                        delete peerConnections[leftUserId];
                        document.getElementById(`audio-card-${leftUserId}`)?.remove();
                    }
                    break;

                // Received an offer from a peer
                case 'webrtc-offer':
                    await handleOffer(message.sender, JSON.parse(message.payload).offer);
                    break;
                
                // Received an answer from a peer
                case 'webrtc-answer':
                    await handleAnswer(message.sender, JSON.parse(message.payload).answer);
                    break;

                // Received an ICE candidate from a peer
                case 'webrtc-ice-candidate':
                    await handleIceCandidate(message.sender, JSON.parse(message.payload).candidate);
                    break;
            }
        };

        socket.onclose = () => {
            statusEl.textContent = 'Disconnected.';
            cleanUpRoom();
            showLobby();
        };

        socket.onerror = (err) => {
            console.error("WebSocket Error:", err);
            statusEl.textContent = 'Connection error.';
        };
    }

    function createPeerConnection(peerId) {
        const pc = new RTCPeerConnection(peerConnectionConfig);
        
        // Add local stream tracks
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        // Handle remote stream
        pc.ontrack = (event) => {
            console.log(`Track received from ${peerId}`);
            addRemoteAudio(peerId, event.streams[0]);
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

        peerConnections[peerId] = pc;
        return pc;
    }

    async function createAndSendOffer(peerId) {
        console.log(`Creating offer for ${peerId}`);
        const pc = createPeerConnection(peerId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.send(JSON.stringify({
            type: 'webrtc-offer',
            target: peerId,
            payload: { offer: offer }
        }));
    }

    async function handleOffer(peerId, offer) {
        console.log(`Handling offer from ${peerId}`);
        const pc = createPeerConnection(peerId);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.send(JSON.stringify({
            type: 'webrtc-answer',
            target: peerId,
            payload: { answer: answer }
        }));
    }

    async function handleAnswer(peerId, answer) {
        console.log(`Handling answer from ${peerId}`);
        const pc = peerConnections[peerId];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
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
        if (document.getElementById(`audio-card-${peerId}`)) return; // Already exists

        const audioCard = createAudioCard(peerId, `User ${peerId.substring(0, 6)}...`);
        const audio = document.createElement('audio');
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.controls = true;
        audioCard.appendChild(audio);
        audioContainer.appendChild(audioCard);
    }
    
    function createAudioCard(id, name) {
        const card = document.createElement('div');
        card.className = 'audio-card';
        card.id = `audio-card-${id}`;
        
        const p = document.createElement('p');
        p.textContent = name;
        card.appendChild(p);
        
        return card;
    }

    // --- START THE APP ---
    init();
});