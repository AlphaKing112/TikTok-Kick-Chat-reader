// Always use the local server for development
let backendUrl = location.origin;
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

let currentKickChannel = null;
let kickChatReady = false;

// Global Kick emotes cache
let kickBolbalEmotes = {};

// Function to fetch and cache bolbal emotes from Kick
async function fetchKickBolbalEmotes() {
    try {
        // Try multiple sources for bolbal emotes
        const sources = [
            'https://kick.com/api/v1/emotes/global',
            'https://kick.com/api/v1/emotes',
            'https://kick.com/api/emotes/global'
        ];
        
        let success = false;
        for (const source of sources) {
            try {
                const response = await fetch(source);
                if (response.ok) {
                    const data = await response.json();
                    // Handle different response formats
                    if (Array.isArray(data)) {
                        data.forEach(emote => {
                            if (emote.name && emote.url) {
                                kickBolbalEmotes[emote.name] = emote.url;
                            }
                        });
                    } else if (data.emotes && Array.isArray(data.emotes)) {
                        data.emotes.forEach(emote => {
                            if (emote.name && emote.url) {
                                kickBolbalEmotes[emote.name] = emote.url;
                            }
                        });
                    }
                    success = true;
                    break;
                }
            } catch (e) {
                // console.log('[Kick] Failed to fetch from', source, e.message);
            }
        }
        
        if (!success) {
            throw new Error('All API sources failed');
        }
    } catch (error) {
        // Kick's public API doesn't include emote endpoints yet, using fallback
        // console.log('[Kick] Could not fetch bolbal emotes, using fallback:', error.message);
        // Fallback: Add some common emotes if API is not available
        kickBolbalEmotes = {
            // Classic emotes
            'Kappa': 'https://files.kick.com/emotes/1/fullsize',
            'PogChamp': 'https://files.kick.com/emotes/2/fullsize',
            'LUL': 'https://files.kick.com/emotes/3/fullsize',
            'monkaS': 'https://files.kick.com/emotes/4/fullsize',
            'PepeHands': 'https://files.kick.com/emotes/5/fullsize',
            'FeelsBadMan': 'https://files.kick.com/emotes/6/fullsize',
            'FeelsGoodMan': 'https://files.kick.com/emotes/7/fullsize',
            'monkaW': 'https://files.kick.com/emotes/8/fullsize',
            'monkaEyes': 'https://files.kick.com/emotes/9/fullsize',
            'monkaGIGA': 'https://files.kick.com/emotes/10/fullsize',
            
            // KEK emotes (from Kick website)
            'KEKLEO': 'https://files.kick.com/emotes/37225/fullsize',
            'KEKW': 'https://files.kick.com/emotes/37226/fullsize',
            'KEKWait': 'https://files.kick.com/emotes/37227/fullsize',
            'KEKPoint': 'https://files.kick.com/emotes/37228/fullsize',
            'KEK': 'https://files.kick.com/emotes/37229/fullsize',
            
            // Additional popular emotes
            'PepeLaugh': 'https://files.kick.com/emotes/37230/fullsize',
            'PepeSmile': 'https://files.kick.com/emotes/37231/fullsize',
            'PepeCry': 'https://files.kick.com/emotes/37232/fullsize',
            'PepeAngry': 'https://files.kick.com/emotes/37233/fullsize',
            'PepeCool': 'https://files.kick.com/emotes/37234/fullsize',
            'PepeLove': 'https://files.kick.com/emotes/37235/fullsize',
            
            // More classic emotes
            'BibleThump': 'https://files.kick.com/emotes/37236/fullsize',
            'DansGame': 'https://files.kick.com/emotes/37237/fullsize',
            'EleGiggle': 'https://files.kick.com/emotes/37238/fullsize',
            'FailFish': 'https://files.kick.com/emotes/37239/fullsize',
            'FrankerZ': 'https://files.kick.com/emotes/37240/fullsize',
            'HeyGuys': 'https://files.kick.com/emotes/37241/fullsize',
            'Jebaited': 'https://files.kick.com/emotes/37242/fullsize',
            'Keepo': 'https://files.kick.com/emotes/37243/fullsize',
            'MingLee': 'https://files.kick.com/emotes/37244/fullsize',
            'NotLikeThis': 'https://files.kick.com/emotes/37245/fullsize',
            'PogU': 'https://files.kick.com/emotes/37233/fullsize',
            'kkHuh': 'https://files.kick.com/emotes/39261/fullsize',
            'ResidentSleeper': 'https://files.kick.com/emotes/37247/fullsize',
            'SeemsGood': 'https://files.kick.com/emotes/37248/fullsize',
            'SMOrc': 'https://files.kick.com/emotes/37249/fullsize',
            'SwiftRage': 'https://files.kick.com/emotes/37250/fullsize',
            'TriHard': 'https://files.kick.com/emotes/37251/fullsize',
            'WutFace': 'https://files.kick.com/emotes/37252/fullsize',
            '4Head': 'https://files.kick.com/emotes/37253/fullsize',
            'BabyRage': 'https://files.kick.com/emotes/37254/fullsize',
            'Bruh': 'https://files.kick.com/emotes/37255/fullsize',
            'CatFace': 'https://files.kick.com/emotes/37256/fullsize',
            'CoolCat': 'https://files.kick.com/emotes/37257/fullsize',
            'CorgiDerp': 'https://files.kick.com/emotes/37258/fullsize',
            'DatSheffy': 'https://files.kick.com/emotes/37259/fullsize',
            'DogFace': 'https://files.kick.com/emotes/37260/fullsize',
            'FUNgineer': 'https://files.kick.com/emotes/37261/fullsize',
            'GrammarKing': 'https://files.kick.com/emotes/37262/fullsize',
            'MrDestructoid': 'https://files.kick.com/emotes/37263/fullsize',
            'NinjaGrumpy': 'https://files.kick.com/emotes/37264/fullsize',
            'OpieOP': 'https://files.kick.com/emotes/37265/fullsize',
            'PanicVis': 'https://files.kick.com/emotes/37266/fullsize',
            'PJSalt': 'https://files.kick.com/emotes/37267/fullsize',
            'PJSugar': 'https://files.kick.com/emotes/37268/fullsize',
            'PunchTrees': 'https://files.kick.com/emotes/37269/fullsize',
            'RalpherZ': 'https://files.kick.com/emotes/37270/fullsize',
            'RedCoat': 'https://files.kick.com/emotes/37271/fullsize',
            'RitzMitz': 'https://files.kick.com/emotes/37272/fullsize',
            'ShadyLulu': 'https://files.kick.com/emotes/37273/fullsize',
            'ShazBotstix': 'https://files.kick.com/emotes/37274/fullsize',
            'SMSkull': 'https://files.kick.com/emotes/37275/fullsize',
            'SoBayed': 'https://files.kick.com/emotes/37276/fullsize',
            'SuperVinlin': 'https://files.kick.com/emotes/37277/fullsize',
            'TearGlove': 'https://files.kick.com/emotes/37278/fullsize',
            'TheRinger': 'https://files.kick.com/emotes/37279/fullsize',
            'TheThing': 'https://files.kick.com/emotes/37280/fullsize',
            'TombRaid': 'https://files.kick.com/emotes/37281/fullsize',
            'TwitchRPG': 'https://files.kick.com/emotes/37282/fullsize',
            'UnSane': 'https://files.kick.com/emotes/37283/fullsize',
            'UncleNox': 'https://files.kick.com/emotes/37284/fullsize',
            'WutFace': 'https://files.kick.com/emotes/37285/fullsize',
            
            // Additional popular emotes that might be missing
            'AYAYA': 'https://files.kick.com/emotes/37286/fullsize',
            'Bedge': 'https://files.kick.com/emotes/37287/fullsize',
            'BlobDance': 'https://files.kick.com/emotes/37288/fullsize',
            'BlobSweats': 'https://files.kick.com/emotes/37289/fullsize',
            'BlobWOW': 'https://files.kick.com/emotes/37290/fullsize',
            'CatJAM': 'https://files.kick.com/emotes/37291/fullsize',
            'ChefKiss': 'https://files.kick.com/emotes/37292/fullsize',
            'Clap': 'https://files.kick.com/emotes/37293/fullsize',
            'CoolStoryBob': 'https://files.kick.com/emotes/37294/fullsize',
            'PepeClap': 'https://files.kick.com/emotes/37295/fullsize',
            'PepeD': 'https://files.kick.com/emotes/37296/fullsize',
            'PepeG': 'https://files.kick.com/emotes/37297/fullsize',
            'PepeJAM': 'https://files.kick.com/emotes/37298/fullsize',
            'PepeModCheck': 'https://files.kick.com/emotes/37299/fullsize',
            'KEKL': 'https://files.kick.com/emotes/37300/fullsize',
            
            // Additional popular emotes you mentioned
            'HYPERCLAP': 'https://files.kick.com/emotes/37301/fullsize',
            'HemojiDead': 'https://files.kick.com/emotes/37302/fullsize',
            'EZ': 'https://files.kick.com/emotes/37303/fullsize',
            
            // More popular emotes that might be missing
            'PogBones': 'https://files.kick.com/emotes/37304/fullsize',
            'PogO': 'https://files.kick.com/emotes/37305/fullsize',
            'PogTasty': 'https://files.kick.com/emotes/37306/fullsize',
            'PogYou': 'https://files.kick.com/emotes/37307/fullsize',
            'PogOff': 'https://files.kick.com/emotes/37308/fullsize',
            'PogChamp2': 'https://files.kick.com/emotes/37309/fullsize',
            'PogChamp3': 'https://files.kick.com/emotes/37310/fullsize',
            'PogChamp4': 'https://files.kick.com/emotes/37311/fullsize',
            'PogChamp5': 'https://files.kick.com/emotes/37312/fullsize',
            'PogChamp6': 'https://files.kick.com/emotes/37313/fullsize',
            'PogChamp7': 'https://files.kick.com/emotes/37314/fullsize',
            'PogChamp8': 'https://files.kick.com/emotes/37315/fullsize',
            'PogChamp9': 'https://files.kick.com/emotes/37316/fullsize',
            'PogChamp10': 'https://files.kick.com/emotes/37317/fullsize',
            
            // More reaction emotes
            'OkayChamp': 'https://files.kick.com/emotes/37318/fullsize',
            'Okayge': 'https://files.kick.com/emotes/37319/fullsize',
            'OkaygeBusiness': 'https://files.kick.com/emotes/37320/fullsize',
            'OkaygeChamp': 'https://files.kick.com/emotes/37321/fullsize',
            'OkaygeChampBusiness': 'https://files.kick.com/emotes/37322/fullsize',
            'OkaygeChampBusinessChamp': 'https://files.kick.com/emotes/37323/fullsize',
            
            // More modern emotes
            'WideHard': 'https://files.kick.com/emotes/37324/fullsize',
            'WidePeepoHappy': 'https://files.kick.com/emotes/37325/fullsize',
            'WidePeepoSad': 'https://files.kick.com/emotes/37326/fullsize',
            'WidePeepoAngy': 'https://files.kick.com/emotes/37327/fullsize',
            'WidePeepoHands': 'https://files.kick.com/emotes/37328/fullsize',
            'WidePeepoRun': 'https://files.kick.com/emotes/37329/fullsize',
            'WidePeepoShy': 'https://files.kick.com/emotes/37330/fullsize',
            'WidePeepoSmile': 'https://files.kick.com/emotes/37331/fullsize',
            'WidePeepoThink': 'https://files.kick.com/emotes/37332/fullsize',
            'WidePeepoVibe': 'https://files.kick.com/emotes/37333/fullsize',
            
            // More KEK variants
            
            // More Pepe variants
            'Pepega': 'https://files.kick.com/emotes/37339/fullsize',
            'PepegaAim': 'https://files.kick.com/emotes/37340/fullsize',
            'PepegaAimAim': 'https://files.kick.com/emotes/37341/fullsize',
            'PepegaAimAimAim': 'https://files.kick.com/emotes/37342/fullsize',
            'PepegaAimAimAimAim': 'https://files.kick.com/emotes/37343/fullsize',
            'PepegaAimAimAimAimAim': 'https://files.kick.com/emotes/37344/fullsize',
            'PepegaAimAimAimAimAimAim': 'https://files.kick.com/emotes/37345/fullsize',
            'PepegaAimAimAimAimAimAimAim': 'https://files.kick.com/emotes/37346/fullsize',
            'PepegaAimAimAimAimAimAimAimAim': 'https://files.kick.com/emotes/37347/fullsize',
            'PepegaAimAimAimAimAimAimAimAimAim': 'https://files.kick.com/emotes/37348/fullsize',
            
            // More monka variants


            'monkaHmm': 'https://files.kick.com/emotes/37351/fullsize',
            'monkaLaugh': 'https://files.kick.com/emotes/37352/fullsize',
            'monkaOMEGA': 'https://files.kick.com/emotes/37353/fullsize',
            'monkaPickle': 'https://files.kick.com/emotes/37354/fullsize',

            'monkaTOS': 'https://files.kick.com/emotes/37356/fullsize',

            'monkaX': 'https://files.kick.com/emotes/37358/fullsize',
            
            // More reaction emotes
            'FeelsWeirdMan': 'https://files.kick.com/emotes/37359/fullsize',
            'FeelsStrongMan': 'https://files.kick.com/emotes/37360/fullsize',
            'FeelsBirthdayMan': 'https://files.kick.com/emotes/37361/fullsize',
            'FeelsAmazingMan': 'https://files.kick.com/emotes/37362/fullsize',
            'FeelsOkayMan': 'https://files.kick.com/emotes/37363/fullsize',
            'FeelsOldMan': 'https://files.kick.com/emotes/37364/fullsize',
            'FeelsSpecialMan': 'https://files.kick.com/emotes/37365/fullsize',
            'FeelsWarmMan': 'https://files.kick.com/emotes/37366/fullsize',
            'FeelsDankMan': 'https://files.kick.com/emotes/37367/fullsize',
            'FeelsDonkMan': 'https://files.kick.com/emotes/37368/fullsize'
        };
    }
}

