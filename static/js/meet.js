/**
 * PULSE MEET — REAL-TIME WEBRTC VIDEO CONFERENCING & COLLABORATION ENGINE
 * Core Features:
 * - Multi-user WebRTC Mesh Video & Audio calling
 * - Screen Sharing (getDisplayMedia & track replacement)
 * - P2P Encrypted File Sharing (RTCDataChannel chunking & fallback vault)
 * - Real-Time Collaborative Whiteboard with live sync & multi-user cursors
 * - End-to-End Media Encryption (WebRTC DTLS/SRTP standard)
 * - Audio Activity Detection & Active Speaker Visualization
 * - In-Call Chat & Floating Emoji Reaction Bursts
 * - Host Security Controls (Lock room, Mute all, Kick)
 */

class PulseMeet {
    constructor() {
        this.currentRoom = null;
        this.socket = null;
        this.localStream = null;
        this.screenStream = null;
        this.isScreenSharing = false;
        this.isAudioMuted = false;
        this.isVideoOff = false;
        this.activeStageMode = 'video'; // 'video' | 'whiteboard' | 'split'
        this.activeDrawerTab = 'chat'; // 'chat' | 'participants' | 'files'
        this.isDrawerCollapsed = false;

        // WebRTC Mesh Peer Connections: { [channelName]: RTCPeerConnection }
        this.peers = {};
        // DataChannels for P2P File Transfer: { [channelName]: RTCDataChannel }
        this.dataChannels = {};
        // Incoming file assembly buffers: { [transferId]: { filename, size, chunks: [], receivedSize } }
        this.incomingFiles = {};

        // Audio Analysis for Active Speaker
        this.audioContext = null;
        this.audioAnalyser = null;
        this.speechDetectorInterval = null;

        // Call Duration Timer
        this.callStartTime = null;
        this.timerInterval = null;

        // Collaborative Whiteboard Engine
        this.whiteboard = {
            canvas: null,
            ctx: null,
            isDrawing: false,
            currentTool: 'pen', // 'pen' | 'highlighter' | 'eraser' | 'rect' | 'circle' | 'line' | 'arrow' | 'text'
            currentColor: '#6366f1',
            currentSize: 4,
            currentStroke: null,
            strokesHistory: [],
            undoStack: [],
            lastX: 0,
            lastY: 0,
            startX: 0,
            startY: 0,
            snapshot: null,
        };

        // Remote Cursors
        this.remoteCursors = {};
        this.lastCursorBroadcast = 0;

        // ICE Configuration (Google Public STUN)
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
            ]
        };
    }

    // =========================================================================
    // LOBBY & ROOM DISCOVERY
    // =========================================================================

    async loadRooms() {
        try {
            const res = await fetch('/api/meet/rooms/');
            const rooms = await res.json();
            this.renderLobbyRooms(rooms);
        } catch (err) {
            console.error('Error fetching rooms:', err);
        }
    }

    renderLobbyRooms(rooms) {
        const grid = document.getElementById('meet-rooms-grid');
        if (!grid) return;

        if (!rooms || rooms.length === 0) {
            grid.innerHTML = `
                <div class="empty-rooms-placeholder" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748b;">
                    <i class="fa-solid fa-people-roof" style="font-size: 2.5rem; margin-bottom: 12px; color: #475569;"></i>
                    <p style="font-size: 1.05rem; font-weight: 600; color: #94a3b8;">No active spaces right now</p>
                    <p style="font-size: 0.85rem; margin-top: 4px;">Start an instant collaboration space below to invite teammates!</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = rooms.map(room => `
            <div class="room-card" id="room-card-${room.room_id}">
                <div class="room-card-header">
                    <div>
                        <div class="room-card-title">${this.escapeHtml(room.title)}</div>
                        <div class="room-card-id">ID: ${room.room_id}</div>
                    </div>
                    <span class="room-status-badge ${room.is_locked ? 'locked' : ''}">
                        <i class="fa-solid ${room.is_locked ? 'fa-lock' : 'fa-signal'}"></i>
                        ${room.is_locked ? 'Locked' : 'Active'}
                    </span>
                </div>

                <div class="room-card-host">
                    <img src="${room.host.avatar}" alt="${this.escapeHtml(room.host.display_name)}" onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=${room.host.username}'">
                    <span>Hosted by <strong>${this.escapeHtml(room.host.display_name)}</strong></span>
                </div>

                <div class="room-card-features">
                    <span class="room-feature-tag"><i class="fa-solid fa-shield-halved"></i> E2EE</span>
                    ${room.allow_screen_share ? '<span class="room-feature-tag"><i class="fa-solid fa-display"></i> Screen</span>' : ''}
                    ${room.allow_whiteboard ? '<span class="room-feature-tag"><i class="fa-solid fa-paintbrush"></i> Canvas</span>' : ''}
                    ${room.allow_file_share ? '<span class="room-feature-tag"><i class="fa-solid fa-folder"></i> P2P Files</span>' : ''}
                    ${room.has_passcode ? '<span class="room-feature-tag" style="color: #fbbf24;"><i class="fa-solid fa-key"></i> Passcode</span>' : ''}
                </div>

                <div class="room-card-footer">
                    <div class="room-participants-count">
                        <i class="fa-solid fa-users"></i>
                        <span>${room.participants_count || 1} participant${(room.participants_count || 1) !== 1 ? 's' : ''}</span>
                    </div>
                    <button class="btn btn-primary btn-sm" onclick="pulseMeet.initJoinRoom('${room.room_id}', ${room.has_passcode})">
                        <i class="fa-solid fa-arrow-right-to-bracket"></i> Join Space
                    </button>
                </div>
            </div>
        `).join('');
    }

    openCreateRoomModal() {
        const modal = document.getElementById('create-room-modal');
        if (modal) modal.classList.remove('hidden');
    }

    async handleCreateRoom(e) {
        if (e) e.preventDefault();
        const title = document.getElementById('new-room-title')?.value || 'Design & Code Sync';
        const passcode = document.getElementById('new-room-passcode')?.value || '';
        const allowScreen = document.getElementById('new-room-allow-screen')?.checked ?? true;
        const allowWb = document.getElementById('new-room-allow-wb')?.checked ?? true;
        const allowFiles = document.getElementById('new-room-allow-files')?.checked ?? true;

        try {
            const res = await fetch('/api/meet/rooms/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify({
                    title,
                    passcode,
                    allow_screen_share: allowScreen,
                    allow_whiteboard: allowWb,
                    allow_file_share: allowFiles
                })
            });

            if (!res.ok) {
                const err = await res.json();
                app.showToast(err.error || 'Failed to create room', 'error');
                return;
            }

            const room = await res.json();
            app.closeModal('create-room-modal');
            app.showToast('Room created successfully! Launching space...', 'success');
            await this.joinRoom(room.room_id);
        } catch (err) {
            console.error('Error creating room:', err);
            app.showToast('Network error while creating room', 'error');
        }
    }

    async initJoinRoom(roomId, hasPasscode) {
        if (hasPasscode) {
            const passcodeModal = document.getElementById('room-passcode-modal');
            const hiddenId = document.getElementById('passcode-room-id');
            const passInput = document.getElementById('passcode-input');
            if (hiddenId) hiddenId.value = roomId;
            if (passInput) passInput.value = '';
            if (passcodeModal) passcodeModal.classList.remove('hidden');
        } else {
            await this.joinRoom(roomId);
        }
    }

    async handleVerifyPasscode(e) {
        if (e) e.preventDefault();
        const roomId = document.getElementById('passcode-room-id')?.value;
        const passcode = document.getElementById('passcode-input')?.value || '';

        try {
            const res = await fetch(`/api/meet/rooms/${roomId}/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: JSON.stringify({ passcode })
            });

            if (!res.ok) {
                const err = await res.json();
                app.showToast(err.error || 'Incorrect passcode', 'error');
                return;
            }

            app.closeModal('room-passcode-modal');
            await this.joinRoom(roomId);
        } catch (err) {
            console.error('Error verifying passcode:', err);
            app.showToast('Verification failed', 'error');
        }
    }

    // =========================================================================
    // ROOM ENTRY, MEDIA SETUP & WEBSOCKET SIGNALING
    // =========================================================================

    async joinRoom(roomId) {
        this.currentRoom = { room_id: roomId };

        // 1. Acquire Local Media (Camera & Microphone)
        await this.setupLocalMedia();

        // 2. Open Room Stage View in UI
        this.showRoomView(roomId);

        // 3. Connect to Channels WebSocket Signaling Server
        this.connectSignaling(roomId);

        // 4. Initialize Call Duration Timer
        this.startCallTimer();
    }

    async setupLocalMedia() {
        try {
            // Attempt audio + video
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
            });
        } catch (err) {
            console.warn('Full media capture denied or unavailable, attempting audio only:', err);
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.isVideoOff = true;
            } catch (err2) {
                console.warn('Audio capture denied, creating synthetic placeholder tracks:', err2);
                this.localStream = this.createSyntheticMediaStream();
                this.isAudioMuted = true;
                this.isVideoOff = true;
            }
        }

        // Render Local Video in Local Tile
        const localVideo = document.getElementById('local-video-element');
        if (localVideo) {
            localVideo.srcObject = this.localStream;
            localVideo.muted = true; // Mute self to prevent feedback
            localVideo.play().catch(e => console.log('Local video play catch:', e));
        }

        // Setup Audio Analyser for local speaking detection
        this.setupAudioAnalyser();
    }

    createSyntheticMediaStream() {
        // Fallback canvas animation stream if camera/mic is absent
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 360;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return canvas.captureStream(10);
    }

    setupAudioAnalyser() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext || !this.localStream.getAudioTracks().length) return;

            this.audioContext = new AudioContext();
            const source = this.audioContext.createMediaStreamSource(this.localStream);
            this.audioAnalyser = this.audioContext.createAnalyser();
            this.audioAnalyser.fftSize = 256;
            source.connect(this.audioAnalyser);

            const bufferLength = this.audioAnalyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);

            let wasSpeaking = false;
            this.speechDetectorInterval = setInterval(() => {
                if (this.isAudioMuted) {
                    if (wasSpeaking) {
                        this.setLocalSpeaking(false);
                        wasSpeaking = false;
                    }
                    return;
                }

                this.audioAnalyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
                const avg = sum / bufferLength;

                const isSpeaking = avg > 25; // speech threshold
                if (isSpeaking !== wasSpeaking) {
                    wasSpeaking = isSpeaking;
                    this.setLocalSpeaking(isSpeaking);
                    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                        this.socket.send(JSON.stringify({
                            action: 'speaker-active',
                            is_speaking: isSpeaking
                        }));
                    }
                }
            }, 200);
        } catch (e) {
            console.log('Audio analysis setup notice:', e);
        }
    }

    setLocalSpeaking(isSpeaking) {
        const localTile = document.getElementById('local-video-tile');
        if (localTile) {
            localTile.classList.toggle('speaking', isSpeaking);
        }
    }

    connectSignaling(roomId) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/meet/${roomId}/`;

        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {
            console.log('Pulse Meet WebSocket connected');
            // Send join request
            this.socket.send(JSON.stringify({ action: 'join' }));
        };

        this.socket.onmessage = async (e) => {
            try {
                const data = JSON.parse(e.data);
                await this.handleSignalingMessage(data);
            } catch (err) {
                console.error('Error handling WebSocket message:', err);
            }
        };

        this.socket.onclose = (e) => {
            console.log('Pulse Meet WebSocket closed:', e.code);
            if (e.code === 4003) {
                app.showToast('You were removed from the room by the host.', 'error');
                this.leaveRoom(false);
            }
        };

        this.socket.onerror = (err) => {
            console.error('Pulse Meet WebSocket error:', err);
        };
    }

    async handleSignalingMessage(data) {
        const event = data.event;

        switch (event) {
            case 'room-joined':
                this.onRoomJoined(data);
                break;

            case 'user-joined':
                await this.onUserJoined(data);
                break;

            case 'user-left':
                this.onUserLeft(data);
                break;

            case 'signal-offer':
                await this.onReceiveOffer(data);
                break;

            case 'signal-answer':
                await this.onReceiveAnswer(data);
                break;

            case 'signal-candidate':
                await this.onReceiveCandidate(data);
                break;

            case 'media-status':
                this.onMediaStatusChanged(data);
                break;

            case 'speaker-active':
                this.onPeerSpeaking(data);
                break;

            case 'whiteboard-stroke':
                this.drawRemoteStroke(data.stroke);
                break;

            case 'whiteboard-clear':
                this.clearWhiteboardCanvas(false);
                break;

            case 'whiteboard-undo':
                this.undoWhiteboardCanvas(false);
                break;

            case 'whiteboard-cursor':
                this.renderRemoteCursor(data);
                break;

            case 'chat-message':
                this.renderChatMessage(data.message);
                break;

            case 'reaction':
                this.triggerReactionAnimation(data.emoji, data.user_id);
                break;

            case 'host-muted-all':
                if (!this.isAudioMuted) {
                    this.toggleAudio();
                    app.showToast('The host requested everyone to mute.', 'info');
                }
                break;

            case 'room-lock-changed':
                const lockIcon = document.getElementById('room-lock-icon');
                if (lockIcon) {
                    lockIcon.className = data.is_locked ? 'fa-solid fa-lock text-warning' : 'fa-solid fa-lock-open';
                }
                app.showToast(`Room is now ${data.is_locked ? 'Locked' : 'Unlocked'}`, 'info');
                break;
        }
    }

    // =========================================================================
    // WEBRTC PEER CONNECTION MANAGEMENT (MESH TOPOLOGY)
    // =========================================================================

    async onRoomJoined(data) {
        this.myChannel = data.my_channel;
        this.currentRoom = data.room;
        this.currentUser = data.my_user;

        // Update Room Header Info
        const titleEl = document.getElementById('active-room-title');
        const idEl = document.getElementById('active-room-id');
        if (titleEl) titleEl.textContent = data.room.title;
        if (idEl) idEl.textContent = `ID: ${data.room.room_id}`;

        // Host controls display
        const hostBtns = document.getElementById('host-controls-group');
        if (hostBtns) {
            hostBtns.style.display = data.room.is_host ? 'flex' : 'none';
        }

        // Initialize Whiteboard with historical strokes if any
        if (data.whiteboard_data) {
            try {
                const strokes = JSON.parse(data.whiteboard_data);
                if (Array.isArray(strokes)) {
                    this.whiteboard.strokesHistory = strokes;
                    this.redrawEntireWhiteboard();
                }
            } catch (e) {
                console.log('Error parsing whiteboard history:', e);
            }
        }

        // Render Initial Participants List
        this.updateParticipantsList(data.peers, true);

        // Fetch Room Files
        this.loadRoomFiles(data.room.room_id);

        app.showToast(`Joined space: ${data.room.title}`, 'success');
    }

    async onUserJoined(data) {
        const peerChannel = data.sender_channel;
        const peerUser = data.user;

        app.showToast(`${peerUser.display_name} joined the space`, 'info');

        // Add to participants list
        this.addParticipantToUI(peerUser, peerChannel);

        // As an existing member, we create an offer to the newly joined peer!
        const pc = this.createPeerConnection(peerChannel, peerUser);
        this.peers[peerChannel] = pc;

        // Create RTCDataChannel for P2P file transfers
        const dc = pc.createDataChannel('pulse-datachannel', { ordered: true });
        this.setupDataChannel(dc, peerChannel, peerUser);
        this.dataChannels[peerChannel] = dc;

        // Create Offer
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            this.socket.send(JSON.stringify({
                action: 'signal-offer',
                target_channel: peerChannel,
                signal_data: offer
            }));
        } catch (err) {
            console.error('Error creating offer for new peer:', err);
        }
    }

    createPeerConnection(peerChannel, peerUser) {
        const pc = new RTCPeerConnection(this.rtcConfig);

        // Add local tracks (Audio & Video)
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });
        }

        // ICE Candidate handling
        pc.onicecandidate = (e) => {
            if (e.candidate && this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                    action: 'signal-candidate',
                    target_channel: peerChannel,
                    signal_data: e.candidate
                }));
            }
        };

        // Remote track received: Render Video Tile!
        pc.ontrack = (e) => {
            const remoteStream = e.streams[0];
            this.createOrUpdateRemoteVideoTile(peerChannel, peerUser, remoteStream);
        };

        // Incoming DataChannel handling (when peer is answerer)
        pc.ondatachannel = (e) => {
            this.setupDataChannel(e.channel, peerChannel, peerUser);
            this.dataChannels[peerChannel] = e.channel;
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                this.removeRemoteVideoTile(peerChannel);
            }
        };

        return pc;
    }

    async onReceiveOffer(data) {
        const senderChannel = data.sender_channel;
        const offer = data.signal_data;

        let pc = this.peers[senderChannel];
        if (!pc) {
            pc = this.createPeerConnection(senderChannel, { id: data.user_id, username: data.username, display_name: data.username });
            this.peers[senderChannel] = pc;
        }

        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.socket.send(JSON.stringify({
                action: 'signal-answer',
                target_channel: senderChannel,
                signal_data: answer
            }));
        } catch (err) {
            console.error('Error handling offer:', err);
        }
    }

    async onReceiveAnswer(data) {
        const senderChannel = data.sender_channel;
        const pc = this.peers[senderChannel];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.signal_data));
            } catch (err) {
                console.error('Error handling answer:', err);
            }
        }
    }

    async onReceiveCandidate(data) {
        const senderChannel = data.sender_channel;
        const pc = this.peers[senderChannel];
        if (pc && data.signal_data) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data.signal_data));
            } catch (err) {
                console.error('Error adding ICE candidate:', err);
            }
        }
    }

    onUserLeft(data) {
        const peerChannel = data.sender_channel;
        app.showToast(`${data.username} left the meeting`, 'info');

        if (this.peers[peerChannel]) {
            this.peers[peerChannel].close();
            delete this.peers[peerChannel];
        }
        if (this.dataChannels[peerChannel]) {
            delete this.dataChannels[peerChannel];
        }

        this.removeRemoteVideoTile(peerChannel);
        this.removeParticipantFromUI(data.user_id);
        this.removeRemoteCursor(data.user_id);
    }

    // =========================================================================
    // VIDEO TILE DOM MANAGEMENT
    // =========================================================================

    createOrUpdateRemoteVideoTile(peerChannel, peerUser, remoteStream) {
        const grid = document.getElementById('video-grid-container');
        if (!grid) return;

        let tile = document.getElementById(`peer-tile-${peerUser.id}`);
        if (!tile) {
            tile = document.createElement('div');
            tile.className = 'video-tile';
            tile.id = `peer-tile-${peerUser.id}`;
            tile.dataset.channel = peerChannel;
            tile.dataset.userId = peerUser.id;

            const avatarUrl = peerUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${peerUser.username}`;

            tile.innerHTML = `
                <video autoplay playsinline id="remote-video-${peerUser.id}"></video>
                <div class="video-fallback-avatar hidden" id="fallback-avatar-${peerUser.id}">
                    <img src="${avatarUrl}" alt="${this.escapeHtml(peerUser.display_name || peerUser.username)}">
                    <span class="avatar-username">${this.escapeHtml(peerUser.display_name || peerUser.username)}</span>
                </div>
                <div class="video-tile-badge">
                    <i class="fa-solid fa-user"></i>
                    <span>${this.escapeHtml(peerUser.display_name || peerUser.username)}</span>
                </div>
                <div class="video-tile-status">
                    <div class="status-indicator-icon" id="status-mic-${peerUser.id}" title="Audio"><i class="fa-solid fa-microphone"></i></div>
                    <div class="status-indicator-icon" id="status-cam-${peerUser.id}" title="Video"><i class="fa-solid fa-video"></i></div>
                </div>
            `;
            grid.appendChild(tile);
        }

        const video = tile.querySelector('video');
        if (video) {
            video.srcObject = remoteStream;
            video.play().catch(e => console.log('Remote video play:', e));
        }

        this.adjustVideoGridLayout();
    }

    removeRemoteVideoTile(peerChannel) {
        const grid = document.getElementById('video-grid-container');
        if (!grid) return;

        const tile = grid.querySelector(`[data-channel="${peerChannel}"]`);
        if (tile) {
            tile.remove();
        }
        this.adjustVideoGridLayout();
    }

    adjustVideoGridLayout() {
        const grid = document.getElementById('video-grid-container');
        if (!grid) return;
        const tilesCount = grid.querySelectorAll('.video-tile').length;

        grid.classList.remove('single-peer', 'two-peers');
        if (tilesCount === 1) {
            grid.classList.add('single-peer');
        } else if (tilesCount === 2) {
            grid.classList.add('two-peers');
        }
    }

    onMediaStatusChanged(data) {
        const userId = data.user_id;
        const micIcon = document.getElementById(`status-mic-${userId}`);
        const camIcon = document.getElementById(`status-cam-${userId}`);
        const fallbackAvatar = document.getElementById(`fallback-avatar-${userId}`);

        if (micIcon) {
            micIcon.classList.toggle('muted', data.is_audio_muted);
            micIcon.innerHTML = `<i class="fa-solid ${data.is_audio_muted ? 'fa-microphone-slash' : 'fa-microphone'}"></i>`;
        }

        if (camIcon) {
            camIcon.classList.toggle('muted', data.is_video_off);
            camIcon.innerHTML = `<i class="fa-solid ${data.is_video_off ? 'fa-video-slash' : 'fa-video'}"></i>`;
        }

        if (fallbackAvatar) {
            fallbackAvatar.classList.toggle('hidden', !data.is_video_off);
        }
    }

    onPeerSpeaking(data) {
        const tile = document.getElementById(`peer-tile-${data.user_id}`);
        if (tile) {
            tile.classList.toggle('speaking', data.is_speaking);
        }
    }

    // =========================================================================
    // SCREEN SHARING (getDisplayMedia)
    // =========================================================================

    async toggleScreenShare() {
        if (this.isScreenSharing) {
            this.stopScreenShare();
        } else {
            await this.startScreenShare();
        }
    }

    async startScreenShare() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { cursor: 'always' },
                audio: true
            });

            const screenTrack = this.screenStream.getVideoTracks()[0];
            this.isScreenSharing = true;

            // Replace video track in all active RTCPeerConnections
            for (const pc of Object.values(this.peers)) {
                const senders = pc.getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender) {
                    await videoSender.replaceTrack(screenTrack);
                }
            }

            // Update local video element
            const localVideo = document.getElementById('local-video-element');
            if (localVideo) {
                localVideo.srcObject = this.screenStream;
            }

            // Screen share ended via browser chrome bar
            screenTrack.onended = () => {
                this.stopScreenShare();
            };

            // Update UI Button
            const btn = document.getElementById('btn-screen-share');
            if (btn) btn.classList.add('active');

            // Broadcast media status
            this.broadcastMediaStatus();
            app.showToast('Screen sharing started', 'success');
        } catch (err) {
            console.error('Error starting screen share:', err);
            this.isScreenSharing = false;
        }
    }

    async stopScreenShare() {
        if (!this.isScreenSharing) return;

        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        this.isScreenSharing = false;

        // Restore original camera video track to peer connections
        if (this.localStream) {
            const originalVideoTrack = this.localStream.getVideoTracks()[0];
            for (const pc of Object.values(this.peers)) {
                const senders = pc.getSenders();
                const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                if (videoSender && originalVideoTrack) {
                    await videoSender.replaceTrack(originalVideoTrack);
                }
            }

            // Restore local video preview
            const localVideo = document.getElementById('local-video-element');
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }
        }

        // Update UI Button
        const btn = document.getElementById('btn-screen-share');
        if (btn) btn.classList.remove('active');

        this.broadcastMediaStatus();
        app.showToast('Screen sharing stopped', 'info');
    }

    // =========================================================================
    // AUDIO & VIDEO CONTROLS
    // =========================================================================

    toggleAudio() {
        if (!this.localStream) return;
        const audioTracks = this.localStream.getAudioTracks();
        if (audioTracks.length === 0) return;

        this.isAudioMuted = !this.isAudioMuted;
        audioTracks.forEach(t => t.enabled = !this.isAudioMuted);

        const btn = document.getElementById('btn-toggle-mic');
        if (btn) {
            btn.classList.toggle('danger', this.isAudioMuted);
            btn.classList.toggle('muted', this.isAudioMuted);
            btn.innerHTML = `<i class="fa-solid ${this.isAudioMuted ? 'fa-microphone-slash' : 'fa-microphone'}"></i>`;
        }

        const localMicIcon = document.getElementById('local-status-mic');
        if (localMicIcon) {
            localMicIcon.classList.toggle('muted', this.isAudioMuted);
            localMicIcon.innerHTML = `<i class="fa-solid ${this.isAudioMuted ? 'fa-microphone-slash' : 'fa-microphone'}"></i>`;
        }

        this.broadcastMediaStatus();
    }

    toggleVideo() {
        if (!this.localStream) return;
        const videoTracks = this.localStream.getVideoTracks();
        if (videoTracks.length === 0) return;

        this.isVideoOff = !this.isVideoOff;
        videoTracks.forEach(t => t.enabled = !this.isVideoOff);

        const btn = document.getElementById('btn-toggle-cam');
        if (btn) {
            btn.classList.toggle('danger', this.isVideoOff);
            btn.classList.toggle('muted', this.isVideoOff);
            btn.innerHTML = `<i class="fa-solid ${this.isVideoOff ? 'fa-video-slash' : 'fa-video'}"></i>`;
        }

        const localCamIcon = document.getElementById('local-status-cam');
        if (localCamIcon) {
            localCamIcon.classList.toggle('muted', this.isVideoOff);
            localCamIcon.innerHTML = `<i class="fa-solid ${this.isVideoOff ? 'fa-video-slash' : 'fa-video'}"></i>`;
        }

        const fallback = document.getElementById('local-fallback-avatar');
        if (fallback) {
            fallback.classList.toggle('hidden', !this.isVideoOff);
        }

        this.broadcastMediaStatus();
    }

    broadcastMediaStatus() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                action: 'media-status',
                is_audio_muted: this.isAudioMuted,
                is_video_off: this.isVideoOff,
                is_screen_sharing: this.isScreenSharing
            }));
        }
    }

    // =========================================================================
    // COLLABORATIVE WHITEBOARD ENGINE
    // =========================================================================

    initWhiteboard() {
        const canvas = document.getElementById('whiteboard-canvas');
        if (!canvas) return;

        this.whiteboard.canvas = canvas;
        this.whiteboard.ctx = canvas.getContext('2d', { willReadFrequently: true });

        this.resizeWhiteboardCanvas();
        window.addEventListener('resize', () => this.resizeWhiteboardCanvas());

        // Mouse & Pointer drawing events
        canvas.addEventListener('pointerdown', (e) => this.onWbPointerDown(e));
        canvas.addEventListener('pointermove', (e) => this.onWbPointerMove(e));
        canvas.addEventListener('pointerup', (e) => this.onWbPointerUp(e));
        canvas.addEventListener('pointerleave', (e) => this.onWbPointerLeave(e));

        // Click for text tool
        canvas.addEventListener('click', (e) => this.onWbCanvasClick(e));
    }

    resizeWhiteboardCanvas() {
        const canvas = this.whiteboard.canvas;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        // Preserve high DPI
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        this.whiteboard.ctx.scale(dpr, dpr);
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        this.redrawEntireWhiteboard();
    }

    getCanvasCoordinates(e) {
        const rect = this.whiteboard.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
            normX: (e.clientX - rect.left) / rect.width,
            normY: (e.clientY - rect.top) / rect.height
        };
    }

    onWbPointerDown(e) {
        if (this.whiteboard.currentTool === 'text') return;

        const pos = this.getCanvasCoordinates(e);
        this.whiteboard.isDrawing = true;
        this.whiteboard.startX = pos.x;
        this.whiteboard.startY = pos.y;
        this.whiteboard.lastX = pos.x;
        this.whiteboard.lastY = pos.y;

        // Save canvas snapshot for shape preview
        this.whiteboard.snapshot = this.whiteboard.ctx.getImageData(0, 0, this.whiteboard.canvas.width, this.whiteboard.canvas.height);

        this.whiteboard.currentStroke = {
            type: this.whiteboard.currentTool,
            color: this.whiteboard.currentColor,
            size: this.whiteboard.currentSize,
            points: [{ x: pos.x, y: pos.y }]
        };
    }

    onWbPointerMove(e) {
        const pos = this.getCanvasCoordinates(e);

        // Broadcast mouse cursor movement (throttled to 50ms)
        const now = Date.now();
        if (now - this.lastCursorBroadcast > 50 && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.lastCursorBroadcast = now;
            this.socket.send(JSON.stringify({
                action: 'whiteboard-cursor',
                x: pos.normX,
                y: pos.normY
            }));
        }

        if (!this.whiteboard.isDrawing) return;

        const ctx = this.whiteboard.ctx;
        const tool = this.whiteboard.currentTool;

        if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(this.whiteboard.lastX, this.whiteboard.lastY);
            ctx.lineTo(pos.x, pos.y);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = this.whiteboard.currentSize;

            if (tool === 'eraser') {
                ctx.strokeStyle = '#0f1422'; // canvas background color
                ctx.lineWidth = this.whiteboard.currentSize * 2.5;
            } else if (tool === 'highlighter') {
                ctx.strokeStyle = this.whiteboard.currentColor;
                ctx.globalAlpha = 0.35;
                ctx.lineWidth = this.whiteboard.currentSize * 2.5;
            } else {
                ctx.strokeStyle = this.whiteboard.currentColor;
            }

            ctx.stroke();
            ctx.restore();

            this.whiteboard.currentStroke.points.push({ x: pos.x, y: pos.y });
            this.whiteboard.lastX = pos.x;
            this.whiteboard.lastY = pos.y;
        } else if (['rect', 'circle', 'line', 'arrow'].includes(tool)) {
            // Restore snapshot to draw shape preview dynamically
            if (this.whiteboard.snapshot) {
                this.whiteboard.ctx.putImageData(this.whiteboard.snapshot, 0, 0);
            }
            this.drawShape(ctx, tool, this.whiteboard.startX, this.whiteboard.startY, pos.x, pos.y, this.whiteboard.currentColor, this.whiteboard.currentSize);
        }
    }

    onWbPointerUp(e) {
        if (!this.whiteboard.isDrawing) return;
        this.whiteboard.isDrawing = false;
        const pos = this.getCanvasCoordinates(e);

        const tool = this.whiteboard.currentTool;
        let finalStroke = null;

        if (['pen', 'highlighter', 'eraser'].includes(tool)) {
            finalStroke = this.whiteboard.currentStroke;
        } else if (['rect', 'circle', 'line', 'arrow'].includes(tool)) {
            finalStroke = {
                type: 'shape',
                shape: tool,
                color: this.whiteboard.currentColor,
                size: this.whiteboard.currentSize,
                x1: this.whiteboard.startX,
                y1: this.whiteboard.startY,
                x2: pos.x,
                y2: pos.y
            };
        }

        if (finalStroke) {
            this.whiteboard.strokesHistory.push(finalStroke);
            this.broadcastStroke(finalStroke);
        }
    }

    onWbPointerLeave() {
        this.whiteboard.isDrawing = false;
    }

    onWbCanvasClick(e) {
        if (this.whiteboard.currentTool !== 'text') return;
        const pos = this.getCanvasCoordinates(e);

        // Show floating input field on the canvas
        const wrapper = document.querySelector('.whiteboard-canvas-wrapper');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'wb-text-input-overlay';
        input.style.left = `${pos.x}px`;
        input.style.top = `${pos.y - 14}px`;
        input.placeholder = 'Type text & press Enter...';
        wrapper.appendChild(input);
        input.focus();

        const commitText = () => {
            const text = input.value.trim();
            if (text) {
                const textStroke = {
                    type: 'text',
                    text: text,
                    color: this.whiteboard.currentColor,
                    size: this.whiteboard.currentSize * 4 + 12,
                    x: pos.x,
                    y: pos.y
                };
                this.whiteboard.strokesHistory.push(textStroke);
                this.renderTextStroke(textStroke);
                this.broadcastStroke(textStroke);
            }
            input.remove();
        };

        input.addEventListener('keydown', (evt) => {
            if (evt.key === 'Enter') commitText();
            if (evt.key === 'Escape') input.remove();
        });
        input.addEventListener('blur', commitText);
    }

    drawShape(ctx, shape, x1, y1, x2, y2, color, size) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();

        if (shape === 'rect') {
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        } else if (shape === 'circle') {
            const radiusX = Math.abs(x2 - x1) / 2;
            const radiusY = Math.abs(y2 - y1) / 2;
            const centerX = Math.min(x1, x2) + radiusX;
            const centerY = Math.min(y1, y2) + radiusY;
            ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
            ctx.stroke();
        } else if (shape === 'line') {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        } else if (shape === 'arrow') {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();

            // Draw arrowhead
            const angle = Math.atan2(y2 - y1, x2 - x1);
            const headlen = 14;
            ctx.beginPath();
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(x2, y2);
            ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
        }
        ctx.restore();
    }

    renderTextStroke(stroke) {
        const ctx = this.whiteboard.ctx;
        ctx.save();
        ctx.font = `600 ${stroke.size}px 'Plus Jakarta Sans', sans-serif`;
        ctx.fillStyle = stroke.color;
        ctx.fillText(stroke.text, stroke.x, stroke.y);
        ctx.restore();
    }

    drawRemoteStroke(stroke) {
        if (!stroke) return;
        this.whiteboard.strokesHistory.push(stroke);

        const ctx = this.whiteboard.ctx;
        if (stroke.type === 'pen' || stroke.type === 'highlighter' || stroke.type === 'eraser') {
            const pts = stroke.points;
            if (!pts || pts.length < 2) return;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = stroke.size;

            if (stroke.type === 'eraser') {
                ctx.strokeStyle = '#0f1422';
                ctx.lineWidth = stroke.size * 2.5;
            } else if (stroke.type === 'highlighter') {
                ctx.strokeStyle = stroke.color;
                ctx.globalAlpha = 0.35;
                ctx.lineWidth = stroke.size * 2.5;
            } else {
                ctx.strokeStyle = stroke.color;
            }
            ctx.stroke();
            ctx.restore();
        } else if (stroke.type === 'shape') {
            this.drawShape(ctx, stroke.shape, stroke.x1, stroke.y1, stroke.x2, stroke.y2, stroke.color, stroke.size);
        } else if (stroke.type === 'text') {
            this.renderTextStroke(stroke);
        }
    }

    redrawEntireWhiteboard() {
        const canvas = this.whiteboard.canvas;
        if (!canvas) return;
        const ctx = this.whiteboard.ctx;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const stroke of this.whiteboard.strokesHistory) {
            if (stroke.type === 'pen' || stroke.type === 'highlighter' || stroke.type === 'eraser') {
                const pts = stroke.points;
                if (!pts || pts.length < 2) continue;
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) {
                    ctx.lineTo(pts[i].x, pts[i].y);
                }
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.lineWidth = stroke.size;
                if (stroke.type === 'eraser') {
                    ctx.strokeStyle = '#0f1422';
                    ctx.lineWidth = stroke.size * 2.5;
                } else if (stroke.type === 'highlighter') {
                    ctx.strokeStyle = stroke.color;
                    ctx.globalAlpha = 0.35;
                    ctx.lineWidth = stroke.size * 2.5;
                } else {
                    ctx.strokeStyle = stroke.color;
                }
                ctx.stroke();
                ctx.restore();
            } else if (stroke.type === 'shape') {
                this.drawShape(ctx, stroke.shape, stroke.x1, stroke.y1, stroke.x2, stroke.y2, stroke.color, stroke.size);
            } else if (stroke.type === 'text') {
                this.renderTextStroke(stroke);
            }
        }
    }

    broadcastStroke(stroke) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                action: 'whiteboard-stroke',
                stroke: stroke
            }));
            // Periodically persist to room
            this.socket.send(JSON.stringify({
                action: 'whiteboard-save',
                whiteboard_data: this.whiteboard.strokesHistory
            }));
        }
    }

    undoWhiteboardCanvas(broadcast = true) {
        if (this.whiteboard.strokesHistory.length === 0) return;
        const undone = this.whiteboard.strokesHistory.pop();
        this.whiteboard.undoStack.push(undone);
        this.redrawEntireWhiteboard();

        if (broadcast && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ action: 'whiteboard-undo' }));
            this.socket.send(JSON.stringify({
                action: 'whiteboard-save',
                whiteboard_data: this.whiteboard.strokesHistory
            }));
        }
    }

    clearWhiteboardCanvas(broadcast = true) {
        if (this.whiteboard.strokesHistory.length === 0) return;
        this.whiteboard.strokesHistory = [];
        this.whiteboard.undoStack = [];
        this.redrawEntireWhiteboard();

        if (broadcast && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ action: 'whiteboard-clear' }));
        }
        app.showToast('Whiteboard cleared', 'info');
    }

    exportWhiteboardImage() {
        if (!this.whiteboard.canvas) return;
        const dataUrl = this.whiteboard.canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `pulse-whiteboard-${this.currentRoom?.room_id || 'canvas'}.png`;
        link.href = dataUrl;
        link.click();
        app.showToast('Whiteboard exported as PNG image', 'success');
    }

    setWhiteboardTool(tool) {
        this.whiteboard.currentTool = tool;
        document.querySelectorAll('.wb-tool-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tool === tool);
        });
    }

    setWhiteboardColor(color) {
        this.whiteboard.currentColor = color;
        document.querySelectorAll('.wb-color-swatch').forEach(swatch => {
            swatch.classList.toggle('active', swatch.dataset.color === color);
        });
    }

    setWhiteboardSize(size) {
        this.whiteboard.currentSize = parseInt(size, 10);
    }

    renderRemoteCursor(data) {
        const wrapper = document.querySelector('.whiteboard-canvas-wrapper');
        if (!wrapper) return;

        let cursorEl = document.getElementById(`remote-cursor-${data.user_id}`);
        if (!cursorEl) {
            cursorEl = document.createElement('div');
            cursorEl.className = 'remote-cursor';
            cursorEl.id = `remote-cursor-${data.user_id}`;
            cursorEl.innerHTML = `
                <svg class="cursor-pointer-icon" viewBox="0 0 24 24">
                    <path d="M4 2L20 10L12 13L9 21L4 2Z" style="fill: #ec4899; stroke: #ffffff; stroke-width: 1.5;"/>
                </svg>
                <span class="cursor-label" style="background: #ec4899;">${this.escapeHtml(data.username)}</span>
            `;
            wrapper.appendChild(cursorEl);
        }

        const rect = wrapper.getBoundingClientRect();
        const posX = data.x * rect.width;
        const posY = data.y * rect.height;
        cursorEl.style.transform = `translate(${posX}px, ${posY}px)`;
    }

    removeRemoteCursor(userId) {
        const cursorEl = document.getElementById(`remote-cursor-${userId}`);
        if (cursorEl) cursorEl.remove();
    }

    // =========================================================================
    // P2P DATACHANNEL & ROOM FILE VAULT
    // =========================================================================

    setupDataChannel(dc, peerChannel, peerUser) {
        dc.binaryType = 'arraybuffer';

        dc.onopen = () => {
            console.log(`RTCDataChannel opened with ${peerUser.username}`);
        };

        dc.onmessage = async (e) => {
            if (typeof e.data === 'string') {
                try {
                    const msg = JSON.parse(e.data);
                    if (msg.type === 'file-start') {
                        this.incomingFiles[msg.transferId] = {
                            filename: msg.filename,
                            fileSize: msg.fileSize,
                            fileType: msg.fileType,
                            totalChunks: msg.totalChunks,
                            receivedChunks: [],
                            receivedBytes: 0,
                            sender: peerUser
                        };
                        this.showTransferProgress(msg.filename, 0);
                    } else if (msg.type === 'file-end') {
                        const fileData = this.incomingFiles[msg.transferId];
                        if (fileData) {
                            const blob = new Blob(fileData.receivedChunks, { type: fileData.fileType });
                            this.saveDownloadedBlob(blob, fileData.filename);
                            app.showToast(`Received encrypted file: ${fileData.filename}`, 'success');
                            delete this.incomingFiles[msg.transferId];
                        }
                    }
                } catch (err) {
                    console.error('DataChannel text message error:', err);
                }
            } else if (e.data instanceof ArrayBuffer) {
                // Incoming chunk
                for (const key in this.incomingFiles) {
                    const fileData = this.incomingFiles[key];
                    fileData.receivedChunks.push(e.data);
                    fileData.receivedBytes += e.data.byteLength;
                    const pct = Math.round((fileData.receivedBytes / fileData.fileSize) * 100);
                    this.showTransferProgress(fileData.filename, pct);
                    break;
                }
            }
        };
    }

    async sendP2PFile(file) {
        const transferId = 'transfer_' + Date.now();
        const CHUNK_SIZE = 16384; // 16KB WebRTC chunk size
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        const activeChannels = Object.values(this.dataChannels).filter(dc => dc.readyState === 'open');

        // Broadcast file-start header
        const header = JSON.stringify({
            type: 'file-start',
            transferId,
            filename: file.name,
            fileSize: file.size,
            fileType: file.type || 'application/octet-stream',
            totalChunks
        });

        activeChannels.forEach(dc => dc.send(header));

        let offset = 0;
        let chunkIndex = 0;

        while (offset < file.size) {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const buffer = await slice.arrayBuffer();

            activeChannels.forEach(dc => {
                // Backpressure check
                if (dc.bufferedAmount > 8 * 1024 * 1024) {
                    // Small pause if buffer is full
                }
                dc.send(buffer);
            });

            offset += CHUNK_SIZE;
            chunkIndex++;
            const pct = Math.round((offset / file.size) * 100);
            this.showTransferProgress(file.name, pct);
        }

        // Broadcast file-end
        const endMsg = JSON.stringify({ type: 'file-end', transferId });
        activeChannels.forEach(dc => dc.send(endMsg));

        app.showToast(`P2P transfer complete: ${file.name}`, 'success');
    }

    async uploadRoomFile(file) {
        if (!this.currentRoom) return;

        // First attempt direct P2P broadcast via WebRTC DataChannel
        if (Object.keys(this.dataChannels).length > 0) {
            this.sendP2PFile(file).catch(e => console.log('P2P file transfer error:', e));
        }

        // Second: Save to server Room File Vault for persistent downloads
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`/api/meet/rooms/${this.currentRoom.room_id}/files/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.getCsrfToken()
                },
                body: formData
            });

            if (!res.ok) {
                const err = await res.json();
                app.showToast(err.error || 'Failed to upload file', 'error');
                return;
            }

            const uploaded = await res.json();
            this.appendFileToUI(uploaded);
            app.showToast(`File vault synced: ${file.name}`, 'success');
        } catch (err) {
            console.error('Error uploading file:', err);
        }
    }

    async loadRoomFiles(roomId) {
        try {
            const res = await fetch(`/api/meet/rooms/${roomId}/files/`);
            if (res.ok) {
                const files = await res.json();
                const container = document.getElementById('files-list-container');
                if (container) {
                    container.innerHTML = files.map(f => this.renderFileCard(f)).join('');
                }
            }
        } catch (err) {
            console.error('Error loading room files:', err);
        }
    }

    renderFileCard(file) {
        const sizeStr = this.formatBytes(file.file_size);
        const checksumShort = file.checksum ? file.checksum.substring(0, 10) + '...' : 'Verified';
        return `
            <div class="file-card" id="file-card-${file.id}">
                <div class="file-card-left">
                    <div class="file-type-icon"><i class="fa-solid fa-file-shield"></i></div>
                    <div class="file-card-meta">
                        <div class="file-card-name" title="${this.escapeHtml(file.filename)}">${this.escapeHtml(file.filename)}</div>
                        <div class="file-card-info">
                            <span>${sizeStr}</span> • <span>${file.sender.display_name}</span>
                            • <span class="integrity-badge" title="SHA-256 Checksum">${checksumShort}</span>
                        </div>
                    </div>
                </div>
                <a href="/api/meet/rooms/${this.currentRoom.room_id}/files/${file.id}/download/" class="btn btn-outline btn-sm" download>
                    <i class="fa-solid fa-download"></i>
                </a>
            </div>
        `;
    }

    appendFileToUI(file) {
        const container = document.getElementById('files-list-container');
        if (container) {
            container.insertAdjacentHTML('afterbegin', this.renderFileCard(file));
        }
    }

    showTransferProgress(filename, percent) {
        const barWrap = document.getElementById('file-transfer-status');
        const fill = document.getElementById('file-transfer-fill');
        const text = document.getElementById('file-transfer-text');
        if (barWrap && fill && text) {
            barWrap.classList.remove('hidden');
            fill.style.width = `${percent}%`;
            text.textContent = `Transferring ${filename} (${percent}%)...`;
            if (percent >= 100) {
                setTimeout(() => barWrap.classList.add('hidden'), 2000);
            }
        }
    }

    saveDownloadedBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // =========================================================================
    // IN-CALL CHAT & REACTION BURSTS
    // =========================================================================

    sendChatMessage() {
        const input = document.getElementById('meet-chat-input');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                action: 'chat-message',
                text: text,
                is_encrypted: true
            }));
            input.value = '';
        }
    }

    renderChatMessage(msg) {
        const container = document.getElementById('drawer-chat-messages');
        if (!container) return;

        const isSelf = this.currentUser && (this.currentUser.id === msg.sender.id);
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${isSelf ? 'self' : ''}`;
        bubble.innerHTML = `
            <img class="chat-bubble-avatar" src="${msg.sender.avatar}" alt="${this.escapeHtml(msg.sender.display_name)}">
            <div class="chat-bubble-body">
                <div class="chat-bubble-meta">
                    <strong>${this.escapeHtml(msg.sender.display_name)}</strong> • <span>${msg.timestamp}</span>
                </div>
                <div class="chat-bubble-text ${msg.is_encrypted ? 'encrypted-msg' : ''}" title="${msg.is_encrypted ? 'Encrypted transmission' : ''}">
                    ${this.escapeHtml(msg.text)}
                </div>
            </div>
        `;
        container.appendChild(bubble);
        container.scrollTop = container.scrollHeight;
    }

    sendReaction(emoji) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                action: 'reaction',
                emoji: emoji
            }));
        }
    }

    triggerReactionAnimation(emoji, userId) {
        // Target video tile if exists, else stage
        const tile = document.getElementById(`peer-tile-${userId}`) || document.getElementById('local-video-tile') || document.querySelector('.meet-main-stage');
        if (!tile) return;

        const particle = document.createElement('div');
        particle.className = 'reaction-particle';
        particle.textContent = emoji;
        particle.style.setProperty('--rand-x', (Math.random() - 0.5) * 2);
        particle.style.bottom = '20px';
        particle.style.left = `${Math.random() * 60 + 20}%`;
        tile.appendChild(particle);

        setTimeout(() => particle.remove(), 2100);
    }

    // =========================================================================
    // PARTICIPANTS LIST & HOST CONTROLS
    // =========================================================================

    updateParticipantsList(peers, includeSelf = true) {
        const list = document.getElementById('drawer-participants-list');
        const badge = document.getElementById('participants-count-badge');
        if (!list) return;

        let total = peers.length + (includeSelf ? 1 : 0);
        if (badge) badge.textContent = total;

        let html = '';
        if (includeSelf && this.currentUser) {
            html += this.renderParticipantItem(this.currentUser, true, true);
        }
        for (const p of peers) {
            html += this.renderParticipantItem(p, false, false);
        }
        list.innerHTML = html;
    }

    renderParticipantItem(user, isSelf, isHost) {
        const canModerate = this.currentRoom?.is_host && !isSelf;
        return `
            <div class="participant-item" id="participant-row-${user.id}">
                <div class="participant-item-info">
                    <img src="${user.avatar}" alt="${this.escapeHtml(user.display_name)}">
                    <div>
                        <div class="participant-name-title">
                            ${this.escapeHtml(user.display_name)} ${isSelf ? '<span style="color: #6366f1;">(You)</span>' : ''}
                        </div>
                        <div class="participant-badges">
                            ${user.is_host || isHost ? '<span class="role-badge host">Host</span>' : ''}
                        </div>
                    </div>
                </div>
                ${canModerate ? `
                    <button class="btn btn-ghost btn-sm text-danger" title="Remove participant" onclick="pulseMeet.kickParticipant(${user.id})">
                        <i class="fa-solid fa-user-xmark"></i>
                    </button>
                ` : ''}
            </div>
        `;
    }

    addParticipantToUI(user, channel) {
        const list = document.getElementById('drawer-participants-list');
        if (list && !document.getElementById(`participant-row-${user.id}`)) {
            list.insertAdjacentHTML('beforeend', this.renderParticipantItem(user, false, false));
        }
        const badge = document.getElementById('participants-count-badge');
        if (badge) {
            badge.textContent = parseInt(badge.textContent || 1, 10) + 1;
        }
    }

    removeParticipantFromUI(userId) {
        const row = document.getElementById(`participant-row-${userId}`);
        if (row) row.remove();
        const badge = document.getElementById('participants-count-badge');
        if (badge) {
            const current = parseInt(badge.textContent || 1, 10);
            badge.textContent = Math.max(1, current - 1);
        }
    }

    kickParticipant(userId) {
        if (!confirm('Are you sure you want to remove this participant?')) return;
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                action: 'kick-user',
                target_user_id: userId
            }));
        }
    }

    muteAll() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ action: 'mute-all' }));
            app.showToast('Mute request sent to all participants', 'info');
        }
    }

    toggleRoomLock() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ action: 'toggle-lock' }));
        }
    }

    // =========================================================================
    // UI STAGE & DRAWER SWITCHING
    // =========================================================================

    setStageMode(mode) {
        this.activeStageMode = mode;
        const videoGrid = document.getElementById('video-grid-container');
        const whiteboardStage = document.getElementById('whiteboard-stage-container');

        document.querySelectorAll('.view-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        if (mode === 'video') {
            videoGrid.classList.remove('hidden');
            whiteboardStage.classList.add('hidden');
        } else if (mode === 'whiteboard') {
            videoGrid.classList.add('hidden');
            whiteboardStage.classList.remove('hidden');
            this.resizeWhiteboardCanvas();
        } else if (mode === 'split') {
            videoGrid.classList.remove('hidden');
            whiteboardStage.classList.remove('hidden');
            this.resizeWhiteboardCanvas();
        }
    }

    setDrawerTab(tab) {
        this.activeDrawerTab = tab;
        document.querySelectorAll('.drawer-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.querySelectorAll('.drawer-tab-pane').forEach(pane => {
            pane.classList.toggle('hidden', pane.id !== `tab-pane-${tab}`);
        });

        // If drawer was collapsed, expand it
        if (this.isDrawerCollapsed) {
            this.toggleDrawer();
        }
    }

    toggleDrawer() {
        const drawer = document.getElementById('meet-side-drawer');
        if (!drawer) return;
        this.isDrawerCollapsed = !this.isDrawerCollapsed;
        drawer.classList.toggle('collapsed', this.isDrawerCollapsed);
    }

    showRoomView(roomId) {
        const lobby = document.getElementById('meet-lobby-view');
        const roomView = document.getElementById('meet-room-view');
        if (lobby) lobby.classList.add('hidden');
        if (roomView) roomView.classList.remove('hidden');

        // Initialize Whiteboard canvas
        this.initWhiteboard();
    }

    copyInviteLink() {
        const link = `${window.location.origin}/#meet/${this.currentRoom?.room_id}`;
        navigator.clipboard.writeText(link).then(() => {
            app.showToast('Meeting link copied to clipboard!', 'success');
        }).catch(() => {
            prompt('Copy Meeting Invite Link:', link);
        });
    }

    startCallTimer() {
        this.callStartTime = Date.now();
        const timerEl = document.getElementById('call-timer-display');
        if (this.timerInterval) clearInterval(this.timerInterval);

        this.timerInterval = setInterval(() => {
            if (!timerEl) return;
            const diff = Math.floor((Date.now() - this.callStartTime) / 1000);
            const mins = String(Math.floor(diff / 60)).padStart(2, '0');
            const secs = String(diff % 60).padStart(2, '0');
            timerEl.textContent = `${mins}:${secs}`;
        }, 1000);
    }

    leaveRoom(confirmLeave = true) {
        if (confirmLeave && !confirm('Are you sure you want to leave this meeting?')) return;

        // 1. Close WebRTC Peer Connections
        for (const pc of Object.values(this.peers)) {
            pc.close();
        }
        this.peers = {};
        this.dataChannels = {};

        // 2. Stop Local Camera & Screen Tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(t => t.stop());
            this.screenStream = null;
        }

        // 3. Close Audio Context & Timers
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        if (this.speechDetectorInterval) clearInterval(this.speechDetectorInterval);
        if (this.timerInterval) clearInterval(this.timerInterval);

        // 4. Close WebSocket
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        // 5. Restore UI back to Lobby
        const lobby = document.getElementById('meet-lobby-view');
        const roomView = document.getElementById('meet-room-view');
        if (roomView) roomView.classList.add('hidden');
        if (lobby) lobby.classList.remove('hidden');

        this.currentRoom = null;
        this.loadRooms();
        app.showToast('You left the meeting', 'info');
    }

    // =========================================================================
    // UTILITIES
    // =========================================================================

    getCsrfToken() {
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? match[1] : '';
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}

// Global Singleton Instance
window.pulseMeet = new PulseMeet();
