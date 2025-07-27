require('dotenv').config();

// Set environment variables to avoid Puppeteer issues in Vercel
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_ARGS = '--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-accelerated-2d-canvas --no-first-run --no-zygote --single-process --disable-gpu';

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { TikTokConnectionWrapper, getGlobalConnectionCount } = require('./connectionWrapper');
const { clientBlocked } = require('./limiter');
const axios = require('axios');
const { createClient } = require('@retconned/kick-js');
const KickChatFallback = require('./kick-chat-fallback');


// Global error handler for Puppeteer errors
process.on('unhandledRejection', (reason, promise) => {
    console.log(`[Global] Unhandled Rejection at:`, promise, 'reason:', reason);
    // Don't crash the app, just log the error
});

const app = express();
const httpServer = createServer(app);

// Enable cross origin resource sharing
const io = new Server(httpServer, {
    cors: {
        origin: '*'
    }
});



// Serve static files
app.use(express.static('public'));
app.use(express.json());






io.on('connection', (socket) => {
    let tiktokConnectionWrapper = null;
    let kickChatClient = null;
    let kickSessionId = 0;

    console.info('New connection from origin', socket.handshake.headers['origin'] || socket.handshake.headers['referer']);

    socket.on('testEvent', (data) => {
        console.log('[Test] testEvent received:', data);
        socket.emit('testEvent', { message: 'Backend received your test event!', timestamp: new Date().toISOString() });
    });

    // TIKTOK CHAT HANDLING
    socket.on('setUniqueId', (uniqueId, options) => {
        console.log(`[TikTok] Attempting to connect to: ${uniqueId}`);

        // Prohibit the client from specifying these options (for security reasons)
        if (typeof options === 'object' && options) {
            delete options.requestOptions;
            delete options.websocketOptions;
        } else {
            options = {};
        }

        // Session ID in .env file is optional
        if (process.env.SESSIONID) {
            options.sessionId = process.env.SESSIONID;
            console.info('Using SessionId');
        }

        // Check if rate limit exceeded
        if (process.env.ENABLE_RATE_LIMIT && clientBlocked(io, socket)) {
            socket.emit('tiktokDisconnected', 'You have opened too many connections or made too many connection requests. Please reduce the number of connections/requests or host your own server instance. The connections are limited to avoid that the server IP gets blocked by TokTok.');
            return;
        }

        // Connect to the given username (uniqueId)
        try {
            // Disconnect any existing connection first
            if (tiktokConnectionWrapper) {
                tiktokConnectionWrapper.disconnect();
            }
            tiktokConnectionWrapper = new TikTokConnectionWrapper(uniqueId, options, true);
            
            // Add error handler to prevent crashes
            tiktokConnectionWrapper.on('error', (error) => {
                // Don't log detailed errors for offline users
                if (error.info && error.info.includes('user_not_found') || 
                    error.exception && error.exception.message && error.exception.message.includes('user_not_found')) {
                    console.log(`[TikTok] User ${uniqueId} is not live or not found`);
                } else {
                    console.error(`[TikTok] Error for ${uniqueId}:`, error);
                }
                socket.emit('tiktokDisconnected', `User is not currently live. Please try a different username.`);
            });
            
            tiktokConnectionWrapper.connect();
        } catch (err) {
            // Clean up error messages for offline users
            let cleanError = err.toString();
            if (cleanError.includes('user_not_found') || cleanError.includes('Failed to retrieve room_id')) {
                console.log(`[TikTok] User ${uniqueId} is not live or not found`);
                cleanError = 'User is not currently live. Please try a different username.';
            } else {
                console.error(`[TikTok] Connection error for ${uniqueId}:`, err);
            }
            socket.emit('tiktokDisconnected', cleanError);
            return;
        }

        // Redirect wrapper control events once
        tiktokConnectionWrapper.once('connected', state => socket.emit('tiktokConnected', state));
        tiktokConnectionWrapper.once('disconnected', reason => socket.emit('tiktokDisconnected', reason));

        // Notify client when stream ends
        tiktokConnectionWrapper.connection.on('streamEnd', () => socket.emit('streamEnd'));

        // Redirect message events
        tiktokConnectionWrapper.connection.on('roomUser', msg => socket.emit('roomUser', msg));
        tiktokConnectionWrapper.connection.on('member', msg => socket.emit('member', msg));
        tiktokConnectionWrapper.connection.on('chat', msg => socket.emit('chat', msg));
        tiktokConnectionWrapper.connection.on('gift', msg => socket.emit('gift', msg));
        tiktokConnectionWrapper.connection.on('social', msg => socket.emit('social', msg));
        tiktokConnectionWrapper.connection.on('like', msg => socket.emit('like', msg));
        tiktokConnectionWrapper.connection.on('questionNew', msg => socket.emit('questionNew', msg));
        tiktokConnectionWrapper.connection.on('linkMicBattle', msg => socket.emit('linkMicBattle', msg));
        tiktokConnectionWrapper.connection.on('linkMicArmies', msg => socket.emit('linkMicArmies', msg));
        tiktokConnectionWrapper.connection.on('liveIntro', msg => socket.emit('liveIntro', msg));
        tiktokConnectionWrapper.connection.on('emote', msg => socket.emit('emote', msg));
        tiktokConnectionWrapper.connection.on('envelope', msg => socket.emit('envelope', msg));
        tiktokConnectionWrapper.connection.on('subscribe', msg => socket.emit('subscribe', msg));
    });

    // KICK CHAT HANDLING - Direct WebSocket approach (no Puppeteer)
    const KICK_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    socket.on('setKickLink', async (kickLink) => {
        try {
            // Disconnect previous Kick client
            if (kickChatClient) {
                try {
                    kickChatClient.disconnect();
                } catch (e) {}
                kickChatClient = null;
            }
        
            // Increment session ID
            kickSessionId += 1;
            const thisSessionId = kickSessionId;
            socket.currentKickSessionId = thisSessionId;
            
            // Extract the channel slug from the link or use as-is if already a slug
            let channelSlug = kickLink;
            const match = kickLink.match(/kick\.com\/([A-Za-z0-9_]+)/i);
            if (match) {
                channelSlug = match[1];
            }
            if (!channelSlug) {
                socket.emit('kickDisconnected', 'Invalid Kick link');
                return;
            }
            channelSlug = channelSlug.toLowerCase();

            console.log(`[Kick] Attempting to connect to ${channelSlug} (original input: ${kickLink})`);



            // Fall back to public API
            try {
                const channelUrl = `https://kick.com/api/v1/channels/${channelSlug}`;
                const response = await axios.get(channelUrl, { 
                    headers: {
                        ...KICK_HEADERS,
                        'Accept': 'application/json'
                    },
                    timeout: 10000 // Increased timeout
                });
                const channelData = response.data;
                
                const followers = channelData.followersCount ?? null;
                const viewers = channelData.livestream?.viewer_count ?? null;
                
                // Emit connection event
                socket.emit('kickConnected', { channelSlug });
                
                console.log(`[Kick] Successfully connected to ${channelSlug} using public API`);
                
                // Start Kick chat client
                startKickChatClient(channelSlug, thisSessionId);
                
            } catch (error) {
                console.log(`[Kick] Public API failed for ${channelSlug}:`, error.message);
                
                // Be more lenient - still allow connection even if API fails
                // This could happen if the channel exists but API is having issues
                console.log(`[Kick] Proceeding with connection despite API failure`);
                socket.emit('kickConnected', { channelSlug });
                
                // Start Kick chat client anyway
                startKickChatClient(channelSlug, thisSessionId);
            }
            
        } catch (error) {
            console.error(`[Kick] Error setting up Kick connection:`, error);
            socket.emit('kickDisconnected', `Error setting up connection: ${error.message}`);
        }
    });

    // Kick chat client setup
    async function startKickChatClient(channelSlug, sessionId) {
        try {
            console.log(`[Kick] Starting chat client for ${channelSlug} in read-only mode`);
            
            // Try official library with latest Puppeteer configuration
            try {
                console.log(`[Kick] Attempting to use official library for ${channelSlug}`);
                
                // Use the latest Puppeteer configuration from the documentation
                kickChatClient = createClient(channelSlug, {
                    logger: false,
                    readOnly: true,
                    puppeteerOptions: {
                        headless: true,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-accelerated-2d-canvas',
                            '--no-first-run',
                            '--no-zygote',
                            '--single-process',
                            '--disable-gpu',
                            '--disable-background-timer-throttling',
                            '--disable-backgrounding-occluded-windows',
                            '--disable-renderer-backgrounding'
                        ]
                    }
                });
                
                console.log(`[Kick] Successfully created official client for ${channelSlug}`);
                
            } catch (officialError) {
                console.log(`[Kick] Official library failed for ${channelSlug}:`, officialError.message);
                console.log(`[Kick] Falling back to custom client for ${channelSlug}`);
                
                // Fall back to custom client
                kickChatClient = new KickChatFallback(channelSlug);
                kickChatClient.isFallback = true;
                await kickChatClient.connect();
            }
            
            // Set up event handlers
            kickChatClient.on('ChatMessage', (msg) => {
                if (socket.currentKickSessionId !== sessionId) {
                    return;
                }
                
                console.log(`[Kick] Chat message received:`, msg);
                
                // Enhanced badge processing
                let badges = [];
                if (msg.badges && Array.isArray(msg.badges)) {
                    badges = msg.badges;
                } else if (msg.sender && msg.sender.badges && Array.isArray(msg.sender.badges)) {
                    badges = msg.sender.badges;
                }
                
                // Add role-based badges
                if (msg.sender) {
                    if (msg.sender.isModerator) {
                        badges.push({
                            name: 'moderator',
                            title: 'Moderator',
                            icon_url: 'https://kick.com/img/badges/moderator.svg',
                            type: 'moderator'
                        });
                    }
                    if (msg.sender.isSubscriber) {
                        badges.push({
                            name: 'subscriber',
                            title: 'Subscriber',
                            icon_url: 'https://kick.com/img/badges/subscriber.svg',
                            type: 'subscriber'
                        });
                    }
                    if (msg.sender.isVerified) {
                        badges.push({
                            name: 'verified',
                            title: 'Verified',
                            icon_url: 'https://kick.com/img/badges/verified.svg',
                            type: 'verified'
                        });
                    }
                }
                
                socket.emit('kickChat', {
                    sender: {
                        ...msg.sender,
                        badges: badges
                    },
                    content: msg.content,
                    emotes: msg.emotes || [],
                    badges: badges,
                    channelSlug: channelSlug,
                    sessionId: sessionId,
                    timestamp: msg.timestamp || Date.now(),
                    messageId: msg.id
                });
            });
            
            kickChatClient.on('Gift', (gift) => {
                if (socket.currentKickSessionId !== sessionId) {
                    return;
                }
                
                console.log(`[Kick] Gift received:`, gift);
                socket.emit('kickGift', {
                    sender: gift.sender,
                    gift: gift.gift,
                    channelSlug: channelSlug,
                    sessionId: sessionId
                });
            });
            
            kickChatClient.on('Subscription', (sub) => {
                if (socket.currentKickSessionId !== sessionId) {
                    return;
                }
                
                console.log(`[Kick] Subscription received:`, sub);
                socket.emit('kickSubscription', {
                    sender: sub.sender,
                    subscription: sub.subscription,
                    channelSlug: channelSlug,
                    sessionId: sessionId
                });
            });
            
            kickChatClient.on('Follow', (follow) => {
                if (socket.currentKickSessionId !== sessionId) {
                    return;
                }
                
                console.log(`[Kick] Follow received:`, follow);
                socket.emit('kickFollow', {
                    sender: follow.sender,
                    channelSlug: channelSlug,
                    sessionId: sessionId
                });
            });
            
            kickChatClient.on('StreamStart', (streamData) => {
                console.log(`[Kick] Stream started:`, streamData);
                socket.emit('kickStreamStart', {
                    channelSlug: channelSlug,
                    sessionId: sessionId
                });
            });
            
            kickChatClient.on('StreamEnd', (streamData) => {
                console.log(`[Kick] Stream ended:`, streamData);
                socket.emit('kickStreamEnd', {
                    channelSlug: channelSlug,
                    sessionId: sessionId
                });
            });
            
            // Connect the client
            console.log(`[Kick] Chat client started successfully for ${channelSlug}`);
            
        } catch (error) {
            console.error(`[Kick] Failed to start chat client:`, error.message);
            // Don't emit disconnect, just log the error and continue
            console.log(`[Kick] Continuing without chat client for ${channelSlug}`);
        }
    }

    socket.on('disconnect', () => {
        // Clean up TikTok connection
        if (tiktokConnectionWrapper) {
            tiktokConnectionWrapper.disconnect();
        }
        
        // Clean up Kick chat client
        if (kickChatClient) {
            try {
                kickChatClient.disconnect();
            } catch (e) {}
            kickChatClient = null;
        }
    });
});