// Function to render user badges
function renderKickBadges(badges) {
    console.log('[Badge Debug] renderKickBadges called with:', badges);
    if (!badges || !Array.isArray(badges) || badges.length === 0) {
        console.log('[Badge Debug] No badges to render');
        return '';
    }
    
    return badges.map(badge => {
        console.log('[Badge Debug] Processing badge:', badge);
        const iconUrl = badge.icon_url || badge.iconUrl || badge.url;
        const name = badge.name || badge.type || 'Badge';
        const title = badge.title || badge.name || badge.type || 'Badge';
        const type = badge.type || badge.name || 'badge';
        
        // Handle different badge types with fallback icons
        let finalIconUrl = iconUrl;
        if (!finalIconUrl) {
            switch (type.toLowerCase()) {
                case 'moderator':
                case 'mod':
                    finalIconUrl = 'https://kick.com/img/badges/moderator.svg';
                    break;
                case 'subscriber':
                case 'sub':
                    finalIconUrl = 'https://kick.com/img/badges/subscriber.svg';
                    break;
                case 'verified':
                    finalIconUrl = 'https://kick.com/img/badges/verified.svg';
                    break;
                case 'partner':
                case 'partnered':
                    finalIconUrl = 'https://kick.com/img/badges/partner.svg';
                    break;
                case 'vip':
                    finalIconUrl = 'https://kick.com/img/badges/vip.svg';
                    break;
                case 'founder':
                    finalIconUrl = 'https://kick.com/img/badges/founder.svg';
                    break;
                case 'broadcaster':
                case 'streamer':
                    finalIconUrl = 'https://kick.com/img/badges/broadcaster.svg';
                    break;
                case 'admin':
                case 'administrator':
                    finalIconUrl = 'https://kick.com/img/badges/admin.svg';
                    break;
                case 'staff':
                    finalIconUrl = 'https://kick.com/img/badges/staff.svg';
                    break;
                case 'premium':
                    finalIconUrl = 'https://kick.com/img/badges/premium.svg';
                    break;
                case 'supporter':
                    finalIconUrl = 'https://kick.com/img/badges/supporter.svg';
                    break;
                case 'donator':
                case 'donor':
                    finalIconUrl = 'https://kick.com/img/badges/donator.svg';
                    break;
                case 'early_supporter':
                case 'earlysupporter':
                    finalIconUrl = 'https://kick.com/img/badges/early_supporter.svg';
                    break;
                case 'beta_tester':
                case 'betatester':
                    finalIconUrl = 'https://kick.com/img/badges/beta_tester.svg';
                    break;
                case 'hype_train':
                case 'hypetrain':
                    finalIconUrl = 'https://kick.com/img/badges/hype_train.svg';
                    break;
                case 'cheer':
                case 'cheerer':
                    finalIconUrl = 'https://kick.com/img/badges/cheer.svg';
                    break;
                case 'gifter':
                case 'gift_giver':
                    finalIconUrl = 'https://kick.com/img/badges/gifter.svg';
                    break;
                case 'raider':
                case 'raid':
                    finalIconUrl = 'https://kick.com/img/badges/raider.svg';
                    break;
                case 'host':
                case 'hosting':
                    finalIconUrl = 'https://kick.com/img/badges/host.svg';
                    break;
                case 'bot':
                case 'automod':
                    finalIconUrl = 'https://kick.com/img/badges/bot.svg';
                    break;
                case 'custom':
                case 'custom_badge':
                    finalIconUrl = 'https://kick.com/img/badges/custom.svg';
                    break;
                default:
                    // For unknown badges, try to use a generic badge icon
                    finalIconUrl = 'https://kick.com/img/badges/default.svg';
                    break;
            }
        }
        
        return `<img class="kick-badge kick-badge-${type.toLowerCase()}" src="${finalIconUrl}" alt="${name}" title="${title}" style="height:1.2em;vertical-align:middle;margin-right:2px;">`;
    }).join('');
}

