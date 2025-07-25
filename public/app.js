// This will use the demo backend if you open index.html locally via file://, otherwise your server will be used
let backendUrl = location.protocol === 'file:' ? "https://tiktok-chat-reader.zerody.one/" : undefined;
let connection = new TikTokIOConnection(backendUrl);

// Ensure window.connection is always initialized
if (!window.connection) {
    window.connection = new TikTokIOConnection(location.origin);
}

// Counter
let viewerCount = 0;
let likeCount = 0;
let diamondsCount = 0;

// These settings are defined by obs.html
if (!window.settings) window.settings = {};

let idComment = undefined;

let bannedUserSpam = []

let kickStatsInterval = null;
let currentKickChannel = null;
let kickChatReady = false;

function getKickChannelSlug(input) {
    // Accepts either a slug or a full URL
    const match = input.match(/kick\.com\/([A-Za-z0-9_]+)/i);
    if (match) return match[1];
    return input;
}

// Remove fetchKickStatsAuto, startKickStatsAutoRefresh, and #kickUser/#kickStatsButton handlers

$('#kickUser').on('input', function() {
    console.log('[KickStats] Input event triggered.');
    // startKickStatsAutoRefresh(); // This function is removed
});

$(document).ready(() => {
    $('#connectButton').click(connect);
    $('#uniqueIdInput').on('keyup', function (e) {
        if (e.key === 'Enter') {
            connect();
        }
    });

    // Only connect if settings.username is available
    if (window.settings.username) {
        connect();
    }

    // Test event to confirm Socket.IO connection
    window.connection.socket.emit('testEvent', 'hello from frontend');
    console.log('[Test] testEvent emitted from frontend');
})

const ENUM_TYPE_ACTION = {
    SHARE_FOLLOW: "SHARE_FOLLOW",
    LIKE: "LIKE",
    GIFT: "GIFT",
    COMMENT: "COMMENT",
}

function isValidTikTokUsername(username) {
    // TikTok usernames: 2-24 chars, letters, numbers, underscores, periods
    return /^[A-Za-z0-9._]{2,24}$/.test(username);
}

function connect() {
    let uniqueId = window.settings.username || $('#uniqueIdInput').val();
    if (uniqueId && isValidTikTokUsername(uniqueId)) {
        $('#stateText').text('Connecting...');
        connection.connect(uniqueId, {
            enableExtendedGiftInfo: true
        }).then(state => {
            console.log("Connected: " + state)
            $('#stateText').text(`Connected to roomId ${state && state.roomId ? state.roomId : ''}`);

            // reset stats
            viewerCount = 0;
            likeCount = 0;
            diamondsCount = 0;
            updateRoomStats();

            // clear chat and gift containers
            $('.chatcontainer').empty().append('<h3 class="containerheader">Chats</h3>');
            // Remove or comment out any line for .giftcontainer title
            // $('.giftcontainer').empty().append('<h3 class="containerheader">Gifts</h3>');
            // SelectModal(10) // Removed for chat reader only
        }).catch(errorMessage => {
            console.log(errorMessage, "errorMessage")
            $('#stateText').text(errorMessage);

            // schedule next try if obs username set
            if (window.settings.username) {
                setTimeout(() => {
                    connect(window.settings.username);
                }, 30000);
            }
        })
    } else {
        // Only show alert if the user actually clicked connect, not on page load
        if (document.activeElement === document.getElementById('connectButton') || document.activeElement === document.getElementById('uniqueIdInput')) {
            alert('Please enter a valid TikTok username (2-24 letters, numbers, underscores, or periods).');
        }
    }
}

// Prevent Cross site scripting (XSS)
function sanitize(text) {
    return text.replace(/</g, '&lt;')
}

function updateRoomStats() {
    $('#tiktokStats').html(
        `<span><b>TikTok Viewers:</b> ${viewerCount.toLocaleString()}</span> &nbsp; ` +
        `<span><b>TikTok Likes:</b> ${likeCount.toLocaleString()}</span> &nbsp; ` +
        `<span><b>Earned Diamonds:</b> ${diamondsCount.toLocaleString()}</span>`
    );
}

function generateUsernameLink(data) {
    return `<a class="usernamelink" href="https://www.tiktok.com/@${data.uniqueId}" target="_blank">${data.uniqueId}</a>`;
}

