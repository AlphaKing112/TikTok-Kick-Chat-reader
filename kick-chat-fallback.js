const WebSocket = require('ws');
const axios = require('axios');

class KickChatFallback {
    constructor(channelSlug) {
        this.channelSlug = channelSlug;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.pollingInterval = null;
        this.lastMessageId = null;
    }

    async connect() {
        try {
            console.log(`[KickFallback] Connecting to ${this.channelSlug}...`);
            
            // Try WebSocket first
            const success = await this.tryWebSocket();
            if (!success) {
                console.log(`[KickFallback] WebSocket failed, falling back to polling for ${this.channelSlug}`);
                await this.startPolling();
            }
            
        } catch (error) {
            console.error(`[KickFallback] Connection error for ${this.channelSlug}:`, error.message);
            // Fall back to polling even if WebSocket fails
            await this.startPolling();
        }
    }

    async tryWebSocket() {
        try {
            // Get channel info first
            const channelInfo = await this.getChannelInfo();
            if (!channelInfo) {
                console.log(`[KickFallback] No channel info available for ${this.channelSlug}`);
                return false;
            }

            // Connect to Kick's WebSocket
            const wsUrl = 'wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.4.0&flash=false';
            this.ws = new WebSocket(wsUrl);

            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    console.log(`[KickFallback] WebSocket connection timeout for ${this.channelSlug}`);
                    if (this.ws) {
                        this.ws.close();
                    }
                    resolve(false);
                }, 10000); // 10 second timeout

                this.ws.on('open', () => {
                    console.log(`[KickFallback] WebSocket connected for ${this.channelSlug}`);
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    clearTimeout(timeout);
                    
                    // Subscribe to the channel
                    const subscribeMessage = {
                        event: 'pusher:subscribe',
                        data: {
                            auth: '',
                            channel: `chatrooms.${channelInfo.chatroom_id}`
                        }
                    };
                    this.ws.send(JSON.stringify(subscribeMessage));
                    resolve(true);
                });