function getKickChannelSlug(input) {
    // Accepts either a slug or a full URL
    const match = input.match(/kick\.com\/([A-Za-z0-9_]+)/i);
    if (match) return match[1];
    return input;
}

// Remove fetchKickStatsAuto, startKickStatsAutoRefresh, and #kickUser/#kickStatsButton handlers

$('#kickUser').on('input', function() {
    // startKickStatsAutoRefresh(); // This function is removed
});

// Persistent auto-scroll logic for main chatroom
let shouldAutoScroll = true;
const SCROLL_MARGIN = 100; // px, increased margin for better mobile support
let isUserScrolling = false; // Track if user is actively scrolling
let scrollTimeout = null; // Timeout to reset scroll state

function attachChatScrollHandler() {
    const chat = $('.chatcontainer');
    if (chat.length) {
        chat.off('scroll._autoscr'); // Remove previous handler if any
        chat.on('scroll._autoscr', function() {
            const container = this;
            
            // Mark that user is actively scrolling
            isUserScrolling = true;
            
            // Clear existing timeout
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }
            
            // Set timeout to reset scroll state after user stops scrolling
            scrollTimeout = setTimeout(() => {
                isUserScrolling = false;
            }, 1500); // 1.5 seconds after user stops scrolling
            
            // If user is at (or near) the bottom, enable auto-scroll
            shouldAutoScroll = container.scrollHeight - container.scrollTop - container.clientHeight < SCROLL_MARGIN;
            
            // Show/hide scroll to bottom button
            const scrollToBottomBtn = $('#scrollToBottomBtn');
            if (shouldAutoScroll) {
                scrollToBottomBtn.fadeOut(200);
            } else {
                scrollToBottomBtn.fadeIn(200);
            }
        });
    }
}

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

    // Auto-connect to Kick if kick parameter is present
    if (window.settings.kick) {
        // Direct connection for overlay (no button needed)
        let kickInput = window.settings.kick.trim();
        // If user pasted a full link, extract the username
        const match = kickInput.match(/kick\.com\/([A-Za-z0-9_]+)/i);
        if (match) {
            kickInput = match[1];
        }
        // Validate username
        if (/^[A-Za-z0-9_]{2,24}$/.test(kickInput)) {
            // Track the current channel for filtering
            currentKickChannel = kickInput;
            kickChatReady = false;
            window.connection.socket.emit('setKickLink', kickInput);
            $('#stateText').text('Connecting to Kick...');
            
            // Refresh bolbal emotes when connecting to Kick
            fetchKickBolbalEmotes();
        }
    }

    // Test event to confirm Socket.IO connection
    window.connection.socket.emit('testEvent', 'hello from frontend');
    
    // Fetch bolbal emotes on page load
    fetchKickBolbalEmotes();

    // Only attach scroll handler if .chatcontainer exists (main chatroom)
    if ($('.chatcontainer').length) {
        attachChatScrollHandler();
    }

    // Set initial state to offline
    setLiveDot('tiktokDot', false);
    setLiveDot('kickDot', false);

    // TIKTOK CHAT HANDLING - Use Socket.IO connection
    if (window.connection && window.connection.socket) {
        // Listen for TikTok chat events via Socket.IO
        window.connection.socket.on('chat', function(msg) {
            const tiktokMessage = `<div class="tiktok-message">
                <img class="miniprofilepicture" src="${msg.profilePictureUrl || ''}">
                <b>${msg.nickname || msg.uniqueId}:</b>
                <span>${sanitize(msg.comment)}</span>
            </div>`;
            
            const isMainChat = $('.chatcontainer').length > 0;
            const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
            const doScroll = isMainChat ? shouldAutoScroll : isChatScrolledToBottom();
            container.append(tiktokMessage);
            
            // Limit to 100 messages
            const allMessages = container.children('div.kick-message, div.tiktok-message, div:not(.containerheader)');
            if (allMessages.length > 100) {
                allMessages.slice(0, allMessages.length - 100).remove();
            }
            
            const chatEl = container[0];
            if (chatEl && doScroll) {
                container.scrollTop(chatEl.scrollHeight);
            }
            $('#stateText').text('TikTok chat: message received');
            if (isMainChat) attachChatScrollHandler(); // Re-attach in case container was replaced
        });
        
        // TikTok live status events
        window.connection.socket.on('tiktokConnected', function(state) {
            console.log('[LiveStatus] TikTok connected event fired, state:', state);
            setLiveDot('tiktokDot', true);
            $('#stateText').text(`Connected to roomId ${state && state.roomId ? state.roomId : ''}`);
            
            // Reset stats
            viewerCount = 0;
            likeCount = 0;
            diamondsCount = 0;
            updateRoomStats();
            
            // Clear chat container
            $('.chatcontainer').empty().append('<h3 class="containerheader">Chats</h3>');
            attachChatScrollHandler();
        });
        
        window.connection.socket.on('tiktokDisconnected', function(reason) {
            console.log('[LiveStatus] TikTok disconnected event fired, reason:', reason);
            setLiveDot('tiktokDot', false);
            $('#stateText').text(reason);
            
            // Schedule retry if obs username set
            if (window.settings.username) {
                setTimeout(() => {
                    connect();
                }, 30000);
            }
        });
        
        // Other TikTok events
        window.connection.socket.on('roomUser', (msg) => {
            if (typeof msg.viewerCount === 'number') {
                viewerCount = msg.viewerCount;
                updateRoomStats();
            }
        });
        
        window.connection.socket.on('like', (data) => {
            if (typeof data.totalLikeCount === 'number') {
                likeCount = data.totalLikeCount;
                updateRoomStats();
            }
            handleEventLive(ENUM_TYPE_ACTION.LIKE, data);
        });
        
        window.connection.socket.on('gift', (data) => {
            if (typeof data.diamondCount === 'number') {
                diamondsCount += data.diamondCount;
                updateRoomStats();
            }
            handleEventLive(ENUM_TYPE_ACTION.GIFT, data);
        });
        
        window.connection.socket.on('social', (data) => {
            handleEventLive(ENUM_TYPE_ACTION.SHARE_FOLLOW, data);
        });
        
        window.connection.socket.on('member', (data) => {
            // Handle user join events
            const isMainChat = $('.chatcontainer').length > 0;
            const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
            const doScroll = isMainChat ? shouldAutoScroll : isChatScrolledToBottom();
            
            container.append(
                `<div class="tiktok-message">
                    <img class="miniprofilepicture" src="${data.profilePictureUrl || ''}">
                    <b>${data.nickname || data.uniqueId}:</b>
                    <span style="color: #00ff00;">🚪 joined the chat</span>
                </div>`
            );
            
            // After appending, limit to 100 messages
            const allMessages = container.children('div.kick-message, div.tiktok-message, div:not(.containerheader)');
            if (allMessages.length > 100) {
                allMessages.slice(0, allMessages.length - 100).remove();
            }
            
            const chatEl = container[0];
            if (chatEl && doScroll) {
                container.scrollTop(chatEl.scrollHeight);
            }
            if (isMainChat) attachChatScrollHandler(); // Re-attach in case container was replaced
        });
        
        // Catch-all event logger for debugging
        ['tiktokConnected', 'connected', 'roomUser', 'chat', 'streamEnd', 'disconnect', 'error'].forEach(evt => {
            window.connection.socket.on(evt, (...args) => {
                console.log('[DEBUG] Event:', evt, args);
            });
        });
    }
});

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
    console.log('[DEBUG] connect() called');
    let uniqueId = window.settings.username || $('#uniqueIdInput').val();
    if (uniqueId && isValidTikTokUsername(uniqueId)) {
        $('#stateText').text('Connecting...');
        
        // Add timeout for connection attempts
        const connectionTimeout = setTimeout(() => {
            $('#stateText').text('Connection timeout. User might not be live.');
        }, 15000); // 15 second timeout
        
        // Clear timeout when connection succeeds or fails
        const originalConnected = window.connection.socket.listeners('tiktokConnected')[0];
        const originalDisconnected = window.connection.socket.listeners('tiktokDisconnected')[0];
        
        window.connection.socket.once('tiktokConnected', () => {
            clearTimeout(connectionTimeout);
            if (originalConnected) originalConnected.apply(this, arguments);
        });
        
        window.connection.socket.once('tiktokDisconnected', (reason) => {
            clearTimeout(connectionTimeout);
            if (originalDisconnected) originalDisconnected.apply(this, arguments);
            
            // Show user-friendly message for offline users
            if (reason && typeof reason === 'string' && (reason.includes('not live') || reason.includes('offline') || reason.includes('not found'))) {
                $('#stateText').text('User is not currently live. Please try a different username.');
            }
        });
        
        // Emit setUniqueId to server via Socket.IO instead of direct connection
        window.connection.socket.emit('setUniqueId', uniqueId, {
            enableExtendedGiftInfo: true
        });
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

        const isMainChat = $('.chatcontainer').length > 0;
        const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
        const doScroll = isMainChat ? shouldAutoScroll : isChatScrolledToBottom();

        if (typeEvent === ENUM_TYPE_ACTION.GIFT) {
            if (Number.isInteger(data.diamondCount) && data.diamondCount > 0) {
                container.append(
                    `<div>
                        <img class="miniprofilepicture" src="${data.profilePictureUrl || ''}">
                        <b>${data.nickname || data.uniqueId}:</b>
                        <span>💎 [GIFT] sent ${data.diamondCount} diamonds</span>
                    </div>`
                );
                const chatEl = container[0];
                if (chatEl && doScroll) {
                    container.scrollTop(chatEl.scrollHeight);
                }
            }
        } else if (typeEvent === ENUM_TYPE_ACTION.LIKE) {
            container.append(
                `<div>
                    <img class="miniprofilepicture" src="${data.profilePictureUrl || ''}">
                    <b>${data.nickname || data.uniqueId}:</b>
                    <span style="color: red;">❤️ liked the stream</span>
                </div>`
            );
            const chatEl = container[0];
            if (chatEl && doScroll) {
                container.scrollTop(chatEl.scrollHeight);
            }
        } else {
            container.append(
                `<div>
                    <img class="miniprofilepicture" src="${data.profilePictureUrl || ''}">
                    <b>${data.nickname || data.uniqueId}:</b>
                    <span>⭐ shared or followed</span>
                </div>`
            );
            const chatEl = container[0];
            if (chatEl && doScroll) {
                container.scrollTop(chatEl.scrollHeight);
            }
        }
        // After appending, limit to 100 messages
        const allMessages = container.children('div.kick-message, div.tiktok-message, div:not(.containerheader)');
        if (allMessages.length > 100) {
            allMessages.slice(0, allMessages.length - 100).remove();
        }
        const chatEl = container[0];
        if (chatEl && doScroll) {
            container.scrollTop(chatEl.scrollHeight);
        }
        if (isMainChat) attachChatScrollHandler(); // Re-attach in case container was replaced
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
// connection.on('roomUser', (msg) => {
//     if (typeof msg.viewerCount === 'number') {
//         viewerCount = msg.viewerCount;
//         updateRoomStats();
//     }
// });

// Update like stats and handle like events
// connection.on('like', (data) => {
//     if (typeof data.totalLikeCount === 'number') {
//         likeCount = data.totalLikeCount;
//         updateRoomStats();
//     }
//     handleEventLive(ENUM_TYPE_ACTION.LIKE, data);
// });

// Update diamonds from gifts and handle gift events
// connection.on('gift', (data) => {
//     if (typeof data.diamondCount === 'number') {
//         diamondsCount += data.diamondCount;
//         updateRoomStats();
//     }
//     handleEventLive(ENUM_TYPE_ACTION.GIFT, data);
// });

// Handle share/follow events
// connection.on('social', (data) => {
//     handleEventLive(ENUM_TYPE_ACTION.SHARE_FOLLOW, data);
// });

// Show chat messages in the UI
// connection.on('chat', (msg) => {
//     const chatMessage = `<div>
//         <img class="miniprofilepicture" src="${msg.profilePictureUrl || ''}">
//         <b>${msg.nickname || msg.uniqueId}:</b>
//         <span>${sanitize(msg.comment)}</span>
//     </div>`;
    
//     // Append to chatcontainer if it exists (main page), otherwise to eventcontainer (overlay)
//     const isMainChat = $('.chatcontainer').length > 0;
//     const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
//     const doScroll = isMainChat ? shouldAutoScroll : isChatScrolledToBottom();
//     container.append(chatMessage);
//     // Limit to 100 messages
//     const allMessages = container.children('div.kick-message, div.tiktok-message, div:not(.containerheader)');
//     if (allMessages.length > 100) {
//         allMessages.slice(0, allMessages.length - 100).remove();
//     }
//     const chatEl = container[0];
//     if (chatEl && doScroll) {
//         container.scrollTop(chatEl.scrollHeight);
//     }
// });

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
        
        // Refresh bolbal emotes when connecting to Kick
        fetchKickBolbalEmotes();

        // --- Auto-fetch Kick stats on connect and start auto-refresh ---
        function fetchKickStatsForConnected() {
            const user = currentKickChannel;
    if (!user) {
        return;
    }

            const url = `https://kick.com/api/v1/channels/${user}`;

            fetch(url)
        .then(res => {
            return res.text();
        })
                .then(text => {
                    let data;
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                console.error('[KickStats] Parse error:', e);
                        return;
                    }

            // Store stream data globally for duration counter
            window.currentKickStreamData = data;
                    
                    updateKickLiveDotFromStats(data);
                    
                    // Calculate stream duration
                    let streamDuration = 'Not live';
                    if (data.livestream?.start_time && data.livestream?.is_live) {
                        // Debug: Log the raw start_time from API
                        console.log('[KickStats] Raw start_time from API:', data.livestream.start_time);
                        
                        // Parse the start time as UTC to avoid timezone conversion issues
                        const startTime = new Date(data.livestream.start_time + 'Z'); // Force UTC
                        streamStartTime = startTime;
                        
                        console.log('[KickStats] Parsed start time (UTC):', startTime.toISOString());
                        console.log('[KickStats] Local time equivalent:', startTime.toString());
                        
                        // Start real-time duration counter if not already running
                        if (!durationInterval) {
                            durationInterval = setInterval(updateDurationDisplay, 1000);
                        }
                        
                        // Calculate initial duration using UTC time
                        const now = new Date();
                        const durationMs = now - startTime;
                        const hours = Math.floor(durationMs / (1000 * 60 * 60));
                        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                        const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
                        

                        
                        if (hours > 0) {
                            streamDuration = `${hours}h ${minutes}m ${seconds}s`;
                        } else if (minutes > 0) {
                            streamDuration = `${minutes}m ${seconds}s`;
                        } else {
                            streamDuration = `${seconds}s`;
                        }
                    } else {
                        // Stop duration counter if not live
                        if (durationInterval) {
                            clearInterval(durationInterval);
                            durationInterval = null;
                            streamStartTime = null;
                        }
                    }
                    
                    // Store the current duration globally
                    window.currentStreamDuration = streamDuration;
                    
                                // Check if this is the first time or if title has changed
            const isFirstTime = !window.currentKickStatsData;
            const newTitle = data.livestream?.session_title || data.livestream?.title || 'No title';
            const currentTitle = window.currentKickStatsData?.title || 'No title';
            const titleChanged = isFirstTime || (newTitle !== currentTitle);
                    
                    // Store the data for the stats system
                    // Only update title if we have a valid title, otherwise keep the existing one
                    const validTitle = newTitle !== 'No title' && newTitle !== 'undefined' && newTitle !== undefined ? newTitle : (window.currentKickStatsData?.title || 'No title');
                    
                    // Additional safeguard: if we have a valid existing title, don't overwrite it with undefined
                    const finalTitle = (validTitle === 'No title' && window.currentKickStatsData?.title && window.currentKickStatsData.title !== 'No title') 
                        ? window.currentKickStatsData.title 
                        : validTitle;
                    
                    window.currentKickStatsData = {
                        followers: data.followersCount ?? 'N/A',
                        viewers: data.livestream?.viewer_count ?? 'Not live',
                        title: finalTitle,
                        lastUpdated: new Date().toLocaleTimeString()
                    };
                    
                                if (isFirstTime || titleChanged) {
                // Display the stats immediately with full HTML using unique IDs
                const durationDisplay = `<b style="color:#1db954">Duration:</b> <span id="kick-duration" style="color:#fff">${streamDuration}</span>`;
                const statsHtml = `<b style="color:#1db954">Kick Followers:</b> <span id="kick-followers" style="color:#fff">${window.currentKickStatsData.followers}</span> &nbsp; <b style="color:#1db954">Kick Viewers:</b> <span id="kick-viewers" class="kick-viewers-green" style="color:#fff">${window.currentKickStatsData.viewers}</span> &nbsp; ${durationDisplay}<br><b style="color:#1db954">Title:</b> <span id="kick-title" style="color:#fff;font-style:italic;">${window.currentKickStatsData.title}</span> <span id="kick-timestamp" style="color:#666;font-size:0.8em;">(Updated: ${window.currentKickStatsData.lastUpdated})</span>`;

                $('#kickStats').html(statsHtml);
            } else {
                // Only update the changing parts using unique IDs
                // This should prevent the title from flickering

                // Update followers count
                $('#kick-followers').text(window.currentKickStatsData.followers);

                // Update viewers count
                $('#kick-viewers').text(window.currentKickStatsData.viewers);

                // Update duration
                $('#kick-duration').text(streamDuration);

                // Update timestamp
                $('#kick-timestamp').text(`(Updated: ${window.currentKickStatsData.lastUpdated})`);
            }
                })
                .catch((error) => {
                    console.error('[KickStats] Fetch error:', error);
                    setLiveDot('kickDot', false);
                    
                    // Show error message but keep duration if available
                    if (window.currentStreamDuration) {
                        const durationDisplay = `<b style="color:#1db954">Duration:</b> <span style="color:#fff">${window.currentStreamDuration}</span>`;
                        $('#kickStats').html(`Could not fetch Kick stats. &nbsp; ${durationDisplay}`);
                    } else {
                    $('#kickStats').html('Could not fetch Kick stats.');
                    }
                });
        }
        // Fetch stats immediately and then every 3 seconds for faster updates
        fetchKickStatsForConnected();
        setInterval(fetchKickStatsForConnected, 3000);
        
        // Start real-time duration counter if stream is live
        startDurationCounter();
        // --- End auto-fetch and auto-refresh ---
    });

    window.connection.socket.on('kickConnected', function(data) {
        // Clear chat container for new streamer when connection is ready
        $('.chatcontainer').empty().append('<h3 class="containerheader">Chats</h3>');
        $('#stateText').text('Connected to Kick stats! (Chat coming soon with official API)');
        kickChatReady = true;
        attachChatScrollHandler(); // Re-attach scroll handler after clearing chat
        
        // Update live dot to online when connected
        setLiveDot('kickDot', true);
        
        // Initialize duration display to ensure it's always shown
        window.currentStreamDuration = 'Not live';
        
        // Fetch stats immediately when connected
        if (window.fetchKickStatsForConnected) {
            window.fetchKickStatsForConnected();
        }
    });

    window.connection.socket.on('kickChat', function(msg) {
        // Only show messages for the currently connected channel and when ready
        if (!kickChatReady) {
            return;
        }
        if (!msg.channelSlug || msg.channelSlug !== currentKickChannel) {
            return;
        }
        
        function sanitize(str) {
            return String(str).replace(/[&<>"']/g, function (c) {
                return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
            });
        }
        const profilePic = msg.sender?.profile_picture || msg.sender?.profilePic || msg.sender?.profile_picture_url || 'https://kick.com/img/kick-logo.svg';
        const isMainChat = $('.chatcontainer').length > 0;
        const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
        const doScroll = isMainChat ? shouldAutoScroll : isChatScrolledToBottom();
        
        const messageHtml = renderKickMessage(msg.content, msg.emotes);
        
        // Enhanced badge rendering
        console.log('[Badge Debug] Message data:', msg);
        console.log('[Badge Debug] Sender badges:', msg.sender?.badges);
        console.log('[Badge Debug] Direct badges:', msg.badges);
        const badgeHtml = renderKickBadges(msg.sender?.badges || msg.badges);
        console.log('[Badge Debug] Rendered badge HTML:', badgeHtml);
        
        const kickMessage = `<div class="kick-message">
            <img class="miniprofilepicture" src="${profilePic}" onerror="this.onerror=null;this.src='kick-logo.png';">
            ${badgeHtml}
            <b style="color:${msg.sender?.color || getRandomColor(msg.sender?.username || '')} !important">${sanitize(msg.sender?.username || '')}:</b>
            <span>${messageHtml}</span>
        </div>`;
        
        container.append(kickMessage);
        
        // Limit to 100 messages
        const allMessages = container.children('div.kick-message, div.tiktok-message, div:not(.containerheader)');
        if (allMessages.length > 100) {
            allMessages.slice(0, allMessages.length - 100).remove();
        }
        
        const chatEl = container[0];
        if (chatEl && doScroll) {
            container.scrollTop(chatEl.scrollHeight);
        }
        $('#stateText').text('Kick chat: message received');
        if (isMainChat) attachChatScrollHandler(); // Re-attach in case container was replaced
    });

    // Handle Kick gifts
    window.connection.socket.on('kickGift', function(gift) {
        if (!kickChatReady || !gift.channelSlug || gift.channelSlug !== currentKickChannel) {
            return;
        }
        
        const profilePic = gift.sender?.profile_picture || 'https://kick.com/img/kick-logo.svg';
        const isMainChat = $('.chatcontainer').length > 0;
        const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
        const doScroll = isMainChat ? shouldAutoScroll : isChatScrolledToBottom();
        
        const giftMessage = `<div class="kick-gift">
                <img class="miniprofilepicture" src="${profilePic}" onerror="this.onerror=null;this.src='kick-logo.png';">
            <span class="gift-icon">🎁</span>
            <b style="color:${gift.sender?.color || getRandomColor(gift.sender?.username || '')} !important">${gift.sender?.username}</b>
            <span>sent ${gift.gift.count}x ${gift.gift.name}</span>
        </div>`;
        
        container.append(giftMessage);
        
        // Limit messages and scroll
        const allMessages = container.children('div.kick-message, div.tiktok-message, div.kick-gift, div:not(.containerheader)');
        if (allMessages.length > 100) {
            allMessages.slice(0, allMessages.length - 100).remove();
        }
        
        const chatEl = container[0];
        if (chatEl && doScroll) {
            container.scrollTop(chatEl.scrollHeight);
        }
        
        $('#stateText').text('Kick: gift received');
    });

    // Handle Kick subscriptions
    window.connection.socket.on('kickSubscription', function(sub) {
        if (!kickChatReady || !sub.channelSlug || sub.channelSlug !== currentKickChannel) {
            return;
        }
        
        const profilePic = sub.sender?.profile_picture || 'https://kick.com/img/kick-logo.svg';
        const isMainChat = $('.chatcontainer').length > 0;
        const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
        const doScroll = isMainChat ? shouldAutoScroll : isChatScrolledToBottom();
        
        const subMessage = `<div class="kick-subscription">
            <img class="miniprofilepicture" src="${profilePic}" onerror="this.onerror=null;this.src='kick-logo.png';">
            <span class="sub-icon">💜</span>
            <b style="color:${sub.sender?.color || getRandomColor(sub.sender?.username || '')} !important">${sub.sender?.username}</b>
            <span>subscribed for ${sub.subscription.months} month${sub.subscription.months > 1 ? 's' : ''}</span>
            ${sub.subscription.message ? `<span class="sub-message">"${sub.subscription.message}"</span>` : ''}
        </div>`;
        
        container.append(subMessage);
        
        // Limit messages and scroll
        const allMessages = container.children('div.kick-message, div.tiktok-message, div.kick-gift, div.kick-subscription, div:not(.containerheader)');
        if (allMessages.length > 100) {
            allMessages.slice(0, allMessages.length - 100).remove();
        }
        
        const chatEl = container[0];
        if (chatEl && doScroll) {
            container.scrollTop(chatEl.scrollHeight);
        }
        
        $('#stateText').text('Kick: new subscriber');
    });

    // Handle Kick follows
    window.connection.socket.on('kickFollow', function(follow) {
        if (!kickChatReady || !follow.channelSlug || follow.channelSlug !== currentKickChannel) {
            return;
        }
        
        const profilePic = follow.sender?.profile_picture || 'https://kick.com/img/kick-logo.svg';
        const isMainChat = $('.chatcontainer').length > 0;
        const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
        const doScroll = isMainChat ? shouldAutoScroll : isChatScrolledToBottom();
        
        const followMessage = `<div class="kick-follow">
            <img class="miniprofilepicture" src="${profilePic}" onerror="this.onerror=null;this.src='kick-logo.png';">
            <span class="follow-icon">👋</span>
            <b style="color:${follow.sender?.color || getRandomColor(follow.sender?.username || '')} !important">${follow.sender?.username}</b>
            <span>followed the channel</span>
        </div>`;
        
        container.append(followMessage);
        
        // Limit messages and scroll
        const allMessages = container.children('div.kick-message, div.tiktok-message, div.kick-gift, div.kick-subscription, div.kick-follow, div:not(.containerheader)');
        if (allMessages.length > 100) {
            allMessages.slice(0, allMessages.length - 100).remove();
        }
        
        const chatEl = container[0];
        if (chatEl && doScroll) {
            container.scrollTop(chatEl.scrollHeight);
        }
        
        $('#stateText').text('Kick: new follower');
    });

    // Handle Kick stream events
    window.connection.socket.on('kickStreamStart', function(event) {
        if (!kickChatReady || !event.channelSlug || event.channelSlug !== currentKickChannel) {
            return;
        }
        
        // Update live dot to online
        setLiveDot('kickDot', true);
        
        const isMainChat = $('.chatcontainer').length > 0;
        const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
        
        const streamMessage = `<div class="kick-stream-event">
            <span class="stream-icon">🔴</span>
            <span class="stream-text">Stream started</span>
        </div>`;
        
        container.append(streamMessage);
        $('#stateText').text('Kick: stream started');
    });

    window.connection.socket.on('kickStreamEnd', function(event) {
        if (!kickChatReady || !event.channelSlug || event.channelSlug !== currentKickChannel) {
            return;
        }
        
        // Update live dot to offline
        setLiveDot('kickDot', false);
        
        const isMainChat = $('.chatcontainer').length > 0;
        const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
        
        const streamMessage = `<div class="kick-stream-event">
            <span class="stream-icon">⚫</span>
            <span class="stream-text">Stream ended</span>
        </div>`;
        
        container.append(streamMessage);
        $('#stateText').text('Kick: stream ended');
    });

    window.connection.socket.on('kickDisconnected', function(reason) {
        console.log('[Kick] Disconnected:', reason);
        $('#stateText').text('Kick chat disconnected: ' + reason);
        
        // Update live dot to offline when disconnected
        setLiveDot('kickDot', false);
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

// Sanitize function for TikTok messages (if not already defined)
function sanitize(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
        return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];
    });
}