function isPendingStreak(data) {
    return data.giftType === 1 && !data.repeatEnd;
}

/**
 * Add a new message to the chat container
 */
function handleEventLive(typeEvent, data) {
    if ([ENUM_TYPE_ACTION.SHARE_FOLLOW, ENUM_TYPE_ACTION.GIFT, ENUM_TYPE_ACTION.LIKE].includes(typeEvent)) {
        if (idComment === data.msgId) return;
        idComment = data.msgId;

        if (typeEvent === ENUM_TYPE_ACTION.GIFT) {
            if (Number.isInteger(data.diamondCount) && data.diamondCount > 0) {
                // Show gift in the main chat UI with a [GIFT] tag and diamond emoji
                $('.chatcontainer').append(
                    `<div>
                        <img class="miniprofilepicture" src="${data.profilePictureUrl || ''}">
                        <b>${data.nickname || data.uniqueId}:</b>
                        <span>💎 [GIFT] sent ${data.diamondCount} diamonds</span>
                    </div>`
                );
                $('.chatcontainer').scrollTop($('.chatcontainer')[0].scrollHeight);
                console.log(`[GIFT UI] Displayed: ${data.nickname || data.uniqueId} sent ${data.diamondCount} diamonds`);
            }
        } else if (typeEvent === ENUM_TYPE_ACTION.LIKE) {
            // Show like in the UI with a heart emoji
            $('.chatcontainer').append(
                `<div>
                    <img class="miniprofilepicture" src="${data.profilePictureUrl || ''}">
                    <b>${data.nickname || data.uniqueId}:</b>
                    <span>❤️ sent a like</span>
                </div>`
            );
            $('.chatcontainer').scrollTop($('.chatcontainer')[0].scrollHeight);
        } else {
            // Show share/follow in the UI with a star emoji
            $('.chatcontainer').append(
                `<div>
                    <img class="miniprofilepicture" src="${data.profilePictureUrl || ''}">
                    <b>${data.nickname || data.uniqueId}:</b>
                    <span>⭐ shared or followed</span>
                </div>`
            );
            $('.chatcontainer').scrollTop($('.chatcontainer')[0].scrollHeight);
        }
    }
}

/**
 * Add a new gift to the gift container
 */
// function addGiftItem(data) {
//     let container = location.href.includes('obs.html') ? $('.eventcontainer') : $('.giftcontainer');
//
//     if (container.find('div').length > 200) {
//         container.find('div').slice(0, 100).remove();
//     }
//
//     let streakId = data.userId.toString() + '_' + data.giftId;
//
//     let html = `
//         <div data-streakid=${isPendingStreak(data) ? streakId : ''}>
//             <img class="miniprofilepicture" src="${data.profilePictureUrl}">
//             <span>
//                 <b>${generateUsernameLink(data)}:</b> <span>${data.describe}</span><br>
//                 <div>
//                     <table>
//                         <tr>
//                             <td><img class="gifticon" src="${data.giftPictureUrl}"></td>
//                             <td>
//                                 <span>Name: <b>${data.giftName}</b> (ID:${data.giftId})<span><br>
//                                 <span>Repeat: <b style="${isPendingStreak(data) ? 'color:red' : ''}">x${data.repeatCount.toLocaleString()}</b><span><br>
//                                 <span>Cost: <b>${(data.diamondCount * data.repeatCount).toLocaleString()} Diamonds</b><span>
//                             </td>
//                         </tr>
//                     </tabl>
//                 </div>
//             </span>
//         </div>
//     `;
//
//     let existingStreakItem = container.find(`[data-streakid='${streakId}']`);
//
//     if (existingStreakItem.length) {
//         existingStreakItem.replaceWith(html);
//     } else {
//         container.append(html);
//     }
//
//     container.stop();
//     container.animate({
//         scrollTop: container[0].scrollHeight
//     }, 800);
// }


// Update viewer stats
connection.on('roomUser', (msg) => {
    if (typeof msg.viewerCount === 'number') {
        viewerCount = msg.viewerCount;
        updateRoomStats();
    }
});

// Update like stats and handle like events
connection.on('like', (data) => {
    if (typeof data.totalLikeCount === 'number') {
        likeCount = data.totalLikeCount;
        updateRoomStats();
    }
    handleEventLive(ENUM_TYPE_ACTION.LIKE, data);
});

