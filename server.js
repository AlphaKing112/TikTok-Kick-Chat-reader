require('dotenv').config();

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { TikTokConnectionWrapper, getGlobalConnectionCount } = require('./connectionWrapper');
const { clientBlocked } = require('./limiter');
const axios = require('axios');
const WebSocket = require('ws');
const { createClient: createKickClient } = require('@retconned/kick-js');

const app = express();
const httpServer = createServer(app);

// Enable cross origin resource sharing
const io = new Server(httpServer, {
    cors: {
        origin: '*'
    }
});


io.on('connection', (socket) => {
    let tiktokConnectionWrapper;
    let kickWs = null;
    let kickRoomId = null;
    let kickDisconnecting = false;
    let kickSessionId = 0;

    console.info('New connection from origin', socket.handshake.headers['origin'] || socket.handshake.headers['referer']);

    socket.on('setUniqueId', (uniqueId, options) => {

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
            tiktokConnectionWrapper = new TikTokConnectionWrapper(uniqueId, options, true);
            tiktokConnectionWrapper.connect();
        } catch (err) {
            socket.emit('tiktokDisconnected', err.toString());
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

    socket.on('testEvent', (data) => {
        console.log('[Test] testEvent received:', data);
    });

    // KICK CHAT HANDLING
    const KICK_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    socket.on('setKickLink', async (kickLink) => {
        console.log('[Kick] setKickLink called for:', kickLink);
        // Disconnect previous client
        if (socket.kickClient) {
            try {
                socket.kickClient.removeAllListeners();
                socket.kickClient.disconnect();
            } catch (e) {}
            socket.kickClient = null;
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
        console.log('[Kick] Using channelSlug:', channelSlug);

        // Fetch Kick channel stats
        let followers = null, viewers = null;
        let channelId = null;
        try {
            // Use v1 for followers (browser-like endpoint)
            const v1Url = `https://kick.com/api/v1/channels/${channelSlug}`;
            console.log('[Kick] Fetching followers from:', v1Url);
            const res = await axios.get(v1Url, { headers: KICK_HEADERS });
            console.log('[Kick] v1 Channel API response:', res.data); // Debug log
            followers = res.data.followersCount ?? null;
            channelId = res.data.id ?? res.data.channel_id ?? null;
        } catch (e) {
            console.log('[Kick] Could not fetch v1 channel stats:', e.message);
        }

        // Use v2 livestreams for viewers
        if (channelId) {
            try {
                const v2Url = `https://kick.com/api/v2/livestreams/${channelId}`;
                console.log('[Kick] Fetching viewers from:', v2Url);
                const liveRes = await axios.get(v2Url, { headers: KICK_HEADERS });
                console.log('[Kick] v2 Livestream API response:', liveRes.data);
                viewers = liveRes.data.viewer_count ?? null;
            } catch (e) {
                console.log('[Kick] Could not fetch v2 livestream stats:', e.message);
            }
        }

        // Emit stats to frontend
        socket.emit('kickStats', { followers, viewers });

        // Emit followers and viewers as separate events
        if (followers !== null) {
            socket.emit('kickFollowers', { followers });
            console.log('[Kick] Emitted kickFollowers:', followers);
        }
        if (viewers !== null) {
            socket.emit('kickViewers', { viewers });
            console.log('[Kick] Emitted kickViewers:', viewers);
        }

        console.log('[Kick] Connecting to Kick chat for channel:', channelSlug);
        // Create a Kick chat client
        const kickClient = createKickClient(channelSlug, { logger: true, readOnly: true });
        socket.kickClient = kickClient;
        // Listen for chat messages
        kickClient.on('ChatMessage', (msg) => {
            // Only emit if this is the current session
            if (socket.currentKickSessionId !== thisSessionId) return;
            console.log('[Kick] Full message:', msg); // Debug: print full message
            let color = msg.identity?.color || null;
            if (!color) {
                color = getRandomColor(msg.sender.username);
            }
            console.log('[Kick] Sending color for', msg.sender.username, ':', color);
            socket.emit('kickChat', {
                sender: {
                    username: msg.sender.username,
                    profile_picture: msg.sender.profilePic || msg.sender.profile_picture || msg.sender.profile_picture_url || null,
                    profilePic: msg.sender.profilePic || null,
                    profile_picture_url: msg.sender.profile_picture_url || null,
                    color: color
                },
                content: msg.content,
                emotes: msg.emotes || [], // Pass emotes array if present
                channelSlug: channelSlug,
                sessionId: thisSessionId
            });
        });
        // Handle connection events
        kickClient.on('ready', () => {
            console.log('[Kick] Connected to Kick chat for channel:', channelSlug);
            socket.emit('kickConnected', { channelSlug });
        });
        kickClient.on('disconnected', () => {
            console.log('[Kick] Disconnected from Kick chat for channel:', channelSlug);
            socket.emit('kickDisconnected', 'Kick chat disconnected');
        });
        // Clean up on socket disconnect
        socket.on('disconnect', () => {
            if (socket.kickClient) {
                try { socket.kickClient.disconnect(); } catch (e) {}
                socket.kickClient = null;
            }
        });
    });

    socket.on('disconnect', () => {
        if (tiktokConnectionWrapper) {
            tiktokConnectionWrapper.disconnect();
        }
        if (kickWs) {
            kickDisconnecting = true;
            kickWs.close();
            kickWs = null;
            kickRoomId = null;
            kickDisconnecting = false;
        }
    });
});

// Emit global connection statistics
setInterval(() => {
    io.emit('statistic', { globalConnectionCount: getGlobalConnectionCount() });
}, 5000)

// Backend caching for Kick stats
let kickStatsCache = {};
let lastFetchTime = {};

async function fetchKickStats(channel) {
  const url = `https://kick.com/api/v1/channels/${channel}`;
  const res = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Referer': `https://kick.com/${channel}`,
    }
  });
  return res.data;
}

app.get('/api/kick-stats/:channel', async (req, res) => {
  const channel = req.params.channel;
  const now = Date.now();
  // Only fetch if not cached or cache is older than 30s
  if (!kickStatsCache[channel] || now - lastFetchTime[channel] > 30000) {
    try {
      kickStatsCache[channel] = await fetchKickStats(channel);
      lastFetchTime[channel] = now;
    } catch (e) {
      console.error('Failed to fetch stats for', channel, e.message);
      return res.status(500).json({ error: 'Failed to fetch stats', details: e.message });
    }
  }
  res.json(kickStatsCache[channel]);
});

// Remove the custom route for index2.html
// Serve frontend files
app.use(express.static('public'));

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