// Helper: Only auto-scroll if user is at (or near) the bottom
function isChatScrolledToBottom() {
    const container = $('.chatcontainer').length ? $('.chatcontainer')[0] : $('.eventcontainer')[0];
    if (!container) return true; // If no container exists, assume we should scroll
    
    // If user is actively scrolling, don't auto-scroll
    if (isUserScrolling) {
        return false;
    }
    
    // Use larger margin for mobile devices
    const margin = window.innerWidth <= 768 ? 150 : 50;
    return container.scrollHeight - container.scrollTop - container.clientHeight < margin;
}

// Generate consistent color for usernames
function getRandomColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 60%)`;
}

// Test function to verify emote and badge functionality
function testKickFeatures() {
    // Removed for production cleanup
}

// Global function to render Kick messages with emote replacement
function renderKickMessage(content, emotes) {
    let rendered = sanitize(content);
    // First, replace emotes from the message (channel-specific emotes)
    if (emotes && emotes.length > 0) {
        emotes.forEach(emote => {
            const emoteTag = `<img src="${emote.url}" alt="${emote.name}" class="kick-emote" style="height:1.5em;vertical-align:middle;">`;
            const regex = new RegExp(sanitize(emote.name), 'gi');
            rendered = rendered.replace(regex, emoteTag);
        });
    }
    // Then, replace bolbal emotes from the global cache
    const sortedEmoteCodes = Object.keys(kickBolbalEmotes).sort((a, b) => b.length - a.length);
    sortedEmoteCodes.forEach(code => {
        const emoteTag = `<img src="${kickBolbalEmotes[code]}" alt="${code}" class="kick-emote" style="height:1.5em;vertical-align:middle;">`;
        const regex = new RegExp(`\\b${sanitize(code)}\\b`, 'gi');
        rendered = rendered.replace(regex, emoteTag);
    });
    return rendered;
}

// Live status dot helpers
function setLiveDot(dotId, isLive) {
    const dot = document.getElementById(dotId);
    if (!dot) return;
    dot.classList.remove('live', 'offline');
    dot.classList.add(isLive ? 'live' : 'offline');
}

// Scroll to bottom function
function scrollToBottom() {
    const container = $('.chatcontainer').length ? $('.chatcontainer') : $('.eventcontainer');
    if (container.length) {
        container.scrollTop(container[0].scrollHeight);
        shouldAutoScroll = true;
        isUserScrolling = false;
        $('#scrollToBottomBtn').fadeOut(200);
    }
}

// Real-time duration counter
let durationInterval = null;
let streamStartTime = null;

function startDurationCounter() {
    // Clear any existing interval
    if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
    }
    
    // Get stream start time from current stats
    const kickStatsElement = document.getElementById('kickStats');
    if (kickStatsElement && kickStatsElement.textContent.includes('Duration:')) {
        // Extract start time from the stats data (we'll need to store this globally)
        if (window.currentKickStreamData && window.currentKickStreamData.livestream?.start_time) {
            // Parse as UTC to avoid timezone conversion issues
            streamStartTime = new Date(window.currentKickStreamData.livestream.start_time + 'Z');
            updateDurationDisplay();
            
            // Update duration every second
            durationInterval = setInterval(updateDurationDisplay, 1000);
        }
    }
}

function updateDurationDisplay() {
    if (!streamStartTime) {
        // If no start time, show "Not live" but keep the display
        window.currentStreamDuration = 'Not live';
        return;
    }
    
    // Use current time in UTC to match the start time calculation
    const now = new Date();
    const durationMs = now - streamStartTime;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((durationMs % (1000 * 60)) / 1000);
    
    let streamDuration;
    if (hours > 0) {
        streamDuration = `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
        streamDuration = `${minutes}m ${seconds}s`;
    } else {
        streamDuration = `${seconds}s`;
    }
    
    // Store the current duration globally so stats updates can use it
    window.currentStreamDuration = streamDuration;
    
    // Rebuild the entire stats display with current data
    if (window.currentKickStatsData) {
        const durationDisplay = `<b style="color:#1db954">Duration:</b> <span style="color:#fff">${streamDuration}</span>`;
        const statsHtml = `<b style="color:#1db954">Kick Followers:</b> <span style="color:#fff">${window.currentKickStatsData.followers}</span> &nbsp; <b style="color:#1db954">Kick Viewers:</b> <span class="kick-viewers-green" style="color:#fff">${window.currentKickStatsData.viewers}</span> &nbsp; ${durationDisplay}<br><b style="color:#1db954">Title:</b> <span style="color:#fff;font-style:italic;">${window.currentKickStatsData.title}</span> <span style="color:#666;font-size:0.8em;">(Updated: ${window.currentKickStatsData.lastUpdated})</span>`;
        
        $('#kickStats').html(statsHtml);
    }
}

// Kick live status (update in Kick stats polling)
function updateKickLiveDotFromStats(data) {
    // Kick is live if viewers > 0
    const isLive = (data && data.livestream && data.livestream.viewer_count > 0);
    setLiveDot('kickDot', isLive);
}
// Patch into Kick stats polling
$(document).ready(() => {
    // ... existing code ...

});