// Update diamonds from gifts and handle gift events
connection.on('gift', (data) => {
    if (typeof data.diamondCount === 'number') {
        diamondsCount += data.diamondCount;
        updateRoomStats();
        console.log(`[DIAMONDS] Total diamonds: ${diamondsCount}`);
    }
    console.log(`[GIFT EVENT] ${data.nickname || data.uniqueId} sent ${data.diamondCount} diamonds`);
    handleEventLive(ENUM_TYPE_ACTION.GIFT, data);
});

// Handle share/follow events
connection.on('social', (data) => {
    handleEventLive(ENUM_TYPE_ACTION.SHARE_FOLLOW, data);
});

// Show chat messages in the UI
connection.on('chat', (msg) => {
    $('.chatcontainer').append(
        `<div>
            <img class="miniprofilepicture" src="${msg.profilePictureUrl || ''}">
            <b>${msg.nickname || msg.uniqueId}:</b>
            <span>${sanitize(msg.comment)}</span>
        </div>`
    );
    $('.chatcontainer').scrollTop($('.chatcontainer')[0].scrollHeight);
});

// connection.on('streamEnd', () => {
//     $('#stateText').text('Stream ended.');
//
//     // schedule next try if obs username set
//     if (window.settings.username) {
//         setTimeout(() => {
//             connect(window.settings.username);
//         }, 30000);
//     }
// })

// KICK CHAT FRONTEND LOGIC
$(document).ready(function() {
    $('#kickConnectButton').on('click', function() {
        let kickInput = $('#kickLinkInput').val().trim();
        // If user pasted a full link, extract the username
        const match = kickInput.match(/kick\.com\/([A-Za-z0-9_]+)/i);
        if (match) {
            kickInput = match[1];
        }
        // Validate username
        if (!/^[A-Za-z0-9_]{2,24}$/.test(kickInput)) {
            alert('Please enter a valid Kick channel name (2-24 letters, numbers, or underscores).');
            return;
        }
        // Track the current channel for filtering
        currentKickChannel = kickInput;
        kickChatReady = false;
        window.connection.socket.emit('setKickLink', kickInput);
        $('#stateText').text('Connecting to Kick...');

        // --- Auto-fetch Kick stats on connect and start auto-refresh ---
        if (kickStatsInterval) clearInterval(kickStatsInterval);
        function fetchKickStatsForConnected() {
            const user = currentKickChannel;
            if (!user) return;
            const url = `https://kick.com/api/v1/channels/${user}`;
            fetch(url)
                .then(res => res.text())
                .then(text => {
                    let data;
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        $('#kickStats').html('Could not parse followers JSON.');
                        return;
                    }
                    const followers = data.followersCount ?? 'N/A';
                    const viewers = data.livestream?.viewer_count ?? 'Not live';
                    $('#kickStats').html(
                        `<b style=\"color:#1db954\">Kick Followers:</b> <span style=\"color:#fff\">${followers}</span> &nbsp; <b style=\"color:#1db954\">Kick Viewers:</b> <span class=\"kick-viewers-green\" style=\"color:#fff\">${viewers}</span>`
                    );
                })
                .catch(() => {
                    $('#kickStats').html('Could not fetch Kick stats.');
                });
        }
        fetchKickStatsForConnected();
        kickStatsInterval = setInterval(fetchKickStatsForConnected, 10000);
        // --- End auto-fetch and auto-refresh ---
    });

    window.connection.socket.on('kickConnected', function(data) {
        // Clear chat container for new streamer when connection is ready
        $('.chatcontainer').empty().append('<h3 class="containerheader">Chats</h3>');
        $('#stateText').text('Connected to Kick chat!');
        kickChatReady = true;
    });

    window.connection.socket.on('kickChat', function(msg) {
        // Only show messages for the currently connected channel and when ready
        if (!kickChatReady) return;
        if (!msg.channelSlug || msg.channelSlug !== currentKickChannel) {
            console.log('[KickChat] Ignored message for channel:', msg.channelSlug, 'Current:', currentKickChannel);
            return;
        }
        function sanitize(str) {
            return String(str).replace(/[&<>"']/g, function (c) {
                return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
            });
        }
        const profilePic = msg.sender?.profile_picture || msg.sender?.profilePic || msg.sender?.profile_picture_url || 'https://kick.com/img/kick-logo.svg';
        const chatContainer = $('.chatcontainer');
        const shouldScroll = isChatScrolledToBottom();
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
        const usernameColor = msg.sender?.color || getRandomColor(msg.sender?.username || '');
        console.log('Kick username color:', usernameColor, msg.sender);
        function renderKickMessage(content, emotes) {
            if (!emotes || !emotes.length) return sanitize(content);
            let rendered = sanitize(content);
            emotes.forEach(emote => {
                // emote.name is the code, emote.url is the image
                const emoteTag = `<img src="${emote.url}" alt="${emote.name}" class="kick-emote" style="height:1.5em;vertical-align:middle;">`;
                // Replace all occurrences of the emote code (sanitized)
                rendered = rendered.split(sanitize(emote.name)).join(emoteTag);
            });
            return rendered;
        }
        const messageHtml = renderKickMessage(msg.content, msg.emotes);
        chatContainer.append(
            `<div class="kick-message">
                <img class="miniprofilepicture" src="${profilePic}" onerror="this.onerror=null;this.src='https://kick.com/img/kick-logo.svg';">
                <b style="color:${usernameColor} !important">${sanitize(msg.sender?.username || '')}:</b>
                <span>${messageHtml}</span>
            </div>`
        );
        // Limit to 200 messages
        const allMessages = chatContainer.children('div.kick-message, div.tiktok-message');
        if (allMessages.length > 200) {
            allMessages.first().remove();
        }
        if (shouldScroll) {
            chatContainer.scrollTop(chatContainer[0].scrollHeight);
        }
        $('#stateText').text('Kick chat: message received');
    });

    window.connection.socket.on('kickDisconnected', function(reason) {
        console.log('[Kick] Disconnected:', reason);
        $('#stateText').text('Kick chat disconnected: ' + reason);
    });

    // Browser-based Kick stats fetching
    // REMOVE the duplicate Kick stats button handler below (inside document.ready):
    // $('#kickStatsButton').on('click', function() { ... });

    // $('#kickStatsButton').on('click', function() { // This line is removed
    //     console.log('[KickStats] Button click event triggered.'); // This line is removed
    //     const inputVal = $('#kickUser').val(); // This line is removed
    //     console.log('[KickStats] Button click input value:', inputVal); // This line is removed
    //     startKickStatsAutoRefresh(); // This function is removed
    //     console.log('[KickStats] startKickStatsAutoRefresh called from button click.'); // This line is removed
    // }); // This line is removed
});