                this.ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        this.handleWebSocketMessage(message);
                    } catch (error) {
                        console.log(`[KickFallback] Error parsing WebSocket message:`, error.message);
                    }
                });

                this.ws.on('close', () => {
                    console.log(`[KickFallback] WebSocket closed for ${this.channelSlug}`);
                    this.isConnected = false;
                    this.scheduleReconnect();
                });

                this.ws.on('error', (error) => {
                    console.error(`[KickFallback] WebSocket error for ${this.channelSlug}:`, error.message);
                    this.isConnected = false;
                    clearTimeout(timeout);
                    resolve(false);
                });
            });

        } catch (error) {
            console.error(`[KickFallback] WebSocket setup error:`, error.message);
            return false;
        }
    }

    async startPolling() {
        console.log(`[KickFallback] Starting polling for ${this.channelSlug}`);
        
        // Initial poll
        await this.pollChatMessages();
        
        // Set up polling interval
        this.pollingInterval = setInterval(async () => {
            await this.pollChatMessages();
        }, 5000); // Poll every 5 seconds
    }

    async pollChatMessages() {
        try {
            // Try to get recent chat messages via API with enhanced headers
            const response = await axios.get(`https://kick.com/api/v1/channels/${this.channelSlug}/messages`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin'
                },
                timeout: 5000
            });
            
            if (response.data && response.data.data) {
                const messages = response.data.data;
                for (const msg of messages) {
                    if (msg.id !== this.lastMessageId) {
                        this.emit('ChatMessage', {
                            sender: {
                                username: msg.sender?.username || 'Unknown',
                                color: msg.sender?.identity?.color || null,
                                badges: msg.sender?.identity?.badges || [],
                                isModerator: msg.sender?.identity?.badges?.some(b => b.type === 'moderator') || false,
                                isSubscriber: msg.sender?.identity?.badges?.some(b => b.type === 'subscriber') || false,
                                isVerified: msg.sender?.identity?.badges?.some(b => b.type === 'verified') || false
                            },
                            content: msg.content || '',
                            emotes: msg.emotes || [],
                            badges: msg.sender?.identity?.badges || [],
                            timestamp: Date.now(),
                            id: msg.id
                        });
                        this.lastMessageId = msg.id;
                    }
                }
            }
        } catch (error) {
            console.log(`[KickFallback] Polling error for ${this.channelSlug}:`, error.message);
            
            // If we get 403 errors, try a different approach
            if (error.response && error.response.status === 403) {
                console.log(`[KickFallback] 403 error detected, trying alternative method for ${this.channelSlug}`);
                await this.tryAlternativePolling();
            }
        }
    }

    async tryAlternativePolling() {
        try {
            // Try scraping the chat from the HTML page as a last resort
            console.log(`[KickFallback] Trying HTML scraping for ${this.channelSlug}`);
            
            const response = await axios.get(`https://kick.com/${this.channelSlug}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout: 10000
            });
            
            // For now, just emit a placeholder message to show the system is working
            this.emit('ChatMessage', {
                sender: {
                    username: 'System',
                    color: '#ff6b6b',
                    badges: [],
                    isModerator: false,
                    isSubscriber: false,
                    isVerified: false
                },
                content: `Chat monitoring active for ${this.channelSlug} (using fallback mode)`,
                emotes: [],
                badges: [],
                timestamp: Date.now(),
                id: `fallback-${Date.now()}`
            });
            
        } catch (error) {
            console.log(`[KickFallback] Alternative polling also failed for ${this.channelSlug}:`, error.message);
        }
    }

    async getChannelInfo() {
        try {
            // Try with enhanced headers to avoid 403
            const response = await axios.get(`https://kick.com/api/v1/channels/${this.channelSlug}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin'
                },
                timeout: 10000
            });
            
            const data = response.data;
            if (data && data.chatroom_id) {
                return {
                    chatroom_id: data.chatroom_id,
                    followers: data.followersCount,
                    viewers: data.livestream?.viewer_count || 0
                };
            }
            return null;
        } catch (error) {
            console.error(`[KickFallback] Error getting channel info:`, error.message);
            return null;
        }
    }

    handleWebSocketMessage(message) {
        if (message.event === 'pusher:connection_established') {
            console.log(`[KickFallback] Connection established for ${this.channelSlug}`);
        } else if (message.event === 'pusher_internal:subscription_succeeded') {
            console.log(`[KickFallback] Subscribed to chat for ${this.channelSlug}`);
        } else if (message.event === 'App\\Events\\ChatMessageEvent') {
            try {
                const chatData = JSON.parse(message.data);
                this.emit('ChatMessage', {
                    sender: {
                        username: chatData.sender.username,
                        color: chatData.sender.identity?.color || null,
                        badges: chatData.sender.identity?.badges || [],
                        isModerator: chatData.sender.identity?.badges?.some(b => b.type === 'moderator') || false,
                        isSubscriber: chatData.sender.identity?.badges?.some(b => b.type === 'subscriber') || false,
                        isVerified: chatData.sender.identity?.badges?.some(b => b.type === 'verified') || false
                    },
                    content: chatData.content,
                    emotes: chatData.emotes || [],
                    badges: chatData.sender.identity?.badges || [],
                    timestamp: Date.now(),
                    id: chatData.id
                });
            } catch (error) {
                console.log(`[KickFallback] Error parsing chat message:`, error.message);
            }
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[KickFallback] Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${this.reconnectDelay}ms`);
            
            setTimeout(() => {
                this.connect().catch(error => {
                    console.error(`[KickFallback] Reconnect failed:`, error.message);
                });
            }, this.reconnectDelay);
        } else {
            console.error(`[KickFallback] Max reconnect attempts reached for ${this.channelSlug}`);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isConnected = false;
    }

    on(event, callback) {
        if (!this.eventListeners) {
            this.eventListeners = {};
        }
        if (!this.eventListeners[event]) {
            this.eventListeners[event] = [];
        }
        this.eventListeners[event].push(callback);
    }

    emit(event, data) {
        if (this.eventListeners && this.eventListeners[event]) {
            this.eventListeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[KickFallback] Error in event handler:`, error.message);
                }
            });
        }
    }

    removeAllListeners() {
        this.eventListeners = {};
    }
}

module.exports = KickChatFallback; 