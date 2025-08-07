document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const lobbyView = document.getElementById('lobby-view');
    const roomView = document.getElementById('room-view');
    const userNameInput = document.getElementById('user-name-input');
    const createRoomBtn = document.getElementById('create-room-btn');
    const roomNameInput = document.getElementById('room-name-input');
    const isPublicCheckbox = document.getElementById('is-public-checkbox');
    const publicRoomsList = document.getElementById('public-rooms-list');
    const noRoomsMsg = document.getElementById('no-rooms-msg');
    const roomHeader = document.getElementById('room-header');
    const videoGrid = document.getElementById('video-grid');
    const participantsList = document.getElementById('participants-list');
    const participantCount = document.getElementById('participant-count');
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const muteAudioBtn = document.getElementById('mute-audio-btn');
    const muteVideoBtn = document.getElementById('mute-video-btn');
    const leaveBtn = document.getElementById('leave-btn');

    // --- State Variables ---
    let userId = localStorage.getItem('userId') || uuidv4();
    localStorage.setItem('userId', userId);
    let userName = localStorage.getItem('userName') || '';
    let roomId = null;
    let localStream = null;
    let ws = null;
    let peerConnections = {};
    let isAdmin = false;

    if (userName) {
        userNameInput.value = userName;
    }
    
    // Use Google's public STUN servers. For production, you'd want your own TURN server.
    const peerConnectionConfig = {
        iceServers: [
            { 'urls': 'stun:stun.l.google.com:19302' },
            { 'urls': 'stun:stun1.l.google.com:19302' }
        ]
    };

    // --- Utility Functions ---
    function uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    const API_BASE = `${window.location.protocol}//${window.location.host}/api`;

    // --- Lobby Logic ---
    async function loadPublicRooms() {
        try {
            const response = await fetch(`${API_BASE}/rooms`);
            if (!response.ok) throw new Error('Failed to fetch rooms');
            const rooms = await response.json() || [];

            publicRoomsList.innerHTML = '';
            if (rooms.length === 0) {
                noRoomsMsg.style.display = 'block';
                return;
            }
            noRoomsMsg.style.display = 'none';

            rooms.forEach(room => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${room.name} (${room.memberCount} members)</span>
                    <button class="join-btn" data-room-id="${room.id}">Join</button>
                `;
                publicRoomsList.appendChild(li);
            });
        } catch (error) {
            console.error('Error loading public rooms:', error);
            noRoomsMsg.innerText = 'Could not load rooms.';
            noRoomsMsg.style.display = 'block';
        }
    }

    async function handleCreateRoom() {
        userName = userNameInput.value.trim();
        if (!userName) {
            alert('Please enter your name.');
            return;
        }
        localStorage.setItem('userName', userName);
        
        const roomName = roomNameInput.value.trim();
        if (!roomName) {
            alert('Please enter a room name.');
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/room`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: roomName,
                    isPublic: isPublicCheckbox.checked,
                    creatorId: userId
                })
            });
            if (!response.ok) throw new Error('Failed to create room');
            const room = await response.json();
            joinRoom(room.id, userName);
        } catch (error) {
            console.error('Error creating room:', error);
            alert('Could not create room. See console for details.');
        }
    }

    function handleJoinRoomClick(event) {
        if (event.target.classList.contains('join-btn')) {
            userName = userNameInput.value.trim();
            if (!userName) {
                alert('Please enter your name to join a room.');
                return;
            }
            localStorage.setItem('userName', userName);
            const selectedRoomId = event.target.dataset.roomId;
            joinRoom(selectedRoomId, userName);
        }
    }

    // --- Room Logic ---
    async function joinRoom(rId, uName) {
        roomId = rId;
        userName = uName;

        lobbyView.style.display = 'none';
        roomView.style.display = 'block';

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            addVideoStream(localStream, userId, 'You', true);
            updateMuteButtons();
        } catch (error) {
            console.error('Error accessing media devices.', error);
            alert('Could not access camera and microphone. Please check permissions.');
            leaveRoom();
            return;
        }

        connectWebSocket();
    }
    
    function leaveRoom() {
        if (ws) {
            ws.close();
        }
        
        localStream?.getTracks().forEach(track => track.stop());
        localStream = null;

        for (const peerId in peerConnections) {
            peerConnections[peerId].close();
        }
        peerConnections = {};

        videoGrid.innerHTML = '';
        participantsList.innerHTML = '';
        chatMessages.innerHTML = '';
        isAdmin = false;
        
        roomView.style.display = 'none';
        lobbyView.style.display = 'block';
        loadPublicRooms();
    }


    // --- WebSocket Communication ---
    function connectWebSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProtocol}//${window.location.host}/ws/${roomId}?userID=${userId}&userName=${encodeURIComponent(userName)}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('WebSocket connection established');
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        };

        ws.onclose = () => {
            console.log('WebSocket connection closed');
            alert('Connection to the room has been lost.');
            leaveRoom();
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    function sendMessage(message) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    }

    function handleWebSocketMessage(message) {
        // console.log('Received message:', message);
        switch (message.type) {
            case 'room-info':
                roomHeader.textContent = `${message.payload.roomName}`;
                participantCount.textContent = message.payload.memberCount;
                isAdmin = message.payload.isAdmin;
                updateParticipantList();
                break;
            case 'existing-users':
                // This signals we should create offers for everyone already here
                message.payload.users.forEach(user => {
                    const peerId = user.userId;
                    const pc = createPeerConnection(peerId);
                    // Create offer
                    pc.createOffer()
                        .then(offer => pc.setLocalDescription(offer))
                        .then(() => {
                            sendMessage({
                                type: 'webrtc-offer',
                                target: peerId,
                                payload: pc.localDescription
                            });
                        })
                        .catch(e => console.error(`Error creating offer for ${peerId}:`, e));
                });
                updateParticipantList();
                break;
            case 'user-joined':
                console.log(`User joined: ${message.payload.userName}`);
                participantCount.textContent = message.payload.memberCount;
                updateParticipantList();
                addChatMessage({ system: true, message: `${message.payload.userName} has joined the room.` });
                break;
            case 'user-left':
                console.log(`User left: ${message.payload.userName}`);
                participantCount.textContent = message.payload.memberCount;
                removeVideoStream(message.payload.userId);
                if (peerConnections[message.payload.userId]) {
                    peerConnections[message.payload.userId].close();
                    delete peerConnections[message.payload.userId];
                }
                updateParticipantList();
                 addChatMessage({ system: true, message: `${message.payload.userName} has left the room.` });
                break;
            case 'webrtc-offer':
                handleOffer(message);
                break;
            case 'webrtc-answer':
                handleAnswer(message);
                break;
            case 'webrtc-ice-candidate':
                handleIceCandidate(message);
                break;
            case 'chat-message':
                addChatMessage(message.payload);
                break;
            case 'user-muted':
            case 'user-unmuted':
                updateParticipantList(); // Easiest way to refresh mute status
                break;
            default:
                console.warn('Unknown message type received:', message.type);
        }
    }

    // --- WebRTC Signaling and Peer Connection Logic ---
    function createPeerConnection(peerId) {
        if (peerConnections[peerId]) {
            return peerConnections[peerId];
        }
        const pc = new RTCPeerConnection(peerConnectionConfig);
        peerConnections[peerId] = pc;

        // Add local stream tracks to the new connection
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                sendMessage({
                    type: 'webrtc-ice-candidate',
                    target: peerId,
                    payload: event.candidate
                });
            }
        };

        pc.ontrack = (event) => {
            // When a remote track is received, add it to a video element
            const stream = event.streams[0];
            // Find the user name from participants list
            const pList = document.getElementById(`participant-${peerId}`);
            const pName = pList ? pList.dataset.username : 'Peer';
            addVideoStream(stream, peerId, pName, false);
        };
        
        pc.oniceconnectionstatechange = () => {
            if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'closed') {
                console.log(`ICE connection state for ${peerId}: ${pc.iceConnectionState}. Cleaning up.`);
                removeVideoStream(peerId);
                delete peerConnections[peerId];
            }
        };

        return pc;
    }

    function handleOffer(message) {
        const peerId = message.sender;
        const pc = createPeerConnection(peerId);
        pc.setRemoteDescription(new RTCSessionDescription(message.payload))
            .then(() => pc.createAnswer())
            .then(answer => pc.setLocalDescription(answer))
            .then(() => {
                sendMessage({
                    type: 'webrtc-answer',
                    target: peerId,
                    payload: pc.localDescription
                });
            })
            .catch(e => console.error(`Error handling offer from ${peerId}:`, e));
    }

    function handleAnswer(message) {
        const peerId = message.sender;
        const pc = peerConnections[peerId];
        if (pc) {
            pc.setRemoteDescription(new RTCSessionDescription(message.payload))
                .catch(e => console.error(`Error setting remote description for ${peerId}:`, e));
        }
    }

    function handleIceCandidate(message) {
        const peerId = message.sender;
        const pc = peerConnections[peerId];
        if (pc) {
            pc.addIceCandidate(new RTCIceCandidate(message.payload))
                .catch(e => console.error(`Error adding ICE candidate from ${peerId}:`, e));
        }
    }

    // --- UI Update Functions ---
    function addVideoStream(stream, peerId, name, isLocal = false) {
        let videoWrapper = document.getElementById(`video-wrapper-${peerId}`);
        if (videoWrapper) {
            videoWrapper.querySelector('video').srcObject = stream; // Update stream
            return;
        }

        videoWrapper = document.createElement('div');
        videoWrapper.id = `video-wrapper-${peerId}`;
        videoWrapper.className = 'video-wrapper';

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsInline = true;
        if (isLocal) {
            video.muted = true; // Mute own video to prevent feedback
        }

        const nameTag = document.createElement('div');
        nameTag.className = 'user-name';
        nameTag.textContent = name;

        videoWrapper.appendChild(video);
        videoWrapper.appendChild(nameTag);
        videoGrid.appendChild(videoWrapper);
    }

    function removeVideoStream(peerId) {
        const videoWrapper = document.getElementById(`video-wrapper-${peerId}`);
        if (videoWrapper) {
            videoWrapper.remove();
        }
    }

    async function updateParticipantList() {
        if (!roomId) return;
        try {
            const response = await fetch(`${API_BASE}/room/${roomId}/members`);
            const members = await response.json();
            participantsList.innerHTML = '';
            
            // Add self to the list visually
            const self = { userId, userName, isMuted: !localStream.getAudioTracks()[0].enabled, isAdmin };
            const allMembers = [self, ...members.filter(m => m.userId !== userId)];
            
            participantCount.textContent = allMembers.length;

            allMembers.forEach(member => {
                const li = document.createElement('li');
                li.className = 'participant-item';
                li.id = `participant-${member.userId}`;
                li.dataset.username = member.userName;
                
                let adminTag = member.isAdmin ? ' (Admin)' : '';
                let muteIcon = member.isMuted ? '🔇' : '🎤';
                let adminControls = '';

                if (isAdmin && member.userId !== userId) {
                    const action = member.isMuted ? 'unmute' : 'mute';
                    adminControls = `<span class="admin-controls"><button data-action="${action}" data-target-id="${member.userId}">${action.charAt(0).toUpperCase() + action.slice(1)}</button></span>`;
                }

                li.innerHTML = `
                    <span>${muteIcon} ${member.userName}${adminTag}</span>
                    ${adminControls}
                `;
                participantsList.appendChild(li);
            });

        } catch (error) {
            console.error('Failed to update participant list:', error);
        }
    }
    
    function addChatMessage(data) {
        const p = document.createElement('p');
        if (data.system) {
            p.innerHTML = `<i>${data.message}</i>`;
        } else {
             p.innerHTML = `<span class="sender">${data.userName}:</span> ${data.message}`;
        }
        chatMessages.appendChild(p);
        chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll
    }
    
    function handleChatSubmit(e) {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (message) {
            sendMessage({
                type: 'chat-message',
                payload: { message }
            });
            chatInput.value = '';
        }
    }

    function toggleAudioMute() {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        updateMuteButtons();
        // Here you could broadcast your new mute status if desired
    }

    function toggleVideoMute() {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        updateMuteButtons();
    }
    
    function updateMuteButtons() {
        if (!localStream) return;
        muteAudioBtn.textContent = localStream.getAudioTracks()[0].enabled ? 'Mute Audio' : 'Unmute Audio';
        muteVideoBtn.textContent = localStream.getVideoTracks()[0].enabled ? 'Mute Video' : 'Unmute Video';
    }
    
    async function handleAdminAction(e) {
        if (e.target.tagName !== 'BUTTON') return;
        
        const action = e.target.dataset.action;
        const targetUserId = e.target.dataset.targetId;

        if (!action || !targetUserId) return;
        
        try {
            const response = await fetch(`${API_BASE}/room/${roomId}/${action}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    adminUserId: userId,
                    targetUserId: targetUserId
                })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Admin action failed');
            }
            // The backend broadcasts the change, so our `user-muted/unmuted` handler will trigger a UI update.
        } catch(error) {
            console.error(`Error performing admin action '${action}':`, error);
            alert(`Failed to ${action} user.`);
        }
    }

    // --- Event Listeners ---
    createRoomBtn.addEventListener('click', handleCreateRoom);
    publicRoomsList.addEventListener('click', handleJoinRoomClick);
    leaveBtn.addEventListener('click', leaveRoom);
    chatForm.addEventListener('submit', handleChatSubmit);
    muteAudioBtn.addEventListener('click', toggleAudioMute);
    muteVideoBtn.addEventListener('click', toggleVideoMute);
    participantsList.addEventListener('click', handleAdminAction);


    // --- Initial Load ---
    loadPublicRooms();
});