// Emit global connection statistics
setInterval(() => {
    io.emit('statistic', { globalConnectionCount: getGlobalConnectionCount() });
}, 5000)



// Test endpoint to verify Kick API connectivity
app.get('/api/kick-test/:channel', async (req, res) => {
  const channel = req.params.channel;
  try {
    console.log(`[Test] Testing Kick API for channel: ${channel}`);
    const url = `https://kick.com/api/v1/channels/${channel}`;
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': `https://kick.com/${channel}`,
      }
    });
    const channelInfo = response.data;
    res.json({ 
      success: true, 
      channel: channel,
      data: channelInfo,
      message: 'Kick API is working'
    });
  } catch (error) {
    console.error(`[Test] Kick API test failed for ${channel}:`, error.message);
    res.status(500).json({ 
      success: false, 
      channel: channel,
      error: error.message,
      message: 'Kick API test failed'
    });
  }
});



// Serve frontend files
app.use(express.static('public'));

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
    console.error('[Global] Uncaught Exception:', error);
    // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Global] Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

// Start http listener
const port = process.env.PORT || 8081;
httpServer.listen(port);
console.info(`Server running! Please visit http://localhost:${port}`);

function getRandomColor(username) {
    // Simple hash-based color for consistency per user
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Generate pastel color
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 70%)`;
} 