// TIKTOK CHAT DEBUGGING
if (window.connection) {
    // Listen for TikTok chat events
    window.connection.on('chat', function(msg) {
        console.log('[TikTok] Message received:', msg);
        // Optionally, update to use .tiktok-message class for color
        const chatContainer = $('.chatcontainer');
        const shouldScroll = isChatScrolledToBottom();
        chatContainer.append(
            `<div class="tiktok-message">
                <img class="miniprofilepicture" src="${msg.profilePictureUrl || ''}">
                <b>${msg.nickname || msg.uniqueId}:</b>
                <span>${sanitize(msg.comment)}</span>
            </div>`
        );
        // Limit to 200 messages
        const allMessages = chatContainer.children('div.kick-message, div.tiktok-message');
        if (allMessages.length > 200) {
            allMessages.first().remove();
        }
        if (shouldScroll) {
            chatContainer.scrollTop(chatContainer[0].scrollHeight);
        }
        $('#stateText').text('TikTok chat: message received');
    });
    window.connection.on('tiktokConnected', function(state) {
        console.log('[TikTok] Connected:', state);
        $('#stateText').text('Connected to TikTok chat!');
    });
    window.connection.on('tiktokDisconnected', function(reason) {
        console.log('[TikTok] Disconnected:', reason);
        $('#stateText').text('TikTok chat disconnected: ' + reason);
    });
}

// Sanitize function for TikTok messages (if not already defined)
function sanitize(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
    });
}

// Helper: Only auto-scroll if user is at (or near) the bottom
function isChatScrolledToBottom() {
    const container = $('.chatcontainer')[0];
    return container.scrollHeight - container.scrollTop - container.clientHeight < 20;
}
