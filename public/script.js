// public/script.js (Corrected Version)

document.addEventListener("DOMContentLoaded", () => {
    const statusEl = document.getElementById("status");
    const audioContainer = document.getElementById("audio-container");

    let localStream;
    let peerConnection; // We only need one peer connection for a 2-person chat

    // Use wss:// for secure WebSocket connection
    const socket = new WebSocket(`wss://${window.location.host}/ws`);

    // STUN server configuration
    const peerConnectionConfig = {
        'iceServers': [
            { 'urls': 'stun:stun.l.google.com:19302' },
            { 'urls': 'stun:stun1.l.google.com:19302' }
        ]
    };

    socket.onopen = async () => {
        statusEl.textContent = "Connected! Getting microphone...";
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            statusEl.textContent = "Microphone ready. Waiting for a friend...";
            // Announce our presence to the server, which will broadcast it
            socket.send(JSON.stringify({ type: 'join' }));
        } catch (error) {
            console.error("Error getting user media:", error);
            statusEl.textContent = "Error: Could not access microphone.";
        }
    };

    socket.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log("Received message:", message.type, message);

        // This is the key logic:
        // The first person to join will receive this 'join' message when the second person connects.
        // This makes the first person the "initiator" of the WebRTC call.
        if (message.type === 'join' && !peerConnection) {
            statusEl.textContent = "Friend joined! Creating connection...";
            console.log("Another peer joined. I will initiate the connection.");
            createPeerConnection();
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.send(JSON.stringify({ type: 'offer', offer: offer }));
        }
        // The second person will receive the 'offer' from the first person.
        else if (message.type === 'offer') {
            if (!peerConnection) {
                statusEl.textContent = "Receiving call... Answering...";
                createPeerConnection();
            }
            console.log("Received offer, setting remote description.");
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.send(JSON.stringify({ type: 'answer', answer: answer }));
        }
        // The first person (initiator) receives the 'answer'.
        else if (message.type === 'answer' && peerConnection) {
            console.log("Received answer, setting remote description.");
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
        }
        // Both peers will exchange ICE candidates.
        else if (message.type === 'ice-candidate' && peerConnection) {
            console.log("Adding received ICE candidate.");
            try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
            } catch (e) {
                console.error('Error adding received ice candidate', e);
            }
        }
    };

    function createPeerConnection() {
        console.log("Creating Peer Connection.");
        peerConnection = new RTCPeerConnection(peerConnectionConfig);

        // Event handler for when the remote peer sends a stream
        peerConnection.ontrack = (event) => {
            console.log("Track received from remote peer.");
            statusEl.textContent = "Connected! You can now talk.";
            const remoteAudio = document.createElement('audio');
            remoteAudio.id = "remote-audio";
            remoteAudio.autoplay = true;
            remoteAudio.controls = true;
            remoteAudio.srcObject = event.streams[0];
            // Prevent adding multiple audio elements
            if (!document.getElementById("remote-audio")) {
                audioContainer.appendChild(remoteAudio);
            }
        };

        // Event handler to send ICE candidates to the other peer
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("Sending ICE candidate.");
                socket.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
            }
        };

        // Add our local microphone stream to the connection so the other peer can hear us
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }
    }
    
    socket.onclose = () => {
        statusEl.textContent = "Disconnected from server.";
        const remoteAudio = document.getElementById("remote-audio");
        if (remoteAudio) {
            remoteAudio.remove();
        }
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
        }
    };

    socket.onerror = (error) => {
        console.error("WebSocket Error:", error);
        statusEl.textContent = "Connection error.";
    };
});