// Always use the local server for development
// === CONFIGURATION ===
// If you host the frontend (this webpage) on Vercel and the backend on Render, 
// change this to your Render URL (e.g., 'https://my-backend.onrender.com').
// Leave as location.origin if running locally or keeping them together.
const BACKEND_URL = 'https://combinedchat-v4l0.onrender.com';
// =====================

// Ensure window.connection is always initialized
let connection = new TikTokIOConnection();
window.connection = connection;

// HELPER: Bot detection
function isBotMessage(username) {
    if (!username) return false;
    const hideBots = (window.settings && window.settings.hideBots === '1') || 
                     ($('#filterHideBots').length && $('#filterHideBots').is(':checked'));
    if (!hideBots) return false;
    
    const bots = ['nightbot', 'streamelements', 'streamlabs', 'moobot', 'wizebot', 'fossabot', 'commanderroot', 'kofibot', 'botrix', 'soundalerts', 'pretzelrocks', 'sery_bot'];
    return bots.includes(username.toLowerCase());
}

// HELPER: Message disappear logic (intercepts jQuery append)
const originalAppend = $.fn.append;
$.fn.append = function() {
    let result = originalAppend.apply(this, arguments);
    if (this.hasClass('chatcontainer') || this.hasClass('eventcontainer')) {
        let secs = 0;
        if (window.settings && window.settings.disappear) {
            secs = parseInt(window.settings.disappear, 10);
        }
        if (secs > 0) {
            this.children().not('.disappear-scheduled').each(function() {
                $(this).addClass('disappear-scheduled');
                setTimeout(() => {
                    $(this).animate({ opacity: 0, height: 0, padding: 0, margin: 0, border: 0 }, 500, function() { $(this).remove(); });
                }, secs * 1000);
            });
        }
    }
    return result;
};

// Counter
let viewerCount = 0;
let likeCount = 0;
let diamondsCount = 0;

// These settings are defined by obs.html
if (!window.settings) window.settings = {};

let idComment = undefined;

let bannedUserSpam = []

let currentKickChannel = null;
let currentTwitchChannelName = null;
let kickChatReady = false;

// Global Kick emotes cache
let kickBolbalEmotes = {};

// Function to fetch and cache bolbal emotes from Kick
async function fetchKickBolbalEmotes() {
    try {
        // Kick removed their public global emotes v1 API which was causing 404 errors.
        // Leaving this empty so we don't spam the console.
        const sources = [];
        
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

const defaultKickBadges = {
    subscriber: 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%2353FC18\'><path d=\'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z\'/></svg>',
    moderator: 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%2353FC18\'><path d=\'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z\'/></svg>',
    broadcaster: 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23FF0000\'><path d=\'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z\'/></svg>',
    verified: 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%2300C3FF\'><path d=\'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z\'/></svg>',
    founder: 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23FFD700\'><path d=\'M12 2L2 22h20L12 2zM12 6l5 14H7l5-14z\'/></svg>',
    og: 'data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'%23FF9500\'><path d=\'M12 2L2 22h20L12 2zM12 6l5 14H7l5-14z\'/></svg>',
    vip: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#clip0_746_28171)"><path d="M30 0C31.1046 0 32 0.895431 32 2V30C32 31.1046 31.1046 32 30 32H2C0.895431 32 0 31.1046 0 30V2C0 0.895431 0.895431 4.10637e-08 2 0H30ZM15.9648 5C15.7748 5.00005 15.588 5.05204 15.4238 5.15039C15.2596 5.24878 15.124 5.39057 15.0303 5.56055L9.82812 15.0176L3.55078 11.8906C3.36913 11.7985 3.16534 11.7607 2.96387 11.7822C2.76241 11.8038 2.57048 11.8842 2.41113 12.0127C2.25235 12.1408 2.13185 12.3126 2.06348 12.5078C1.99511 12.7031 1.98143 12.9144 2.02441 13.1172L4.58301 25.127C4.63544 25.3782 4.77165 25.6034 4.96777 25.7627C5.16376 25.9217 5.40762 26.0056 5.65723 26H26.251C26.5009 26.0057 26.7453 25.9219 26.9414 25.7627C27.1376 25.6034 27.2737 25.3782 27.3262 25.127L29.9697 13.1172C30.0187 12.9103 30.0086 12.6932 29.9404 12.4922C29.8722 12.2912 29.7485 12.1151 29.585 11.9844C29.4215 11.8537 29.2249 11.7743 29.0186 11.7559C28.8122 11.7374 28.6049 11.7802 28.4219 11.8799L22.1025 15.0283L16.9004 5.56055C16.8066 5.39054 16.6701 5.24878 16.5059 5.15039C16.3416 5.05207 16.1549 5 15.9648 5Z" fill="url(#paint0_linear_746_28171)"></path></g><defs><linearGradient id="paint0_linear_746_28171" x1="18.8102" y1="-12.7222" x2="2.88536" y2="39.1063" gradientUnits="userSpaceOnUse"><stop stop-color="#FF6A4A"></stop><stop offset="1" stop-color="#C70C00"></stop></linearGradient><clipPath id="clip0_746_28171"><rect width="32" height="32" fill="white"></rect></clipPath></defs></svg>')
};

window.currentKickSubBadges = [];

function fetchKickSubBadges(channelSlug) {
    if (!channelSlug) return;
    const url = `https://kick.com/api/v1/channels/${channelSlug}`;
    fetch(url)
        .then(res => res.json())
        .then(data => {
            const rawBadges = data.subscriber_badges || data.subscriberBadges || data.badges || [];
            window.currentKickSubBadges = rawBadges.map(b => ({
                months: b.months || b.count || 1,
                url: b.badge_image?.src || b.badge_image?.srcset || b.url || b.badge_url || b.src || b.image_url
            })).filter(b => b.url).sort((a, b) => a.months - b.months);
            console.log('[Kick Badges] Loaded custom sub badges for', channelSlug, window.currentKickSubBadges);
        })
        .catch(err => console.error('[Kick Badges] Failed to fetch sub badges:', err));
}

function renderKickBadges(badges) {
    if (!badges || !badges.length) return '';
    return badges.map(b => {
        let badgeType = (b.type || b.name || '').toLowerCase();
        let src = b.icon_url || b.url || b.iconUrl || b.badge_url || b.active_badge?.url || b.badge?.url || b.image_url || b.src;
        
        // If subscriber badge image URL is missing, look up custom sub badge from current Kick channel
        if ((badgeType === 'subscriber' || badgeType === 'sub') && (!src || src === 'undefined')) {
            const months = b.count || b.months || 1;
            if (window.currentKickSubBadges && window.currentKickSubBadges.length > 0) {
                let matched = null;
                for (const cb of window.currentKickSubBadges) {
                    if (cb.months <= months) {
                        matched = cb;
                    }
                }
                if (!matched) matched = window.currentKickSubBadges[0];
                if (matched && matched.url) {
                    src = matched.url;
                }
            }
        }

        if (!src || src === 'undefined') {
            src = defaultKickBadges[badgeType] || '';
        }
        if (!src) return '';
        const badgeTitle = b.title || b.name || b.text || (b.count ? `${b.count}-Month Subscriber` : badgeType);
        return `<img src="${src}" alt="${badgeTitle}" class="kick-badge" title="${badgeTitle}" style="height:1.2em;vertical-align:middle;margin-right:3px;">`;
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
            $('#stateText').text('Connecting to Kick...');
            
            // Try to fetch chatroom ID from frontend to bypass backend Cloudflare blocks
            fetch(`https://kick.com/api/v1/channels/${kickInput}`)
                .then(r => r.json())
                .then(data => {
                    if (data.error) {
                        $('#stateText').text(`Kick Error: ${data.error} (Cloudflare block or invalid channel). Trying backend...`);
                        window.connection.socket.emit('setKickLink', kickInput, null);
                        return;
                    }
                    const chatroomId = data.chatroom?.id || data.chatroom_id || data.id;
                    if (!chatroomId) {
                        $('#stateText').text(`Kick Error: Could not find chatroom ID for ${kickInput}. Trying backend...`);
                        window.connection.socket.emit('setKickLink', kickInput, null);
                        return;
                    }
                    window.connection.socket.emit('setKickLink', kickInput, chatroomId);
                })
                .catch(err => {
                    console.log('Frontend fetch failed', err);
                    $('#stateText').text(`Kick Connection Failed: Network/CORS error fetching channel data. Trying backend fallback...`);
                    // IMPORTANT: Emit without chatroomId so backend can fallback
                    window.connection.socket.emit('setKickLink', kickInput, null);
                });
            
            // Refresh bolbal emotes when connecting to Kick
            fetchKickBolbalEmotes();
        }
    }

    // Connect to Twitch via button
    $('#twitchConnectButton').click(() => {
        if ($('#twitchConnectButton').val() === 'disconnect') {
            window.connection.socket.emit('disconnectTwitch');
            $('#twitchInput').val('');
            $('.twitch-message').remove();
            $('#twitchConnectButton').val('connect');
            $('#stateText').text('Disconnected from Twitch');
            setLiveDot('twitchDot', false);
            return;
        }
        let channel = $('#twitchInput').val().trim();
        if (channel) {
            window.connection.socket.emit('setTwitchChannel', channel);
        }
    });

    $('#twitchInput').on('keyup', function (e) {
        if (e.key === 'Enter') {
            $('#twitchConnectButton').click();
        }
    });

    // Auto-connect to Twitch if twitch parameter is present
    if (window.settings.twitch) {
        let twitchChannel = window.settings.twitch.trim();
        if (twitchChannel) {
            window.connection.socket.emit('setTwitchChannel', twitchChannel);
            $('#stateText').text('Connecting to Twitch...');
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
    setLiveDot('twitchDot', false);

    // TIKTOK CHAT HANDLING - Use Socket.IO connection
    if (window.connection && window.connection.socket) {
        
        // Listen for live overlay setting updates
        window.connection.socket.on('overlaySettingsUpdated', (newSettings) => {
            if (window.location.pathname.includes('obs.html')) {
                // Merge settings
                window.settings = Object.assign(window.settings || {}, newSettings);
                
                // Update basic body CSS
                if (window.settings.fontSize) $('body').css('font-size', window.settings.fontSize);
                if (window.settings.fontFamily) $('body').css('font-family', window.settings.fontFamily);
                
                // Build dynamic CSS block
                let dynamicCss = `
                    body, body * { font-weight: 700 !important; }
                    body, body * { text-shadow: 2px 2px 4px black, -2px -2px 4px black, 2px -2px 4px black, -2px 2px 4px black, 0px 0px 8px black !important; }
                    .miniprofilepicture { display: none !important; }
                `;
                
                if (window.settings.bgColor) {
                    let boxShadow = window.settings.bgColor === 'transparent' ? 'none' : '';
                    dynamicCss += `
                        .tiktok-message, .kick-message, .twitch-message, .chatcontainer div, .eventcontainer div, .kick-gifted-sub, .kick-gifted-sub-item { 
                            background: ${window.settings.bgColor} !important; 
                            ${boxShadow ? `box-shadow: ${boxShadow} !important; border: none !important;` : ''}
                        }
                        .kick-gifted-sub, .kick-gifted-sub-item { border-left: 4px solid #a855f7 !important; }
                    `;
                }
                
                if (window.settings.animation) {
                    dynamicCss += `
                        .tiktok-message, .kick-message, .twitch-message, .chatcontainer div, .eventcontainer div, .kick-gifted-sub, .kick-gifted-sub-item {
                            animation: ${window.settings.animation} 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards !important;
                        }
                    `;
                }
                
                if (window.settings.showChats === '0') {
                    dynamicCss += `.chat-msg, .kick-message, .twitch-message { display: none !important; }`;
                }
                
                // Apply dynamic CSS
                $('#dynamic-overlay-css').remove();
                $('<style id="dynamic-overlay-css">').text(dynamicCss).appendTo('head');
                
                // Apply layout filters
                if (window.settings.showLikes === '0') $('body').addClass('hide-tiktok-likes'); else $('body').removeClass('hide-tiktok-likes');
                if (window.settings.showFollows === '0') $('body').addClass('hide-tiktok-follows'); else $('body').removeClass('hide-tiktok-follows');
                if (window.settings.showJoins === '0') $('body').addClass('hide-tiktok-joins'); else $('body').removeClass('hide-tiktok-joins');
            }
        });
        
        // Listen for TikTok chat events via Socket.IO
        window.connection.socket.on('chat', function(msg) {
            if (isBotMessage(msg.uniqueId)) return;
            const isMainChat = $('.chatcontainer').length > 0;
            const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
            const doScroll = isMainChat ? shouldAutoScroll : isChatScrolledToBottom();
            
            const tiktokMessage = `<div class="tiktok-message chat-msg">
                <svg class="platform-icon" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;filter:drop-shadow(1px 1px 1px rgba(0,0,0,0.8));" viewBox="0 0 448 512"><path fill="#FFFFFF" d="M448 209.9a210.1 210.1 0 0 1-122.8-39.3V349.4A162.6 162.6 0 1 1 185 188.3V278.2a74.6 74.6 0 1 0 52.2 71.2V0l88 0a121.2 121.2 0 0 0 1.9 22.2h0A122.2 122.2 0 0 0 381 102.4a121.4 121.4 0 0 0 67 20.1z"/></svg>
                <img class="miniprofilepicture" src="${msg.profilePictureUrl || ''}">
                <b style="color: ${stringToColor(msg.uniqueId)}">${msg.nickname || msg.uniqueId}:</b> <span class="message-text">${linkify(sanitize(msg.comment))}</span>
            </div>`;
            
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
        
        // Recursive function to safely find viewer count
        function extractViewerCount(obj) {
            let maxCount = -1;
            function search(o) {
                if (!o || typeof o !== 'object') return;
                for (let key in o) {
                    let k = key.toLowerCase();
                    if (k === 'viewercount' || k === 'usercount' || k === 'total') {
                        let val = parseInt(o[key], 10);
                        if (!isNaN(val) && val > maxCount) maxCount = val;
                    }
                    if (typeof o[key] === 'object') {
                        search(o[key]);
                    }
                }
            }
            try { search(obj); } catch (e) {}
            return maxCount;
        }

        // TikTok live status events
        window.connection.socket.on('tiktokConnected', (state) => {
            console.log('[TikTok] Connected:', state);
            tiktokConnected = true;
            $('#tiktokFiltersContainer').show();
            setLiveDot('tiktokDot', true);
            $('#connectButton').val('disconnect');
            
            // reset stats
            viewerCount = 0;
            likeCount = 0;
            diamondsCount = 0;
            
            if (state) {
                let vCount = extractViewerCount(state);
                if (vCount > -1) viewerCount = vCount;
                
                try {
                    let str = JSON.stringify(state);
                    let likeMatches = [...str.matchAll(/"(?:likeCount|like_count|totalLikeCount)":\s*"?(\d+)"?/gi)];
                    if (likeMatches.length > 0) {
                        likeCount = Math.max(...likeMatches.map(m => parseInt(m[1], 10)));
                    }
                } catch(e) {}
            }
            updateRoomStats();
            
            // Removed empty() call so connecting to TikTok doesn't wipe Kick/Twitch messages
            attachChatScrollHandler();
        });
        
        window.connection.socket.on('tiktokDisconnected', (reason) => {
            console.log('[TikTok] Disconnected:', reason);
            tiktokConnected = false;
            $('#tiktokFiltersContainer').hide();
            setLiveDot('tiktokDot', false);
            $('#connectButton').val('connect');
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
            let vCount = extractViewerCount(msg);
            if (vCount > -1) {
                viewerCount = vCount;
                updateRoomStats();
            }
        });
        
        window.connection.socket.on('like', (data) => {
            if (typeof data.totalLikeCount === 'number') {
                likeCount = Math.max(likeCount, data.totalLikeCount);
            } else if (typeof data.likeCount === 'number') {
                likeCount += data.likeCount;
            } else if (typeof data.count === 'number') {
                likeCount += data.count;
            }
            updateRoomStats();
            handleEventLive(ENUM_TYPE_ACTION.LIKE, data);
        });
        
        window.connection.socket.on('gift', (data) => {
            let dc = parseInt(data.diamondCount, 10);
            if (!isNaN(dc)) {
                diamondsCount += dc;
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
                `<div class="tiktok-message join-msg">
                    <svg class="platform-icon" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;filter:drop-shadow(1px 1px 1px rgba(0,0,0,0.8));" viewBox="0 0 448 512"><path fill="#FFFFFF" d="M448 209.9a210.1 210.1 0 0 1-122.8-39.3V349.4A162.6 162.6 0 1 1 185 188.3V278.2a74.6 74.6 0 1 0 52.2 71.2V0l88 0a121.2 121.2 0 0 0 1.9 22.2h0A122.2 122.2 0 0 0 381 102.4a121.4 121.4 0 0 0 67 20.1z"/></svg>
                    <img class="miniprofilepicture" src="${data.profilePictureUrl || ''}">
                    <b style="color: ${stringToColor(data.uniqueId)}">${data.nickname || data.uniqueId}:</b> <span style="color: #00ff00;">🚪 joined the chat</span>
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
        
        // TWITCH CHAT HANDLING
        window.checkTwitchAuthStatus = function() {
            fetch('/api/twitch/auth/status')
                .then(res => res.json())
                .then(data => {
                    if (data.authorized) {
                        window.authorizedTwitchUser = data.username;
                        const displayUser = data.displayName || data.username;
                        $('#twitchUsername').text(displayUser);
                        $('#twitchUserInfo').show();
                        $('#twitchAuthButton').hide();
                        $('#twitchUnauthButton').show();
                        // If we connected before auth, our roomId is null. Reconnect to fetch it properly!
                        if (!window.currentTwitchRoomId && typeof currentTwitchChannelName !== 'undefined' && currentTwitchChannelName) {
                            window.connection.socket.emit('setTwitchChannel', currentTwitchChannelName);
                        }
                        if (window.currentTwitchRoomId && typeof startAdTracker === 'function') {
                            startAdTracker();
                        }
                    } else {
                        window.authorizedTwitchUser = null;
                        $('#twitchUsername').text('');
                        $('#twitchUserInfo').hide();
                        $('#twitchAuthButton').show();
                        $('#twitchUnauthButton').hide();
                    }
                })
                .catch(err => console.error('Failed to check auth status', err));
        };
        // Check auth status immediately on script initialization
        window.checkTwitchAuthStatus();

        window.checkKickAuthStatus = function() {
            fetch('/api/kick/auth/status')
                .then(res => res.json())
                .then(data => {
                    if (data.authorized) {
                        window.authorizedKickUser = data.username;
                        const displayUser = data.displayName || data.username;
                        $('#kickUsername').text(displayUser);
                        $('#kickUserInfo').show();
                        $('#kickAuthButton').hide();
                        $('#kickUnauthButton').show();
                    } else {
                        window.authorizedKickUser = null;
                        $('#kickUsername').text('');
                        $('#kickUserInfo').hide();
                        $('#kickAuthButton').show();
                        $('#kickUnauthButton').hide();
                    }
                })
                .catch(err => console.error('Failed to check Kick auth status', err));
        };
        // Check Kick auth status immediately on script initialization
        window.checkKickAuthStatus();

        window.connection.socket.on('twitchConnected', function(data) {
            console.log('[Twitch] Connected to', data.channelName);
            window.currentTwitchRoomId = data.roomId;
            currentTwitchChannelName = data.channelName;
            $('#stateText').text('Connected to Twitch!');
            $('#twitchConnectButton').val('disconnect');
            $('#twitchPlayerButton').show();
            $('#twitchClipButton').show();
            
            // Check auth status and show button if not authorized
            window.checkTwitchAuthStatus();
            
            twitchChatReady = true;
            
            // Show the chat input container when connected
            $('#chatInputContainer').css('display', 'flex');
            
            // Update live dot to online when connected
            setLiveDot('twitchDot', true);
            
            // Load emotes for the channel
            if (typeof loadEmotes === 'function' && data.roomId && data.roomId !== 'null' && data.roomId !== 'undefined') loadEmotes(data.roomId);
            
            // Fetch badges
            if (data.roomId && data.roomId !== 'null' && data.roomId !== 'undefined') {
                fetchTwitchBadges(data.roomId);
            }
            
            // Start polling for native Twitch pinned message
            if (data.roomId && data.roomId !== 'null' && data.roomId !== 'undefined') {
                if (window.twitchPinnedInterval) clearInterval(window.twitchPinnedInterval);
                window.twitchPinnedInterval = setInterval(() => checkTwitchPinnedMessage(data.roomId), 5000);
                checkTwitchPinnedMessage(data.roomId);
            }
            
            // Start ad tracking
            if (typeof startAdTracker === 'function') startAdTracker();
        });
        
        window.fetchTwitchBadges = function(roomId) {
            if (!roomId || roomId === 'null' || roomId === 'undefined') return;
            if (window.twitchBadgesCache) return; // already loaded or loading
            window.twitchBadgesCache = { loading: true }; // prevent multiple calls
            fetch(`/api/twitch/badges/${roomId}`)
                .then(res => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.json();
                })
                .then(badges => {
                    window.twitchBadgesCache = badges;
                    console.log('[Twitch] Badges loaded:', badges);
                })
                .catch(err => {
                    window.twitchBadgesCache = null;
                    console.warn('[Twitch] Failed to load badges:', err.message);
                });
        };

        window.connection.socket.on('twitchDisconnected', function(reason) {
            console.log('[Twitch] Disconnected:', reason);
            window.twitchBadgesCache = null;
            setLiveDot('twitchDot', false);
            $('#twitchConnectButton').val('connect');
            $('#chatInputContainer').hide();
            $('#twitchClipButton').hide();
            $('#twitchPlayerButton').hide();
            $('#twitchAuthButton').hide();
            if (typeof toggleTwitchPlayer === 'function' && isTwitchPlayerShowing) {
                toggleTwitchPlayer();
            }
            
            // Clean up pinned message UI
            if (window.twitchPinnedInterval) {
                clearInterval(window.twitchPinnedInterval);
                window.twitchPinnedInterval = null;
            }
            currentPinnedMessageId = null;
            locallyHiddenPinnedMessageId = null;
            $('#showPinnedBtn').hide();
            $('#pinnedMessageContainer').hide();
            $('#pinnedMessageContent').empty();
            
            currentTwitchChannelName = null;
            window.currentTwitchRoomId = null;
        });

        window.connection.socket.on('twitchMessageDeleted', function(data) {
            console.log('[Twitch] Message Deleted:', data);
            const isMainChat = $('.chatcontainer').length > 0;
            if (data.messageId) {
                if (isMainChat) {
                    $(`#twitch-msg-${data.messageId} span`).css({'text-decoration': 'line-through', 'opacity': '0.5'});
                } else {
                    $(`#twitch-msg-${data.messageId}`).remove();
                }
                $('.eventcontainer').find(`#twitch-msg-${data.messageId}`).remove();
            }
            if (typeof showNotification === 'function' && isMainChat && data.username) {
                showNotification(`Message deleted from ${data.username}`, 'info');
            }
        });

        window.connection.socket.on('twitchTimeout', function(data) {
            console.log('[Twitch] User Timeout:', data);
            $(`.twitch-username-${data.username.toLowerCase()} span`).css({'text-decoration': 'line-through', 'opacity': '0.5'});
            $('.eventcontainer').find(`.twitch-username-${data.username.toLowerCase()}`).remove();
            if (typeof showNotification === 'function' && $('.chatcontainer').length > 0) showNotification(`${data.username} timed out for ${data.duration}s`, 'warning');
        });

        window.connection.socket.on('twitchBan', function(data) {
            console.log('[Twitch] User Banned:', data);
            $(`.twitch-username-${data.username.toLowerCase()} span`).css({'text-decoration': 'line-through', 'opacity': '0.5'});
            $('.eventcontainer').find(`.twitch-username-${data.username.toLowerCase()}`).remove();
            if (typeof showNotification === 'function' && $('.chatcontainer').length > 0) showNotification(`${data.username} was banned`, 'error');
        });

        window.connection.socket.on('kickMessageDeleted', function(data) {
            console.log('[Kick] Message Deleted:', data);
            const isMainChat = $('.chatcontainer').length > 0;
            if (data.messageId) {
                if (isMainChat) {
                    $(`#kick-msg-${data.messageId} span`).css({'text-decoration': 'line-through', 'opacity': '0.5'});
                } else {
                    $(`#kick-msg-${data.messageId}`).remove();
                }
                $('.eventcontainer').find(`#kick-msg-${data.messageId}`).remove();
            }
            if (typeof showNotification === 'function' && isMainChat && data.username) {
                showNotification(`Kick message deleted from ${data.username}`, 'info');
            }
        });

        window.connection.socket.on('kickTimeout', function(data) {
            console.log('[Kick] User Timeout:', data);
            $(`.kick-user-${(data.username || '').toLowerCase()} span`).css({'text-decoration': 'line-through', 'opacity': '0.5'});
            $('.eventcontainer').find(`.kick-user-${(data.username || '').toLowerCase()}`).remove();
            if (typeof showNotification === 'function' && $('.chatcontainer').length > 0) showNotification(`${data.username} timed out on Kick for ${data.duration}s`, 'warning');
        });

        window.connection.socket.on('kickBan', function(data) {
            console.log('[Kick] User Banned:', data);
            $(`.kick-user-${(data.username || '').toLowerCase()} span`).css({'text-decoration': 'line-through', 'opacity': '0.5'});
            $('.eventcontainer').find(`.kick-user-${(data.username || '').toLowerCase()}`).remove();
            if (typeof showNotification === 'function' && $('.chatcontainer').length > 0) showNotification(`${data.username} was banned on Kick`, 'error');
        });

        window.connection.socket.on('twitchClearChat', function() {
            $('.twitch-message').remove();
            if (typeof showNotification === 'function') showNotification('Chat cleared by moderator', 'info');
        });

        function parseTwitchEmotes(message, emotes) {
            if (!emotes) return sanitize(message);

            let replacements = [];
            
            if (typeof emotes === 'string') {
                const emoteBlocks = emotes.split('/');
                emoteBlocks.forEach(block => {
                    const [id, positions] = block.split(':');
                    if (!positions) return;
                    
                    positions.split(',').forEach(pos => {
                        const [start, end] = pos.split('-');
                        replacements.push({
                            id: id,
                            start: parseInt(start, 10),
                            end: parseInt(end, 10)
                        });
                    });
                });
            } else if (typeof emotes === 'object') {
                // Some libraries parse emotes into an object: { "25": ["0-4", "12-16"] }
                for (const id in emotes) {
                    emotes[id].forEach(pos => {
                        const [start, end] = pos.split('-');
                        replacements.push({
                            id: id,
                            start: parseInt(start, 10),
                            end: parseInt(end, 10)
                        });
                    });
                }
            }

            replacements.sort((a, b) => a.start - b.start);
            
            let parts = [];
            let currentIndex = 0;
            
            for (const rep of replacements) {
                if (rep.start >= currentIndex) {
                    const textBefore = message.substring(currentIndex, rep.start);
                    if (textBefore) parts.push(sanitize(textBefore));
                    
                    const imgUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${rep.id}/default/dark/1.0`;
                    parts.push(`<img src="${imgUrl}" class="emote-img" style="vertical-align: middle; height: 28px;">`);
                    
                    currentIndex = rep.end + 1;
                }
            }
            
            if (currentIndex < message.length) {
                parts.push(sanitize(message.substring(currentIndex)));
            }
            
            return parts.join('');
        }

        function getTwitchBadgeUrl(setId, versionId) {
            if (!window.twitchBadgesCache) return null;
            
            function findVersionInSet(set) {
                if (!set) return null;
                let version = set.versions.find(v => v.id === versionId);
                if (version) return version.image_url_1x;
                
                // Fallback for numeric badges (like subscriber months) where exact version doesn't exist
                if (!isNaN(versionId)) {
                    const reqNum = parseInt(versionId);
                    const numericVersions = set.versions
                        .map(v => ({ idStr: v.id, num: parseInt(v.id) }))
                        .filter(v => !isNaN(v.num))
                        .sort((a, b) => b.num - a.num); // sort descending
                    
                    const closest = numericVersions.find(v => v.num <= reqNum);
                    if (closest) {
                        const fallbackVersion = set.versions.find(v => v.id === closest.idStr);
                        if (fallbackVersion) return fallbackVersion.image_url_1x;
                    }
                }
                return null;
            }
            
            if (window.twitchBadgesCache.channelBadges) {
                const set = window.twitchBadgesCache.channelBadges.find(s => s.set_id === setId);
                const url = findVersionInSet(set);
                if (url) return url;
            }
            
            if (window.twitchBadgesCache.globalBadges) {
                const set = window.twitchBadgesCache.globalBadges.find(s => s.set_id === setId);
                const url = findVersionInSet(set);
                if (url) return url;
            }
            return null;
        }

        window.connection.socket.on('twitchChat', function(data) {
            console.log('[Twitch] Chat received:', data);
            
            let displayName = data.tags && data.tags['display-name'] ? data.tags['display-name'] : data.username;
            const rawUsername = data.username || (data.tags && data.tags.username) || displayName || 'unknown';
            if (isBotMessage(rawUsername) || isBotMessage(displayName)) return;
            
            setLiveDot('twitchDot', true);
            
            if (!window.currentTwitchRoomId && data.tags && data.tags['room-id']) {
                window.currentTwitchRoomId = data.tags['room-id'];
                if (typeof startAdTracker === 'function') startAdTracker();
            }
            
            // In case we missed fetching badges on connect, fetch them now
            if (window.currentTwitchRoomId && !window.twitchBadgesCache) {
                window.fetchTwitchBadges(window.currentTwitchRoomId);
            }
            
            let color = data.tags && data.tags.color ? data.tags.color : '#9146FF';
            // displayName is already declared above
            
            // Enhanced badge representation using fetched images
            let badgeHtml = '';
            if (data.tags && data.tags.badges) {
                for (const [badgeId, version] of Object.entries(data.tags.badges)) {
                    let badgeUrl = getTwitchBadgeUrl(badgeId, version);
                    if (badgeUrl) {
                        badgeHtml += `<img src="${badgeUrl}" class="twitch-badge-icon" style="height:1.2em; vertical-align:middle; margin-right:4px;" title="${badgeId}">`;
                    } else {
                        // Fallbacks if not cached
                        if (badgeId === 'broadcaster') badgeHtml += '🎥 ';
                        else if (badgeId === 'moderator') badgeHtml += '⚔️ ';
                        else if (badgeId === 'subscriber') badgeHtml += '⭐ ';
                        else if (badgeId === 'vip') badgeHtml += '💎 ';
                    }
                }
            }

            let profilePicHtml = '';
            if (data.profilePic) {
                profilePicHtml = `<img src="${data.profilePic}" class="miniprofilepicture" style="border: 2px solid #9146FF !important;">`;
            }

            let safeDisplayName = sanitize(displayName).replace(/'/g, "\\'");
            const parsedMessage = linkify(parseTwitchEmotes(data.message, data.tags.emotes));
            
            // rawUsername is already declared above
            const twitchMessage = `<div class="twitch-message twitch-user-${data.tags['user-id']} twitch-username-${rawUsername.toLowerCase()}" id="twitch-msg-${data.tags.id}">
                <svg class="platform-icon" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;filter:drop-shadow(1px 1px 1px rgba(0,0,0,0.8));" viewBox="0 0 512 512"><path fill="#9146FF" d="M391.2 103.5H352.5v109.7h38.6zM285 103H246.4V212.8H285zM120.8 0 24.3 91.4V420.6H140.1V512l96.5-91.4h77.3L487.7 256V0zM449.1 237.8l-77.2 73-15.1 14.3-30 14.3-58 14.3H236.6l-77.3 73.1v-73.1H91.9V36.6h357.2z"/></svg>
                ${profilePicHtml}
                ${badgeHtml}<b style="color: ${color}; cursor: pointer;" onclick="showTwitchContextMenu(event, '${data.tags['user-id']}', '${data.tags['room-id']}', '${data.tags.id}', '${safeDisplayName}', ${!!(data.tags.badges && data.tags.badges.vip)}, '${(data.tags['badge-info'] && data.tags['badge-info'].subscriber) ? data.tags['badge-info'].subscriber : ''}', '${data.profilePic || ''}')">${sanitize(displayName)}:</b>
                <span>${parsedMessage}</span>
            </div>`;
            
            const isMainChat = $('.chatcontainer').length > 0;
            const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
            const doScroll = isMainChat ? shouldAutoScroll : isChatScrolledToBottom();
            
            container.append(twitchMessage);
            
            // Limit to 100 messages
            const allMessages = container.children('div.kick-message, div.tiktok-message, div.twitch-message, div:not(.containerheader)');
            if (allMessages.length > 100) {
                allMessages.slice(0, allMessages.length - 100).remove();
            }
            
            const chatEl = container[0];
            if (chatEl && doScroll) {
                container.scrollTop(chatEl.scrollHeight);
            }
            if (isMainChat) attachChatScrollHandler(); 
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
    if ($('#connectButton').val() === 'disconnect') {
        window.connection.socket.emit('disconnectTikTok');
        $('#uniqueIdInput').val('');
        $('.tiktok-message').remove();
        $('#connectButton').val('connect');
        $('#stateText').text('Disconnected from TikTok');
        $('#tiktokFilters').hide();
        setLiveDot('tiktokDot', false);
        viewerCount = 0;
        likeCount = 0;
        diamondsCount = 0;
        updateRoomStats();
        return;
    }
    
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
            $('#tiktokFilters').css('display', 'flex');
        });
        
        window.connection.socket.once('tiktokDisconnected', (reason) => {
            clearTimeout(connectionTimeout);
            if (originalDisconnected) originalDisconnected.apply(this, arguments);
            
            // Show user-friendly message for offline users
            if (reason && typeof reason === 'string' && (reason.includes('not live') || reason.includes('offline') || reason.includes('not found'))) {
                $('#stateText').text('User is not currently live. Please try a different username.');
            }
            
            // Auto-reconnect for OBS overlay
            if (window.settings && window.settings.username) {
                setTimeout(() => {
                    connect();
                }, 30000);
            }
        });
        
        // Emit setUniqueId to server via Socket.IO instead of direct connection
        window.connection.socket.emit('setUniqueId', uniqueId, {
            enableExtendedGiftInfo: false
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

// Convert URLs in chat into clickable links
function linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)(?![^<]*>)/gi;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #58a6ff; text-decoration: underline;">${url}</a>`;
    });
}

function updateRoomStats() {
    $('#tiktokStats').html(
        `<span><b>TikTok Viewers:</b> ${viewerCount.toLocaleString()}</span> &nbsp; ` +
        `<span><b>TikTok Likes:</b> ${likeCount.toLocaleString()}</span> &nbsp; ` +
        `<span><b>Earned Diamonds:</b> ${diamondsCount.toLocaleString()}</span>`
    );
}

// State variables for Twitch Player
let twitchPlayer = null;
let isTwitchPlayerShowing = false;
let isKickPlayerShowing = false;
window.currentTwitchRoomId = null;

// Ad Tracking Variables
let adCheckInterval = null;

function startAdTracker() {
    if (adCheckInterval) clearInterval(adCheckInterval);
    
let lastAdState = 'none';

    adCheckInterval = setInterval(async () => {
        if (!window.currentTwitchRoomId || window.currentTwitchRoomId === 'null' || window.currentTwitchRoomId === 'undefined') return;
        
        try {
            const res = await fetch(`/api/twitch/ads?broadcasterId=${window.currentTwitchRoomId}`);
            const data = await res.json();
            
            if (!res.ok || data.error || data.unauthenticated) {
                if (data.error && typeof data.error === 'string' && data.error.includes('must match the user ID')) {
                    // Twitch API constraint: Ad schedule Helix API only permits checking your own channel's ads
                    $('#twitchAdTracker').hide();
                    if (adCheckInterval) {
                        clearInterval(adCheckInterval);
                        adCheckInterval = null;
                    }
                } else if (data.unauthenticated || res.status === 401 || res.status === 403) {
                    $('#twitchAdTracker').css('background', 'rgba(255, 170, 0, 0.2)').css('color', '#ffaa00').show();
                    $('#twitchAdStatus').html('Ads: <a href="#" onclick="authorizeTwitch(); return false;" style="color:#ffaa00; font-weight: bold; text-decoration:underline;">Authorize Twitch</a>');
                    if (adCheckInterval) {
                        clearInterval(adCheckInterval);
                        adCheckInterval = null;
                    }
                } else {
                    $('#twitchAdTracker').hide();
                }
                return;
            }
            
            if (data && data.data && data.data.length > 0) {
                $('#twitchAdTracker').show();
                const adInfo = data.data[0];
                
                const now = Math.floor(Date.now() / 1000);
                const lastAdTime = Math.floor(new Date(adInfo.last_ad_at).getTime() / 1000);
                const nextAdTime = Math.floor(new Date(adInfo.next_ad_at).getTime() / 1000);
                const duration = adInfo.duration;
                
                if (now >= lastAdTime && now < (lastAdTime + duration)) {
                    // Ad is currently playing!
                    const remaining = (lastAdTime + duration) - now;
                    $('#twitchAdStatus').text(`Ads Playing (${remaining}s left)`);
                    $('#twitchAdTracker').css('background', 'rgba(255, 85, 85, 0.4)').css('color', '#ff5555');
                    
                    showTwitchAdBannerPlaying(remaining, duration);
                    lastAdState = 'playing';
                } else if (lastAdState === 'playing') {
                    // Ad just finished!
                    showTwitchAdBannerFinished();
                    lastAdState = 'finished';
                } else {
                    // No ads currently playing
                    if (adInfo.preroll_free_time > 0) {
                        $('#twitchAdStatus').text(`Pre-roll free for ${Math.floor(adInfo.preroll_free_time / 60)}m ${adInfo.preroll_free_time % 60}s`);
                        $('#twitchAdTracker').css('background', 'rgba(0, 255, 0, 0.2)').css('color', '#00ff00');
                    } else {
                        const timeUntilNext = nextAdTime - now;
                        if (timeUntilNext > 0) {
                            $('#twitchAdStatus').text(`Next ad in ${Math.floor(timeUntilNext / 60)}m ${timeUntilNext % 60}s`);
                            $('#twitchAdTracker').css('background', 'rgba(145, 70, 255, 0.2)').css('color', '#e3e5eb');
                        } else {
                            $('#twitchAdStatus').text(`Ad scheduled (Snoozes: ${adInfo.snooze_count})`);
                            $('#twitchAdTracker').css('background', 'rgba(255, 170, 0, 0.2)').css('color', '#ffaa00');
                        }
                    }
                }
            }
        } catch (e) {
            // Silently fail on network issues
        }
    }, 3000); // Check every 3 seconds
}

function showTwitchAdBannerPlaying(remainingSeconds, totalDuration) {
    const banner = $('#twitchAdChatBanner');
    if (!banner.length) return;

    banner.css({
        background: 'linear-gradient(135deg, rgba(255, 85, 85, 0.4), rgba(145, 70, 255, 0.45))',
        borderBottom: '1px solid #ff5555'
    }).slideDown(200);

    $('#adBannerIcon').text('🚨');
    $('#adBannerStatusText').html(`📺 <b>Twitch Commercial Break Active!</b> (${totalDuration}s duration)`);
    $('#adBannerCountdown').text(`${remainingSeconds}s remaining`).css({ color: '#ffaa00', borderColor: '#ffaa00' });
}

function showTwitchAdBannerFinished() {
    const banner = $('#twitchAdChatBanner');
    if (!banner.length) return;

    banner.css({
        background: 'linear-gradient(135deg, rgba(83, 252, 24, 0.3), rgba(27, 185, 84, 0.35))',
        borderBottom: '1px solid #53fc18'
    }).slideDown(200);

    $('#adBannerIcon').text('✅');
    $('#adBannerStatusText').html(`✅ <b>Commercial Break Completed!</b> Stream resumed.`);
    $('#adBannerCountdown').text(`COMPLETED`).css({ color: '#53fc18', borderColor: '#53fc18' });

    showNotification('✅ Twitch Ads finished! Stream resumed.', 'success');

    setTimeout(() => {
        banner.slideUp(400);
    }, 6000);
}

function toggleTwitchPlayer() {
    isTwitchPlayerShowing = !isTwitchPlayerShowing;
    
    if (isTwitchPlayerShowing) {
        $('#twitchPlayerContainer').show();
        $('#twitchPlayerButton').val('Hide Stream');
        $('#twitchPlayerButton').css('background-color', '#555');
        
        if (!twitchPlayer && currentTwitchChannelName) {
            let options = {
                width: "100%",
                height: "100%",
                channel: currentTwitchChannelName,
                parent: [window.location.hostname, "localhost"],
                autoplay: true,
                muted: true
            };
            twitchPlayer = new Twitch.Player("twitchPlayerContainer", options);
        }
    } else {
        $('#twitchPlayerContainer').hide();
        $('#twitchPlayerButton').val('Watch Stream');
        $('#twitchPlayerButton').css('background-color', '#9146FF');
        
        if (twitchPlayer) {
            $('#twitchPlayerContainer').empty();
            twitchPlayer = null;
        }
    }
}

function toggleKickPlayer() {
    isKickPlayerShowing = !isKickPlayerShowing;
    
    if (isKickPlayerShowing) {
        $('#kickPlayerContainer').show();
        $('#kickPlayerButton').val('Hide Stream');
        $('#kickPlayerButton').css('background-color', '#555');
        $('#kickPlayerButton').css('color', 'white');
        
        if (currentKickChannel) {
            $('#kickPlayerContainer').html(`<iframe id="kickPlayerIframe" src="https://player.kick.com/${currentKickChannel}?autoplay=true&muted=true" allow="autoplay; fullscreen" style="border:none; transform-origin: top left;" frameborder="0" scrolling="no" allowfullscreen="true"></iframe>`);
            resizeKickPlayer();
        }
    } else {
        $('#kickPlayerContainer').hide();
        $('#kickPlayerButton').val('Watch Stream');
        $('#kickPlayerButton').css('background-color', '#53fc18');
        $('#kickPlayerButton').css('color', 'black');
        
        $('#kickPlayerContainer').empty();
    }
}

function resizeKickPlayer() {
    if (!isKickPlayerShowing) return;
    
    const container = $('#kickPlayerContainer');
    const iframe = $('#kickPlayerIframe');
    
    if (iframe.length > 0) {
        const containerWidth = container.width();
        
        // If the container is smaller than 800px (e.g. mobile or OBS dock), 
        // the Kick player hides its volume button and controls.
        // We force it to think it has 800px width, and then scale it down!
        if (containerWidth > 0 && containerWidth < 800) {
            const scale = containerWidth / 800;
            iframe.css({
                'width': '800px',
                'height': '450px',
                'transform': `scale(${scale})`
            });
        } else {
            iframe.css({
                'width': '100%',
                'height': '100%',
                'transform': 'none'
            });
        }
    }
}

$(window).on('resize', resizeKickPlayer);

function generateUsernameLink(data) {
    return `<a class="usernamelink" href="https://www.tiktok.com/@${data.uniqueId}" target="_blank">${data.uniqueId}</a>`;
}

function toggleTiktokFilters() {
    const showLikes = $('#filterTiktokLikes').is(':checked');
    const showFollows = $('#filterTiktokFollows').is(':checked');
    const showJoins = $('#filterTiktokJoins').is(':checked');
    
    if (showLikes) {
        $('body').removeClass('hide-tiktok-likes');
    } else {
        $('body').addClass('hide-tiktok-likes');
    }
    
    if (showFollows) {
        $('body').removeClass('hide-tiktok-follows');
    } else {
        $('body').addClass('hide-tiktok-follows');
    }
    
    if (showJoins) {
        $('body').removeClass('hide-tiktok-joins');
    } else {
        $('body').addClass('hide-tiktok-joins');
    }
}

function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Generate an HSL color with consistent saturation and lightness for dark/light backgrounds
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 70%, 65%)`;
}

function isPendingStreak(data) {
    return data.giftType === 1 && !data.repeatEnd;
}

/**
 * Add a new message to the chat container
 */
function handleEventLive(typeEvent, data) {

    if ([ENUM_TYPE_ACTION.SHARE_FOLLOW, ENUM_TYPE_ACTION.GIFT, ENUM_TYPE_ACTION.LIKE].includes(typeEvent)) {
        if (data.msgId) {
            let existingEvent = processedLikeEvents.find(c => c === data.msgId);
            if (existingEvent) return;
            processedLikeEvents.push(data.msgId);
            if (processedLikeEvents.length > 500) processedLikeEvents.shift();
        }

        const isMainChat = $('.chatcontainer').length > 0;
        const container = isMainChat ? $('.chatcontainer') : $('.eventcontainer');
        const doScroll = isMainChat ? shouldAutoScroll : isChatScrolledToBottom();

        if (typeEvent === ENUM_TYPE_ACTION.GIFT) {
            let dc = parseInt(data.diamondCount, 10);
            if (!isNaN(dc) && dc > 0) {
                container.append(
                    `<div class="tiktok-message gift-msg">
                        <svg class="platform-icon" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;filter:drop-shadow(1px 1px 1px rgba(0,0,0,0.8));" viewBox="0 0 448 512"><path fill="#FFFFFF" d="M448 209.9a210.1 210.1 0 0 1-122.8-39.3V349.4A162.6 162.6 0 1 1 185 188.3V278.2a74.6 74.6 0 1 0 52.2 71.2V0l88 0a121.2 121.2 0 0 0 1.9 22.2h0A122.2 122.2 0 0 0 381 102.4a121.4 121.4 0 0 0 67 20.1z"/></svg>
                        <img class="miniprofilepicture" src="${data.profilePictureUrl || ''}">
                        <b style="color: ${stringToColor(data.uniqueId)}">${data.nickname || data.uniqueId}:</b> <span>💎 [GIFT] sent ${dc} diamonds</span>
                    </div>`
                );
                const chatEl = container[0];
                if (chatEl && doScroll) {
                    container.scrollTop(chatEl.scrollHeight);
                }
            }
        } else if (typeEvent === ENUM_TYPE_ACTION.LIKE) {
            container.append(
                `<div class="tiktok-message like-msg">
                        <svg class="platform-icon" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;filter:drop-shadow(1px 1px 1px rgba(0,0,0,0.8));" viewBox="0 0 448 512"><path fill="#FFFFFF" d="M448 209.9a210.1 210.1 0 0 1-122.8-39.3V349.4A162.6 162.6 0 1 1 185 188.3V278.2a74.6 74.6 0 1 0 52.2 71.2V0l88 0a121.2 121.2 0 0 0 1.9 22.2h0A122.2 122.2 0 0 0 381 102.4a121.4 121.4 0 0 0 67 20.1z"/></svg>
                        <img class="miniprofilepicture" src="${data.profilePictureUrl || ''}">
                        <b style="color: ${stringToColor(data.uniqueId)}">${data.nickname || data.uniqueId}:</b> <span style="color: red;">❤️ liked the stream</span>
                </div>`
            );
            const chatEl = container[0];
            if (chatEl && doScroll) {
                container.scrollTop(chatEl.scrollHeight);
            }
        } else {
            container.append(
                `<div class="tiktok-message follow-msg">
                        <svg class="platform-icon" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;filter:drop-shadow(1px 1px 1px rgba(0,0,0,0.8));" viewBox="0 0 448 512"><path fill="#FFFFFF" d="M448 209.9a210.1 210.1 0 0 1-122.8-39.3V349.4A162.6 162.6 0 1 1 185 188.3V278.2a74.6 74.6 0 1 0 52.2 71.2V0l88 0a121.2 121.2 0 0 0 1.9 22.2h0A122.2 122.2 0 0 0 381 102.4a121.4 121.4 0 0 0 67 20.1z"/></svg>
                        <img class="miniprofilepicture" src="${data.profilePictureUrl || ''}">
                        <b style="color: ${stringToColor(data.uniqueId)}">${data.nickname || data.uniqueId}:</b> <span>🤝 shared or followed</span>
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
// })

// KICK CHAT FRONTEND LOGIC
$(document).ready(function() {
    $('#kickConnectButton').on('click', function() {
        if ($('#kickConnectButton').val() === 'disconnect') {
            window.connection.socket.emit('disconnectKick');
            $('#kickLinkInput').val('');
            $('.kick-message').remove();
            $('#kickConnectButton').val('connect');
            currentKickChannel = null;
            kickChatReady = false;
            $('#stateText').text('Disconnected from Kick');
            setLiveDot('kickDot', false);
            window.currentKickStreamData = null;
            window.currentKickStatsData = null;
            if (typeof durationInterval !== 'undefined' && durationInterval) {
                clearInterval(durationInterval);
                durationInterval = null;
            }
            if (typeof streamStartTime !== 'undefined') {
                streamStartTime = null;
            }
            $('#kickStats').empty();
            return;
        }
        
        let kickInput = $('#kickLinkInput').val().trim();
        // If user pasted a full link, extract the username
        const match = kickInput.match(/kick\.com\/([A-Za-z0-9_]+)/i);
        if (match) {
            kickInput = match[1];
        }
        
        kickInput = kickInput.toLowerCase();

        // Validate username
        if (!/^[a-z0-9_]{2,24}$/.test(kickInput)) {
            alert('Please enter a valid Kick channel name (2-24 letters, numbers, or underscores).');
            return;
        }
        // Track the current channel for filtering
        currentKickChannel = kickInput;
        kickChatReady = false;
        $('#stateText').text('Connecting to Kick...');
        
        // Try to fetch chatroom ID from frontend to bypass backend Cloudflare blocks
        fetch(`https://kick.com/api/v1/channels/${kickInput}`)
            .then(r => r.json())
            .then(data => {
                if (data.error) {
                    $('#stateText').text(`Kick Error: ${data.error} (Cloudflare block or invalid channel). Trying backend...`);
                    window.connection.socket.emit('setKickLink', kickInput, null);
                    return;
                }
                const chatroomId = data.chatroom?.id || data.chatroom_id || data.id;
                if (!chatroomId) {
                    $('#stateText').text(`Kick Error: Could not find chatroom ID for ${kickInput}. Trying backend...`);
                    window.connection.socket.emit('setKickLink', kickInput, null);
                    return;
                }
                window.connection.socket.emit('setKickLink', kickInput, chatroomId);
            })
            .catch(err => {
                console.log('Frontend fetch failed', err);
                $('#stateText').text(`Kick Connection Failed: Network/CORS error fetching channel data. Trying backend fallback...`);
                // IMPORTANT: Emit without chatroomId so backend can fallback
                window.connection.socket.emit('setKickLink', kickInput, null);
            });
        
        // Refresh bolbal emotes when connecting to Kick
        fetchKickBolbalEmotes();

        // --- Auto-fetch Kick stats on connect and start auto-refresh ---
        function fetchKickStatsForConnected() {
            return; // Disabled kick stats per user request (code preserved below)
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
        console.log('[Kick] Connected to', data.channelSlug);
        $('#stateText').text('Connected to Kick!');
        $('#kickConnectButton').val('disconnect');
        $('#kickPlayerButton').show();
        kickChatReady = true;
        attachChatScrollHandler(); // Re-attach scroll handler after clearing chat
        
        // Update live dot to online when connected
        setLiveDot('kickDot', true);
        
        // Initialize duration display to ensure it's always shown
        window.currentStreamDuration = 'Not live';
        
        // Fetch channel custom sub badges when connected to Kick
        fetchKickSubBadges(data.channelSlug);
        
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
        
        const msgId = msg.id || Date.now();
        const avatarId = `kick-avatar-chat-${msg.sender?.username}-${msgId}`;
        const kickMessage = `<div class="kick-message kick-user-${(msg.sender?.username || '').toLowerCase()}" id="kick-msg-${msgId}">
            <svg class="platform-icon" style="width:16px;height:16px;vertical-align:middle;margin-right:4px;filter:drop-shadow(1px 1px 1px rgba(0,0,0,0.8));" viewBox="0 0 256 256"><path fill="#53fc18" d="M56 32h48v56h48V32h48v56h-48v56h48v80h-48v-56h-48v56H56V32z"/></svg>
            <img id="${avatarId}" class="miniprofilepicture kick-avatar-img" src="${profilePic}" onerror="this.onerror=null;this.src='kick-logo.png';" data-username="${msg.sender?.username}">
            ${badgeHtml}
            <b style="color:${msg.sender?.color || getRandomColor(msg.sender?.username || '')} !important; cursor: pointer;" onclick="showKickContextMenu(event, '${msg.sender?.id || ''}', '${msgId}', '${sanitize(msg.sender?.username || '')}', '${profilePic}')">${sanitize(msg.sender?.username || '')}:</b>
            <span>${messageHtml}</span>
        </div>`;
        
        container.append(kickMessage);
        
        // Backend now prefetches avatar, so no need for client-side pop-in fetch
        
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
        
        const eventId = Date.now();
        const avatarId = `kick-avatar-gift-${gift.sender?.username}-${eventId}`;
        const giftMessage = `<div class="kick-gift">
                <img id="${avatarId}" class="miniprofilepicture kick-avatar-img" src="${profilePic}" onerror="this.onerror=null;this.src='kick-logo.png';">
            <span class="gift-icon">🎁</span>
            <b style="color:${gift.sender?.color || getRandomColor(gift.sender?.username || '')} !important">${gift.sender?.username}</b>
            <span>sent ${gift.gift.count}x ${gift.gift.name}</span>
        </div>`;
        
        container.append(giftMessage);

        if (profilePic === 'https://kick.com/img/kick-logo.svg' && gift.sender?.username) {
            fetch(`/api/kick-avatar/${gift.sender.username}`)
                .then(res => res.json())
                .then(data => {
                    if (data.url && data.url !== 'https://kick.com/img/kick-logo.svg') {
                        $(`#${avatarId}`).attr('src', data.url);
                    }
                }).catch(() => {});
        }
        
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
        
        const eventId = Date.now();
        const avatarId = `kick-avatar-sub-${sub.sender?.username}-${eventId}`;
        const subMessage = `<div class="kick-subscription">
            <img id="${avatarId}" class="miniprofilepicture kick-avatar-img" src="${profilePic}" onerror="this.onerror=null;this.src='kick-logo.png';">
            <span class="sub-icon">💜</span>
            <b style="color:${sub.sender?.color || getRandomColor(sub.sender?.username || '')} !important">${sub.sender?.username}</b>
            <span>subscribed for ${sub.subscription.months} month${sub.subscription.months > 1 ? 's' : ''}</span>
            ${sub.subscription.message ? `<span class="sub-message">"${sub.subscription.message}"</span>` : ''}
        </div>`;
        
        container.append(subMessage);

        if (profilePic === 'https://kick.com/img/kick-logo.svg' && sub.sender?.username) {
            fetch(`/api/kick-avatar/${sub.sender.username}`)
                .then(res => res.json())
                .then(data => {
                    if (data.url && data.url !== 'https://kick.com/img/kick-logo.svg') {
                        $(`#${avatarId}`).attr('src', data.url);
                    }
                }).catch(() => {});
        }
        
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
        
        const eventId = Date.now();
        const avatarId = `kick-avatar-follow-${follow.sender?.username}-${eventId}`;
        const followMessage = `<div class="kick-follow">
            <img id="${avatarId}" class="miniprofilepicture kick-avatar-img" src="${profilePic}" onerror="this.onerror=null;this.src='kick-logo.png';">
            <span class="follow-icon">👋</span>
            <b style="color:${follow.sender?.color || getRandomColor(follow.sender?.username || '')} !important">${follow.sender?.username}</b>
            <span>followed the channel</span>
        </div>`;
        
        container.append(followMessage);

        if (profilePic === 'https://kick.com/img/kick-logo.svg' && follow.sender?.username) {
            fetch(`/api/kick-avatar/${follow.sender.username}`)
                .then(res => res.json())
                .then(data => {
                    if (data.url && data.url !== 'https://kick.com/img/kick-logo.svg') {
                        $(`#${avatarId}`).attr('src', data.url);
                    }
                }).catch(() => {});
        }
        
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
        $('#stateText').text(reason || 'Disconnected from Kick');
        setLiveDot('kickDot', false);
        kickChatReady = false;
        $('#kickConnectButton').val('connect');
        $('#kickPlayerButton').hide();
        if (typeof toggleKickPlayer === 'function' && isKickPlayerShowing) {
            toggleKickPlayer();
        }
        currentKickChannel = null;
    });

    window.connection.socket.on('updateKickAvatar', function(data) {
        if (data && data.username && data.url) {
            $(`.kick-avatar-img[data-username="${data.username}"]`).attr('src', data.url);
        }
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
    
    // Parse Kick's native emote format: [emote:1234:name]
    rendered = rendered.replace(/\[emote:(\d+):([^\]]+)\]/gi, (match, id, name) => {
        return `<img src="https://files.kick.com/emotes/${id}/fullsize" alt="${name}" class="kick-emote" title="${name}" style="height:1.5em;vertical-align:middle;">`;
    });

    // Then, replace bolbal emotes from the global cache
    const sortedEmoteCodes = Object.keys(kickBolbalEmotes).sort((a, b) => b.length - a.length);
    sortedEmoteCodes.forEach(code => {
        const emoteTag = `<img src="${kickBolbalEmotes[code]}" alt="${code}" class="kick-emote" title="${code}" style="height:1.5em;vertical-align:middle;">`;
        const regex = new RegExp(`(?![^<]*>)\\b${sanitize(code)}\\b`, 'gi');
        rendered = rendered.replace(regex, emoteTag);
    });
    
    return linkify(rendered);
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
        container.scrollTop(container[0].scrollHeight + 500);
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

// === TWITCH MODERATION CONTEXT MENU ===
let currentTwitchContextMenuData = null;

function showTwitchContextMenu(event, userId, roomId, messageId, username, isVip = false, subMonths = '', profilePic = '') {
    event.preventDefault();
    event.stopPropagation();
    
    currentTwitchContextMenuData = { userId, roomId, messageId, username };
    
    const menu = $('#twitchContextMenu');
    $('#contextMenuUsername').text(username);
    $('#contextMenuAvatar').attr('src', profilePic || 'https://static-cdn.jtvnw.net/user-default-pictures-uv/dbdc9198-def8-11e9-8681-784f43822e80-profile_image-300x300.png');
    
    $('#contextMenuFollowDate').text('🤍 Loading...');
    if (subMonths) {
        $('#contextMenuSubStatus').text(`⭐ Subbed for ${subMonths} Months`).show();
    } else {
        $('#contextMenuSubStatus').hide();
    }
    
    // Cache user info to prevent loading delays on subsequent clicks
    window.twitchUserInfoCache = window.twitchUserInfoCache || {};
    const cacheKey = `${roomId}_${userId}`;
    
    function applyUserInfo(data) {
        if (data.profilePic && !profilePic) {
            $('#contextMenuAvatar').attr('src', data.profilePic);
        }
        if (data.followDate) {
            const date = new Date(data.followDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            $('#contextMenuFollowDate').text(`🤍 Following Since ${date}`);
        } else {
            $('#contextMenuFollowDate').text('🤍 Not Following');
        }
    }

    if (window.twitchUserInfoCache[cacheKey]) {
        applyUserInfo(window.twitchUserInfoCache[cacheKey]);
    } else {
        fetch(`/api/twitch/userinfo?broadcasterId=${roomId}&userId=${userId}&broadcasterLogin=${currentTwitchChannelName}&userLogin=${username}`)
            .then(res => res.json())
            .then(data => {
                window.twitchUserInfoCache[cacheKey] = data;
                // Only apply if the menu is still open for the same user
                if (currentTwitchContextMenuData && currentTwitchContextMenuData.userId === userId) {
                    applyUserInfo(data);
                }
            })
            .catch(err => {
                $('#contextMenuFollowDate').text('🤍 Follow Date Unavailable');
            });
    }
    
    $('#vipContextMenuItem').text(isVip ? 'Remove VIP' : 'Give VIP');
    $('#vipContextMenuItem').attr('onclick', isVip ? "moderateTwitch('unvip')" : "moderateTwitch('vip')");
    
    menu.css({
        top: event.pageY + 'px',
        left: event.pageX + 'px',
        display: 'block'
    });
    
    // Only show moderation options if the user is connected to their own authorized channel
    if (window.authorizedTwitchUser && typeof currentTwitchChannelName === 'string' && window.authorizedTwitchUser.toLowerCase() === currentTwitchChannelName.toLowerCase()) {
        $('.mod-only-item').show();
    } else {
        $('.mod-only-item').hide();
    }
}

function moderateTwitch(action, duration = null) {
    if (!currentTwitchContextMenuData) return;
    
    const { userId, roomId, messageId, username } = currentTwitchContextMenuData;
    
    let finalDuration = duration;
    if (duration === 'custom') {
        const val = parseInt($('#customTimeoutDuration').val());
        const unit = parseInt($('#customTimeoutUnit').val());
        if (isNaN(val) || val <= 0) {
            showNotification('Please enter a valid timeout duration.', 'error');
            return;
        }
        finalDuration = val * unit;
    }
    
    let reason = '';
    if (action === 'ban' || action === 'timeout') {
        reason = prompt(`Enter reason for ${action}ing ${username} (optional):`);
        if (reason === null) return; // Cancelled
        reason = reason.trim();
    }
    
    $('#twitchContextMenu').hide();
    $('#customTimeoutDuration').val(''); // Clear custom timeout
    
    fetch('/api/twitch/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: action,
            targetUserId: userId,
            broadcasterId: roomId,
            messageId: messageId,
            duration: finalDuration,
            reason: reason
        })
    }).then(res => res.json())
      .then(data => {
          if (data.error) {
              if (data.needsReauth || (typeof data.error === 'string' && data.error.includes('Missing scope'))) {
                  showNotification('🔑 Twitch Re-authorization Required! Click "Logout Twitch ❌" then "Authorize Twitch 🔑" to enable VIP & Moderation.', 'warning');
              } else {
                  showNotification('Moderation Error: ' + data.error, 'error');
              }
          } else {
              showNotification('Moderation action successful: ' + action, 'success');
              if (action === 'delete' && messageId) {
                  $(`#twitch-msg-${messageId} span`).css({'text-decoration': 'line-through', 'opacity': '0.5'});
                  $('.eventcontainer').find(`#twitch-msg-${messageId}`).remove();
              } else if (action === 'timeout' || action === 'ban') {
                  $(`.twitch-user-${userId} span`).css({'text-decoration': 'line-through', 'opacity': '0.5'});
                  $('.eventcontainer').find(`.twitch-user-${userId}`).remove();
              }
          }
      })
      .catch(err => showNotification('Failed to moderate: ' + err.message, 'error'));
}

// Hide context menu when clicking outside
$(document).click(function() {
    $('#twitchContextMenu').hide();
});

function pinCurrentMessage() {
    if (!currentTwitchContextMenuData) return;
    const { roomId, messageId } = currentTwitchContextMenuData;
    
    // Call our backend to natively pin the message on Twitch
    fetch('/api/twitch/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            broadcasterId: roomId,
            messageId: messageId,
            action: 'pin'
        })
    }).then(res => res.json())
      .then(data => {
          if (data.error) showNotification('Failed to pin: ' + data.error, 'error');
          else showNotification('Message pinned successfully!', 'success');
      })
      .catch(err => showNotification('Error pinning: ' + err.message, 'error'));
      
    $('#twitchContextMenu').hide();
}

function unpinMessage() {
    if (!window.currentTwitchRoomId || !currentPinnedMessageId) return;
    
    // Call our backend to natively unpin the message on Twitch
    fetch('/api/twitch/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            broadcasterId: window.currentTwitchRoomId,
            messageId: currentPinnedMessageId,
            action: 'unpin'
        })
    }).then(res => res.json())
      .then(data => {
          if (data.error) showNotification('Failed to unpin: ' + data.error, 'error');
          else {
              hidePinnedMessage(true); // pass true to indicate it was completely unpinned
          }
      })
      .catch(err => showNotification('Error unpinning: ' + err.message, 'error'));
}

let locallyHiddenPinnedMessageId = null;

function hidePinnedMessage(fullyUnpinned = false) {
    if (!fullyUnpinned) {
        locallyHiddenPinnedMessageId = currentPinnedMessageId;
        $('#showPinnedBtn').fadeIn(200);
    } else {
        locallyHiddenPinnedMessageId = null;
        $('#showPinnedBtn').fadeOut(200);
    }
    
    $('#pinnedMessageContent').css('opacity', '0');
    setTimeout(() => {
        $('#pinnedMessageContainer').slideUp(300, function() {
            if (fullyUnpinned) $('#pinnedMessageContent').empty();
        });
    }, 150);
}

function showPinnedMessage() {
    locallyHiddenPinnedMessageId = null;
    $('#showPinnedBtn').fadeOut(200);
    $('#pinnedMessageContainer').slideDown(300, function() {
        $('#pinnedMessageContent').css('opacity', '1');
    });
}

// Polling for natively pinned messages
let currentPinnedMessageId = null;

function checkTwitchPinnedMessage(roomId) {
    if (!roomId || roomId === 'null' || roomId === 'undefined') return;
    fetch(`/api/twitch/pins/${roomId}`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data && data.data && data.data.length > 0) {
                const pin = data.data[0];
                if (pin.message_id !== currentPinnedMessageId) {
                    currentPinnedMessageId = pin.message_id;
                    locallyHiddenPinnedMessageId = null; // New pin! Automatically unhide
                    $('#showPinnedBtn').hide();
                    renderNativePinnedMessage(pin);
                } else if (locallyHiddenPinnedMessageId === currentPinnedMessageId) {
                    // It's still the same pin, but the user hid it locally. Keep it hidden.
                    if (!$('#showPinnedBtn').is(':visible')) {
                        $('#showPinnedBtn').show();
                    }
                }
            } else {
                if (currentPinnedMessageId !== null) {
                    currentPinnedMessageId = null;
                    hidePinnedMessage(true);
                }
            }
        })
        .catch(err => {
            // Silently fail on network/connection issues
        });
}

function sanitize(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderNativePinnedMessage(pin) {
    const text = sanitize(pin.message?.text || '');
    const pinner = sanitize(pin.pinned_by?.user_name || 'Moderator');
    const sender = sanitize(pin.message?.user_name || pinner); // Sometime message sender isn't returned clearly, fallback to pinner or format properly if available
    
    // HTML mimicking native twitch layout
    const html = `
        <div style="font-size: 13px; margin-bottom: 2px;">
            <svg width="14" height="14" viewBox="0 0 24 24" style="fill: #e3e5eb; vertical-align: middle; margin-right: 2px;">
                <path fill-rule="evenodd" d="M18 4V2H6v2h2v5a3 3 0 0 0-3 3v4h14v-4a3 3 0 0 0-3-3V4h2Zm-1 10H7v-2a1 1 0 0 1 1-1h2V4h4v7h2a1 1 0 0 1 1 1v2Z" clip-rule="evenodd"></path><path d="M13 18h-2v4h2v-4Z"></path>
            </svg>
            <span style="color: #aaa;">Pinned by </span>
            <img src="https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/1" style="height:12px;vertical-align:middle;margin:0 2px;">
            <span style="color: #e3e5eb;">${pinner}</span>
        </div>
        <div style="font-size: 14px; font-weight: bold; margin: 4px 0;">
            ${text}
        </div>
    `;
    
    $('#pinnedMessageContent').css('opacity', '1').html(html);
    if (!$('#pinnedMessageContainer').is(':visible')) {
        $('#pinnedMessageContainer').slideDown(200);
    }
}

function createTwitchClip() {
    if (!currentTwitchChannelName) {
        alert("Twitch channel name not available. Make sure you are connected to Twitch.");
        return;
    }
    
    $('#twitchClipButton').prop('disabled', true).val('Clipping... ⏳');
    
    // Open the window synchronously to bypass browser popup blockers!
    const clipWindow = window.open('', '_blank');
    clipWindow.document.write('<body style="background:#1a1a1a;color:white;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;"><h2 id="clip-status">Creating your clip with Twitch...</h2><div id="clip-link"></div></body>');
    
    fetch('/api/twitch/clip/' + encodeURIComponent(currentTwitchChannelName), {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        $('#twitchClipButton').prop('disabled', false).val('Clip Stream 🎬');
        if (data.error || data.message) {
            clipWindow.document.getElementById('clip-status').innerText = 'Failed to create clip: ' + (data.message || data.error);
            clipWindow.document.getElementById('clip-status').style.color = '#ff5555';
        } else if (data.edit_url) {
            clipWindow.document.getElementById('clip-status').innerText = 'Clip Created Successfully!';
            clipWindow.document.getElementById('clip-status').style.color = '#55ff55';
            clipWindow.document.getElementById('clip-link').innerHTML = `<br><a href="${data.edit_url}" style="color:#bf94ff;font-size:24px;text-decoration:none;border:2px solid #bf94ff;padding:12px 24px;border-radius:8px;font-weight:bold;">Click here to edit your clip 🎬</a>`;
        }
    })
    .catch(err => {
        $('#twitchClipButton').prop('disabled', false).val('Clip Stream 🎬');
        clipWindow.close();
        alert('Error creating clip: ' + err.message);
    });
}

// === TWITCH CHAT SEND & REPLY ===
let replyParentMessageId = null;

function prepareReply() {
    if (!currentTwitchContextMenuData) return;
    
    replyParentMessageId = currentTwitchContextMenuData.messageId;
    $('#replyUsername').text('@' + currentTwitchContextMenuData.username);
    $('#replyIndicator').show();
    $('#twitchContextMenu').hide();
    
    // Show chat input container and focus
    $('#chatInputContainer').css('display', 'flex');
    $('#chatInput').focus();
}

function cancelReply() {
    replyParentMessageId = null;
    $('#replyIndicator').hide();
    $('#chatInput').focus();
}

function handleChatInputKeyPress(e) {
    if (e.key === 'Enter') {
        sendTwitchChat();
    }
}

function sendTwitchChat() {
    const input = $('#chatInput');
    const msg = input.val().trim();
    if (!msg) return;
    
    // Disable input while sending
    input.prop('disabled', true);
    $('#sendChatBtn').prop('disabled', true);
    
    // Handle chat commands
    if (msg.toLowerCase() === '/clear') {
        fetch('/api/twitch/moderate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'clear',
                broadcasterId: window.currentTwitchRoomId
            })
        }).then(res => res.json())
          .then(data => {
              input.prop('disabled', false).val('');
              $('#sendChatBtn').prop('disabled', false);
              $('#chatInput').focus();
              if (data.error) showNotification(`Error: ${data.error}`, 'error');
              else showNotification('Chat cleared', 'success');
          })
          .catch(err => {
              input.prop('disabled', false);
              $('#sendChatBtn').prop('disabled', false);
              showNotification(`Failed: ${err.message}`, 'error');
          });
        return;
    }
    
    fetch('/api/twitch/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            broadcasterId: (currentTwitchContextMenuData && replyParentMessageId) ? currentTwitchContextMenuData.roomId : window.currentTwitchRoomId,
            message: msg,
            replyMessageId: replyParentMessageId
        })
    }).then(res => res.json())
      .then(data => {
          if (data.error) {
              alert('Chat Error: ' + data.error);
          } else {
              input.val('');
              cancelReply();
          }
      })
      .catch(err => alert('Failed to send chat: ' + err.message))
      .finally(() => {
          input.prop('disabled', false);
          $('#sendChatBtn').prop('disabled', false);
          input.focus();
      });
}

// === CHAT HOVER PAUSE ===
let isChatHovered = false;

$(document).ready(() => {
    // Chat input container is hidden by default and shown when Twitch connects

    $('.chatcontainer').on('mouseenter', function() {
        isChatHovered = true;
        shouldAutoScroll = false;
        
        // Show paused indicator if not at bottom
        if (this.scrollHeight - this.scrollTop - this.clientHeight > SCROLL_MARGIN) {
            let indicator = $('.chat-paused-indicator');
            if (indicator.length === 0) {
                indicator = $('<div class="chat-paused-indicator">Chat Paused</div>');
                $(this).parent().append(indicator);
            }
            indicator.fadeIn(200);
        }
    }).on('mouseleave', function() {
        isChatHovered = false;
        $('.chat-paused-indicator').fadeOut(200);
        
        // Only resume auto scroll if we didn't manually scroll way up
        if (this.scrollHeight - this.scrollTop - this.clientHeight < SCROLL_MARGIN * 2) {
            shouldAutoScroll = true;
            this.scrollTop = this.scrollHeight;
        }
    });
});

// === EMOTE PICKER LOGIC ===
let emotesLoaded = false;

function toggleEmotePicker() {
    const picker = $('#emotePicker');
    if (picker.is(':visible')) {
        picker.hide();
    } else {
        picker.show();
        if (!emotesLoaded && window.currentTwitchRoomId && window.currentTwitchRoomId !== 'null' && window.currentTwitchRoomId !== 'undefined') {
            loadEmotes(window.currentTwitchRoomId);
        }
    }
}

function loadEmotes(broadcasterId) {
    if (!broadcasterId || broadcasterId === 'null' || broadcasterId === 'undefined') {
        $('#channelEmotesGrid').html('<div style="color: #aaa; font-size: 12px;">No channel connected.</div>');
        $('#globalEmotesGrid').html('<div style="color: #aaa; font-size: 12px;">No channel connected.</div>');
        return;
    }
    $('#channelEmotesGrid').html('<div style="color: #aaa; font-size: 12px;">Loading...</div>');
    $('#globalEmotesGrid').html('<div style="color: #aaa; font-size: 12px;">Loading...</div>');
    
    fetch(`/api/twitch/emotes/${broadcasterId}`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then(data => {
            if (data.error && (!data.channelEmotes && !data.globalEmotes)) throw new Error(data.error);
            renderEmoteGrid('#channelEmotesGrid', data.channelEmotes || []);
            renderEmoteGrid('#globalEmotesGrid', data.globalEmotes || []);
            emotesLoaded = true;
        })
        .catch(err => {
            $('#channelEmotesGrid').html(`<div style="color: #ff5555; font-size: 12px;">Failed to load emotes: ${err.message}</div>`);
            $('#globalEmotesGrid').html('');
        });
}

function renderEmoteGrid(containerSelector, emotesArray) {
    const container = $(containerSelector);
    container.empty();
    
    if (!emotesArray || emotesArray.length === 0) {
        container.html('<div style="color: #aaa; font-size: 12px;">No emotes found.</div>');
        return;
    }
    
    emotesArray.forEach(emote => {
        let imgUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/default/dark/1.0`;
        const img = $(`<img class="emote-img" src="${imgUrl}" title="${emote.name}" alt="${emote.name}">`);
        img.click(() => insertEmote(emote.name));
        container.append(img);
    });
}

function insertEmote(emoteName) {
    const input = $('#chatInput');
    const currentVal = input.val();
    const cursorPosition = input.prop('selectionStart') || currentVal.length;
    
    const textBefore = currentVal.substring(0, cursorPosition);
    const textAfter = currentVal.substring(cursorPosition, currentVal.length);
    const spaceBefore = (textBefore.length === 0 || textBefore.endsWith(' ')) ? '' : ' ';
    const spaceAfter = (textAfter.length === 0 || textAfter.startsWith(' ')) ? '' : ' ';
    
    const newVal = textBefore + spaceBefore + emoteName + spaceAfter + textAfter;
    input.val(newVal);
    
    const newCursorPos = cursorPosition + spaceBefore.length + emoteName.length + spaceAfter.length;
    input.focus();
    input[0].setSelectionRange(newCursorPos, newCursorPos);
}

// Hide emote picker if clicked outside
$(document).click(function(event) {
    if (!$(event.target).closest('#emotePicker, #toggleEmotePickerBtn').length) {
        if ($('#emotePicker').is(':visible')) {
            $('#emotePicker').hide();
        }
    }
});

const recentNotificationSet = new Set();

function showNotification(message, type = 'info') {
    if (window.location.pathname.includes('obs.html') || window.location.pathname.includes('poll.html')) return;
    
    // Prevent duplicate toasts within 2 seconds
    const notifKey = `${type}:${message}`;
    if (recentNotificationSet.has(notifKey)) return;
    recentNotificationSet.add(notifKey);
    setTimeout(() => recentNotificationSet.delete(notifKey), 2000);
    
    let color = '#ffffff';
    let borderColor = '#58a6ff';
    let icon = 'ℹ️';
    
    if (type === 'success') { color = '#53fc18'; borderColor = '#53fc18'; icon = '✅'; }
    if (type === 'error') { color = '#ff5555'; borderColor = '#ff5555'; icon = '⚠️'; }
    if (type === 'warning') { color = '#ffaa00'; borderColor = '#ffaa00'; icon = '🔔'; }

    let container = $('#toastNotificationContainer');
    if (!container.length) {
        container = $('<div id="toastNotificationContainer" style="position: fixed; bottom: 85px; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column-reverse; gap: 8px; align-items: center; z-index: 10000; pointer-events: none; width: max-content; max-width: 90vw;"></div>');
        $('body').append(container);
    }
    
    const notification = $(`
        <div style="background: rgba(26, 28, 46, 0.95); backdrop-filter: blur(10px); color: #ffffff; border: 1px solid ${borderColor}; padding: 10px 18px; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.6); font-size: 13px; font-weight: bold; opacity: 0; transform: translateY(15px) scale(0.95); transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); display: flex; align-items: center; gap: 8px; pointer-events: auto; max-width: 100%; word-break: break-word;">
            <span style="font-size: 1.1em;">${icon}</span>
            <span style="color: ${color};">${message}</span>
        </div>
    `);
    
    container.append(notification);
    
    setTimeout(() => {
        notification.css('opacity', '1').css('transform', 'translateY(0) scale(1)');
    }, 10);
    
    setTimeout(() => {
        notification.css('opacity', '0').css('transform', 'translateY(-10px) scale(0.95)');
        setTimeout(() => {
            notification.remove();
            if (container.children().length === 0) {
                container.remove();
            }
        }, 300);
    }, 3500);
}

function moderateTwitchInline(userId, messageId, action, username) {
    if (!window.currentTwitchRoomId) {
        showNotification("Twitch channel ID not available. Make sure you are connected.", 'error');
        return;
    }
    
    fetch('/api/twitch/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: action,
            targetUserId: userId,
            broadcasterId: window.currentTwitchRoomId,
            messageId: messageId
        })
    }).then(res => res.json())
      .then(data => {
          if (data.error) showNotification(`Error: ${data.error}`, 'error');
          else {
              showNotification(`${action} successful for ${username}`, 'success');
              if (action === 'unban' || action === 'untimeout') {
                  $(`.twitch-user-${userId}`).css('text-decoration', 'none').css('opacity', '1');
              }
          }
      })
      .catch(err => showNotification(`Failed: ${err.message}`, 'error'));
}

let currentKickContextMenuData = null;

window.showKickContextMenu = function(event, userId, messageId, username, profilePic) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    currentKickContextMenuData = { userId, messageId, username };
    
    $('#twitchContextMenu').hide();
    
    let menu = $('#kickContextMenu');
    if (menu.length === 0) {
        menu = $(`
            <div id="kickContextMenu" class="context-menu" style="display: none;">
                <div class="context-menu-header" style="display: flex; align-items: center; gap: 10px; text-align: left; border-bottom: 1px solid #444; padding-bottom: 10px; margin-bottom: 5px;">
                    <img id="kickContextMenuAvatar" src="" style="width: 48px; height: 48px; border-radius: 50%; border: 2px solid #53fc18; object-fit: cover;">
                    <div style="display: flex; flex-direction: column;">
                        <span id="kickContextMenuUsername" style="font-weight: bold; font-size: 1.1em; color: #53fc18;">Username</span>
                        <span id="kickContextMenuFollowDate" style="font-size: 0.85em; color: #ccc;">🤍 Loading...</span>
                        <span id="kickContextMenuSubStatus" style="font-size: 0.85em; color: #ccc; display: none;">⭐ Loading...</span>
                    </div>
                </div>
                <div class="context-menu-item mod-only-kick" onclick="moderateKick('timeout', 60)" style="color: #ffaa00;">Timeout (1m)</div>
                <div class="context-menu-item mod-only-kick" onclick="moderateKick('timeout', 600)" style="color: #ffaa00;">Timeout (10m)</div>
                <div class="context-menu-item mod-only-kick" onclick="moderateKick('timeout', 3600)" style="color: #ffaa00;">Timeout (1h)</div>
                <div class="context-menu-item mod-only-kick" onclick="moderateKick('delete')" style="color: #ffaa00;">Delete Message</div>
                <div class="context-menu-item mod-only-kick" onclick="moderateKick('ban')" style="color: #ff5555; border-top: 1px solid #444; margin-top: 5px; padding-top: 5px;">Ban User</div>
            </div>
        `).appendTo('body');
    }
    
    $('#kickContextMenuAvatar').attr('src', profilePic || 'https://kick.com/img/kick-logo.svg');
    $('#kickContextMenuUsername').text(username);
    $('#kickContextMenuFollowDate').text('🤍 Loading...');
    $('#kickContextMenuSubStatus').hide();
    
    const posX = event ? event.pageX : 100;
    const posY = event ? event.pageY : 100;
    
    menu.css({
        top: posY + 'px',
        left: posX + 'px',
        display: 'block'
    });

    // Fetch follow date and profile info from backend endpoint
    window.kickUserInfoCache = window.kickUserInfoCache || {};
    const cacheKey = `${currentKickChannel}_${username}`;

    function applyKickUserInfo(data) {
        if (data.profilePic && !profilePic) {
            $('#kickContextMenuAvatar').attr('src', data.profilePic);
        }
        if (data.followingSince) {
            const date = new Date(data.followingSince).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            $('#kickContextMenuFollowDate').text(`🤍 Following Since ${date}`);
        } else {
            $('#kickContextMenuFollowDate').text('🤍 Not Following');
        }

        if (data.subscribedFor > 0) {
            $('#kickContextMenuSubStatus').text(`⭐ Subbed for ${data.subscribedFor} Months`).show();
        } else {
            $('#kickContextMenuSubStatus').hide();
        }
    }

    if (window.kickUserInfoCache[cacheKey]) {
        applyKickUserInfo(window.kickUserInfoCache[cacheKey]);
    } else {
        fetch(`/api/kick/userinfo?channel=${encodeURIComponent(currentKickChannel)}&username=${encodeURIComponent(username)}`)
            .then(res => res.json())
            .then(data => {
                window.kickUserInfoCache[cacheKey] = data;
                if (currentKickContextMenuData && currentKickContextMenuData.username === username) {
                    applyKickUserInfo(data);
                }
            })
            .catch(() => {
                $('#kickContextMenuFollowDate').text('🤍 Not Following');
            });
    }
};
function showKickContextMenu(event, userId, messageId, username, profilePic) {
    return window.showKickContextMenu(event, userId, messageId, username, profilePic);
}

window.moderateKick = function(action, duration = null) {
    if (!currentKickContextMenuData) return;
    
    const { userId, messageId, username } = currentKickContextMenuData;

    if (!window.authorizedKickUser) {
        showNotification('Kick Moderation Failed: You must authorize Kick first!', 'error');
        return;
    }

    const currentChan = (typeof currentKickChannel !== 'undefined' && currentKickChannel) ? currentKickChannel : '';
    const authUser = (window.authorizedKickUser || '').toLowerCase();
    const activeChan = currentChan.toLowerCase();

    if (authUser && activeChan && authUser !== activeChan) {
        showNotification(`Kick Moderation Failed: You are authorized as '${window.authorizedKickUser}', but connected to '${currentChan}'. You can only moderate your own channel.`, 'error');
        return;
    }
    
    let reason = '';
    if (action === 'ban' || action === 'timeout') {
        reason = prompt(`Enter reason for Kick ${action}ing ${username} (optional):`);
        if (reason === null) return; // Cancelled
        reason = reason.trim();
    }
    
    $('#kickContextMenu').hide();
    
    fetch('/api/kick/moderate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: action,
            targetUserId: userId,
            username: username,
            messageId: messageId,
            duration: duration,
            reason: reason,
            channel: currentChan
        })
    }).then(async res => {
        const data = await res.json();
        if (!res.ok || data.error) {
            showNotification('Kick Moderation Failed: ' + (data.message || 'You do not have moderator permissions in this channel.'), 'error');
        } else {
            showNotification('Kick moderation successful: ' + action, 'success');
            if (action === 'delete' && messageId) {
                $(`#kick-msg-${messageId} span`).css({'text-decoration': 'line-through', 'opacity': '0.5'});
                $('.eventcontainer').find(`#kick-msg-${messageId}`).remove();
            } else if (action === 'timeout' || action === 'ban') {
                $(`.kick-user-${username.toLowerCase()} span`).css({'text-decoration': 'line-through', 'opacity': '0.5'});
                $('.eventcontainer').find(`.kick-user-${username.toLowerCase()}`).remove();
            }
        }
    }).catch(err => showNotification('Kick Moderation Failed: ' + err.message, 'error'));
};
function moderateKick(action, duration = null) {
    return window.moderateKick(action, duration);
}

$(document).click(function(e) {
    if (!$(e.target).closest('#kickContextMenu').length) {
        $('#kickContextMenu').hide();
    }
});

function showBannedUsersModal() {
    const modal = $('#bannedUsersModal');
    if (modal.is(':visible')) {
        modal.hide();
        return;
    }
    
    if (!window.currentTwitchRoomId) {
        showNotification("Not connected to Twitch", "error");
        return;
    }
    
    modal.show();
    const list = $('#bannedUsersList');
    list.html('<div style="text-align: center; color: #aaa;">Loading...</div>');
    
    fetch(`/api/twitch/banned?broadcasterId=${window.currentTwitchRoomId}`)
        .then(res => res.json())
        .then(data => {
            if (data.error) throw new Error(data.error);
            list.empty();
            
            if (!data.data || data.data.length === 0) {
                list.html('<div style="text-align: center; color: #aaa;">No banned or timed-out users.</div>');
                return;
            }
            
            data.data.forEach(user => {
                const isTimeout = user.expires_at !== "";
                const dateStr = isTimeout ? new Date(user.expires_at).toLocaleString() : "Permanent";
                const typeLabel = isTimeout ? `<span style="color: #ffaa00; font-size: 11px;">Timeout until ${dateStr}</span>` : `<span style="color: #ff5555; font-size: 11px;">Banned</span>`;
                
                const unbanBtnText = isTimeout ? 'Untimeout' : 'Unban';
                const item = $(`
                    <div style="display: flex; justify-content: space-between; align-items: center; background: #2a2a2a; padding: 8px 10px; border-radius: 4px;">
                        <div style="display: flex; flex-direction: column; max-width: 70%;">
                            <strong style="color: #9146FF; font-size: 14px;">${user.user_name}</strong>
                            ${typeLabel}
                            ${user.reason ? `<span style="color: #aaa; font-size: 11px; margin-top: 4px; overflow-wrap: break-word;">Reason: ${user.reason}</span>` : ''}
                        </div>
                        <button class="unban-btn" style="background: transparent; color: #ff5555; border: 1px solid #ff5555; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; transition: background 0.2s;">${unbanBtnText}</button>
                    </div>
                `);
                
                item.find('.unban-btn').hover(
                    function() { $(this).css({background: '#ff5555', color: '#fff'}); },
                    function() { $(this).css({background: 'transparent', color: '#ff5555'}); }
                ).click(function() {
                    if (confirm(`Are you sure you want to ${unbanBtnText.toLowerCase()} ${user.user_name}?`)) {
                        $(this).prop('disabled', true).text('...');
                        fetch('/api/twitch/moderate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                action: 'unban',
                                targetUserId: user.user_id,
                                broadcasterId: window.currentTwitchRoomId
                            })
                        }).then(res => res.json())
                          .then(data => {
                              if (data.error) throw new Error(data.error);
                              showNotification(`${unbanBtnText} successful for ${user.user_name}`, 'success');
                              item.fadeOut(300, function() {
                                  $(this).remove();
                                  if ($('#bannedUsersList').children().length === 0) {
                                      $('#bannedUsersList').html('<div style="text-align: center; color: #aaa;">No banned or timed-out users.</div>');
                                  }
                              });
                          })
                          .catch(err => {
                              $(this).prop('disabled', false).text(unbanBtnText);
                              showNotification(`Failed to ${unbanBtnText.toLowerCase()} ${user.user_name}: ${err.message}`, 'error');
                          });
                    }
                });
                
                list.append(item);
            });
        })
        .catch(err => {
            $('#bannedUsersList').html(`<div style="color: #ff5555; text-align: center;">Error: ${err.message}</div>`);
        });
}



// --- Channel Actions Logic ---
let gameSearchTimeout;
let raidSearchTimeout;

function showChannelActionsModal() {
    if (!$('#channelActionsModal').is(':visible')) {
        $('#channelActionsModal').show();
        $('#channelActionsBackdrop').show();
        switchChannelActionTab('info');
        fetchCurrentStreamInfo();
    } else {
        $('#channelActionsModal').hide();
        $('#channelActionsBackdrop').hide();
    }
}

function switchChannelActionTab(tab) {
    if (tab === 'info') {
        $('#sectionStreamInfo').show();
        $('#sectionRaid').hide();
        $('#tabStreamInfo').css({ background: '#9146FF', color: 'white', border: 'none' });
        $('#tabRaid').css({ background: 'transparent', color: '#aaa', border: '1px solid #444' });
    } else {
        $('#sectionStreamInfo').hide();
        $('#sectionRaid').show();
        $('#tabRaid').css({ background: '#9146FF', color: 'white', border: 'none' });
        $('#tabStreamInfo').css({ background: 'transparent', color: '#aaa', border: '1px solid #444' });
    }
}

let currentStreamPlatform = 'twitch';

function selectStreamPlatform(platform) {
    currentStreamPlatform = platform;
    if (platform === 'twitch') {
        $('#streamPlatformTwitchBtn').css({ background: '#9146FF', color: 'white', border: 'none' });
        $('#streamPlatformKickBtn').css({ background: '#1c1e29', color: '#53fc18', border: '1px solid #53fc18' });
    } else {
        $('#streamPlatformKickBtn').css({ background: '#53fc18', color: 'black', border: 'none' });
        $('#streamPlatformTwitchBtn').css({ background: '#1c1e29', color: '#9146FF', border: '1px solid #9146FF' });
    }
    $('#categoryContainer').show();
    fetchCurrentStreamInfo();
}

function fetchCurrentStreamInfo() {
    const enableInputs = () => {
        $('#streamTitleInput').prop('disabled', false).css('opacity', '1');
        $('#streamGameInput').prop('disabled', false).css('opacity', '1');
        $('#saveStreamInfoBtn').prop('disabled', false).css('opacity', '1');
    };

    if (currentStreamPlatform === 'kick') {
        const kickChannel = $('#kickLinkInput').val() || window.currentKickChannel || window.authorizedKickUser || '';
        if (!kickChannel) {
            $('#streamTitleInput').val('').attr('placeholder', 'Enter Kick stream title...');
            $('#streamGameInput').val('').attr('placeholder', 'Search category or game...');
            enableInputs();
            return;
        }

        fetch('/api/kick/channel?channel=' + encodeURIComponent(kickChannel))
            .then(res => res.json())
            .then(data => {
                $('#streamTitleInput').val(data.title || '').attr('placeholder', 'Enter Kick stream title...');
                $('#streamGameInput').val(data.category_name || '').attr('placeholder', 'Search category or game...');
                $('#streamGameIdInput').val(data.category_id || '');
                enableInputs();
            })
            .catch(err => {
                console.error('Failed to load Kick stream info:', err);
                $('#streamTitleInput').val('').attr('placeholder', 'Enter Kick stream title...');
                $('#streamGameInput').val('').attr('placeholder', 'Search category or game...');
                enableInputs();
            });
        return;
    }

    if (!window.currentTwitchRoomId) {
        $('#streamTitleInput').attr('placeholder', 'Not connected to Twitch');
        enableInputs();
        return;
    }

    fetch('/api/twitch/channel?broadcasterId=' + window.currentTwitchRoomId)
        .then(res => res.json())
        .then(data => {
            if (data.error) throw new Error(data.message);
            $('#streamTitleInput').val(data.title || '');
            $('#streamGameInput').val(data.game_name || '');
            $('#streamGameIdInput').val(data.game_id || '');
            enableInputs();
        })
        .catch(err => {
            console.error('Failed to load stream info:', err);
            $('#streamTitleInput').attr('placeholder', 'Failed to load title');
            enableInputs();
        });
}

$(document).on('input', '#streamGameInput', function() {
    $('#streamGameIdInput').val(''); // Clear the ID since they are typing manually
    clearTimeout(gameSearchTimeout);
    const query = $(this).val().trim();
    if (!query) {
        $('#gameSearchResults').hide().empty();
        return;
    }
    
    gameSearchTimeout = setTimeout(() => {
        const searchUrl = (currentStreamPlatform === 'kick') 
            ? '/api/kick/categories/search?q=' + encodeURIComponent(query) 
            : '/api/twitch/search-categories?query=' + encodeURIComponent(query);

        fetch(searchUrl)
            .then(res => res.json())
            .then(data => {
                if (data.error) return;
                const resultsBox = $('#gameSearchResults');
                resultsBox.empty();
                if (data.data && data.data.length > 0) {
                    data.data.forEach(game => {
                        const div = $('<div class="game-search-item"></div>');
                        const imgStyle = (currentStreamPlatform === 'kick') 
                            ? 'width:28px;height:28px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:8px;'
                            : 'width:24px;height:32px;vertical-align:middle;margin-right:8px;';
                        div.html(`<img src="${game.box_art_url}" style="${imgStyle}"><span>${game.name}</span>`);
                        div.on('click', () => {
                            $('#streamGameInput').val(game.name);
                            $('#streamGameIdInput').val(game.id);
                            resultsBox.hide();
                        });
                        resultsBox.append(div);
                    });
                    resultsBox.show();
                } else {
                    resultsBox.hide();
                }
            });
    }, 500);
});

$(document).on('input', '#raidChannelInput', function() {
    clearTimeout(raidSearchTimeout);
    const query = $(this).val().trim();
    
    console.log('[DEBUG] Raid search input fired, query:', query);
    
    // Dynamically create results box if index.html was cached
    if ($('#raidSearchResults').length === 0) {
        console.log('[DEBUG] raidSearchResults div missing! Creating dynamically...');
        $('<div id="raidSearchResults" class="custom-scrollbar" style="display: none; position: absolute; top: 100%; left: 0; width: 100%; max-height: 200px; overflow-y: auto; background: #1f1f23; border: 1px solid #444; border-top: none; z-index: 10000;"></div>').insertAfter('#raidChannelInput');
        $('#raidChannelInput').parent().css('position', 'relative');
    }

    if (!query) {
        console.log('[DEBUG] Query empty, hiding results.');
        $('#raidSearchResults').hide().empty();
        return;
    }

    raidSearchTimeout = setTimeout(() => {
        console.log('[DEBUG] Fetching Twitch API for query:', query);
        fetch('/api/twitch/search-channels?query=' + encodeURIComponent(query))
            .then(res => {
                console.log('[DEBUG] Fetch response status:', res.status);
                return res.json();
            })
            .then(data => {
                console.log('[DEBUG] Fetch returned data:', data);
                if (data.error) {
                    console.error('[DEBUG] Fetch returned data error:', data.error);
                    return;
                }
                const resultsBox = $('#raidSearchResults');
                resultsBox.empty();
                if (data.data && data.data.length > 0) {
                    console.log(`[DEBUG] Found ${data.data.length} channels, rendering...`);
                    data.data.forEach(channel => {
                        const div = $('<div class="game-search-item" style="display: flex; align-items: center; justify-content: space-between;"></div>');
                        div.html(`
                            <div style="display: flex; align-items: center;">
                                <img src="${channel.thumbnail_url}" style="width:24px;height:24px;border-radius:50%;vertical-align:middle;margin-right:8px;">
                                <span>${channel.display_name}</span>
                            </div>
                            <span style="color: #ff5555; font-size: 0.9em;">🔴 ${channel.viewer_count.toLocaleString()}</span>
                        `);
                        div.on('click', () => {
                            $('#raidChannelInput').val(channel.display_name);
                            resultsBox.hide();
                        });
                        resultsBox.append(div);
                    });
                    resultsBox.show();
                    console.log('[DEBUG] Dropdown is now visible!');
                } else {
                    console.log('[DEBUG] No channels found in data array. Hiding dropdown.');
                    resultsBox.hide();
                }
            })
            .catch(err => {
                console.error('[DEBUG] Fetch completely failed:', err);
            });
    }, 500);
});

$(document).click(function(e) {
    if (!$(e.target).closest('#streamGameInput, #gameSearchResults').length) {
        $('#gameSearchResults').hide();
    }
    if (!$(e.target).closest('#raidChannelInput, #raidSearchResults').length) {
        $('#raidSearchResults').hide();
    }
});

function saveStreamInfo() {
    const title = $('#streamTitleInput').val().trim();
    const gameNameInput = $('#streamGameInput').val().trim();
    let gameId = $('#streamGameIdInput').val();
    
    const saveBtn = $('#channelActionsModal button:contains("Save Changes")');
    const oldBtnText = saveBtn.text();
    saveBtn.text('Saving...').prop('disabled', true);

    if (currentStreamPlatform === 'kick') {
        const submitSaveKick = (finalCategoryId) => {
            fetch('/api/kick/channel', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: title, category_id: finalCategoryId, category_name: gameNameInput })
            })
            .then(res => res.json())
            .then(data => {
                if (data.error) throw new Error(data.message);
                showNotification('Kick Stream Info updated successfully!', 'success');
                $('#channelActionsModal').hide();
                $('#channelActionsBackdrop').hide();
            })
            .catch(err => showNotification('Failed to update Kick info: ' + err.message, 'error'))
            .finally(() => saveBtn.text(oldBtnText).prop('disabled', false));
        };

        if (gameNameInput && !gameId) {
            fetch('/api/kick/categories/search?q=' + encodeURIComponent(gameNameInput))
                .then(res => res.json())
                .then(data => {
                    if (data.data && data.data.length > 0) {
                        submitSaveKick(data.data[0].id);
                    } else {
                        submitSaveKick('');
                    }
                })
                .catch(() => submitSaveKick(''));
        } else {
            submitSaveKick(gameId);
        }
        return;
    }

    if (!window.currentTwitchRoomId) {
        showNotification('Not connected to Twitch!', 'error');
        saveBtn.text(oldBtnText).prop('disabled', false);
        return;
    }

    const submitSave = (finalGameId) => {
        fetch('/api/twitch/channel', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ broadcasterId: window.currentTwitchRoomId, title: title, game_id: finalGameId })
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) throw new Error(data.message);
            showNotification('Stream info updated successfully!', 'success');
            $('#channelActionsModal').hide();
            $('#channelActionsBackdrop').hide();
        })
        .catch(err => showNotification('Failed: ' + err.message, 'error'))
        .finally(() => saveBtn.text(oldBtnText).prop('disabled', false));
    };

    if (gameNameInput && !gameId) {
        // Auto-lookup the ID for what they typed if they didn't click the dropdown
        fetch('/api/twitch/search-categories?query=' + encodeURIComponent(gameNameInput))
            .then(res => res.json())
            .then(data => {
                if (data.data && data.data.length > 0) {
                    submitSave(data.data[0].id);
                } else {
                    submitSave(''); // Send empty if category not found
                }
            })
            .catch(() => submitSave(''));
    } else {
        if (!gameNameInput) gameId = ''; // If they completely cleared it
        submitSave(gameId);
    }
}

function startRaid() {
    if (!window.currentTwitchRoomId) return;
    const targetUsername = $('#raidChannelInput').val().trim();
    if (!targetUsername) return;
    
    fetch('/api/twitch/raid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcasterId: window.currentTwitchRoomId, targetUsername: targetUsername })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) throw new Error(data.message);
        showNotification('Raid started!', 'success');
        $('#raidChannelInput').val('');
    })
    .catch(err => showNotification('Raid failed: ' + err.message, 'error'));
}

function cancelRaid() {
    if (!window.currentTwitchRoomId) return;
    fetch('/api/twitch/raid', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broadcasterId: window.currentTwitchRoomId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) throw new Error(data.message);
        showNotification('Raid cancelled!', 'success');
    })
    .catch(err => showNotification('Cancel failed: ' + err.message, 'error'));
}

window.openPollModal = function() {
    $('#pollModal').show();
    $('#pollModalBackdrop').show();
};

window.addPollOptionRow = function() {
    const count = $('.poll-option-row').length + 1;
    const row = $(`
        <div class="poll-option-row" style="display: flex; gap: 8px;">
            <input type="text" class="poll-option-label" placeholder="Option ${count}" style="flex: 2; background: #0e0e14; border: 1px solid #444; color: white; padding: 8px; border-radius: 6px;">
            <input type="text" class="poll-option-kw" value="${count}" placeholder="Keyword" style="flex: 1; background: #0e0e14; border: 1px solid #444; color: #53fc18; font-weight: bold; padding: 8px; border-radius: 6px;">
        </div>
    `);
    $('#pollOptionsContainer').append(row);
};

window.startPollSubmit = function() {
    const title = $('#pollTitleInput').val().trim() || 'Live Stream Poll';
    const options = [];
    $('.poll-option-row').each(function() {
        const label = $(this).find('.poll-option-label').val().trim();
        const kw = $(this).find('.poll-option-kw').val().trim();
        if (label || kw) {
            options.push({ label: label || kw, keyword: kw || label });
        }
    });

    if (options.length < 2) {
        showNotification('Please add at least 2 options for the poll!', 'error');
        return;
    }

    const duration = $('#pollDurationSelect').val();
    const targetPlatform = $('#pollPlatformSelect').val() || 'all';

    if (window.connection && window.connection.socket) {
        window.connection.socket.emit('createPoll', { title, options, duration, targetPlatform });
        showNotification('🚀 Poll started successfully!', 'success');
    } else {
        showNotification('Socket connection not ready!', 'error');
    }
};

window.endPollSubmit = function() {
    if (window.connection && window.connection.socket) {
        window.connection.socket.emit('endPoll');
        showNotification('🛑 Poll ended!', 'info');
    }
};

window.resetPollFields = function() {
    $('#pollTitleInput').val('');
    $('#pollOptionsContainer').html(`
        <div class="poll-option-row" style="display: flex; gap: 8px;">
            <input type="text" class="poll-option-label" placeholder="Option 1 (e.g. GTA V)" style="flex: 2; background: #0e0e14; border: 1px solid #444; color: white; padding: 8px; border-radius: 6px;">
            <input type="text" class="poll-option-kw" value="1" placeholder="Keyword (e.g. 1)" style="flex: 1; background: #0e0e14; border: 1px solid #444; color: #53fc18; font-weight: bold; padding: 8px; border-radius: 6px;">
        </div>
        <div class="poll-option-row" style="display: flex; gap: 8px;">
            <input type="text" class="poll-option-label" placeholder="Option 2 (e.g. Fortnite)" style="flex: 2; background: #0e0e14; border: 1px solid #444; color: white; padding: 8px; border-radius: 6px;">
            <input type="text" class="poll-option-kw" value="2" placeholder="Keyword (e.g. 2)" style="flex: 1; background: #0e0e14; border: 1px solid #444; color: #53fc18; font-weight: bold; padding: 8px; border-radius: 6px;">
        </div>
    `);
    $('#pollPlatformSelect').val('all');
    $('#pollDurationSelect').val('60');
    showNotification('🧹 Poll inputs reset!', 'info');
};

window.copyPollOverlayUrl = function() {
    const origin = window.location.origin;
    const pollUrl = `${origin}/poll.html`;
    navigator.clipboard.writeText(pollUrl).then(() => {
        showNotification('📋 Poll Overlay URL copied to clipboard: ' + pollUrl, 'success');
    }).catch(() => {
        prompt('Copy Poll Overlay URL:', pollUrl);
    });
};

let modalPollTimerInterval = null;

function startModalPollTimer(endTime, isEnded) {
    if (modalPollTimerInterval) clearInterval(modalPollTimerInterval);

    const updateTimerUI = (timeStr, isOver) => {
        $('#modalPollTimerText').text(timeStr);
        if ($('#activePollTickerText').length) {
            $('#activePollTickerText').text(timeStr);
            if (isOver) {
                $('#activePollTicker').css({ background: '#ff5555', color: '#fff' });
            } else {
                $('#activePollTicker').css({ background: '#ffaa00', color: '#000' });
            }
        }
    };

    if (isEnded) {
        updateTimerUI('ENDED', true);
        return;
    }

    if (!endTime) {
        updateTimerUI('NO LIMIT', false);
        return;
    }

    const updateTimer = () => {
        const now = Date.now();
        const remainingSec = Math.max(0, Math.ceil((endTime - now) / 1000));
        
        const mins = Math.floor(remainingSec / 60).toString().padStart(2, '0');
        const secs = (remainingSec % 60).toString().padStart(2, '0');
        const formatted = `${mins}:${secs}`;

        updateTimerUI(formatted, remainingSec <= 0);

        if (remainingSec <= 0) {
            clearInterval(modalPollTimerInterval);
        }
    };

    updateTimer();
    modalPollTimerInterval = setInterval(updateTimer, 1000);
}

function renderModalPollResults(poll) {
    if (!poll || !poll.active) {
        if (modalPollTimerInterval) clearInterval(modalPollTimerInterval);
        $('#modalLivePollResults').hide();
        $('#activePollTicker').hide();
        return;
    }

    $('#modalLivePollResults').show();
    $('#activePollTicker').show();
    $('#modalPollTitleDisplay').text(poll.title);
    $('#modalPollTotalVotes').text(`${poll.totalVotes} Vote${poll.totalVotes === 1 ? '' : 's'}`);

    if (poll.ended) {
        $('#modalPollBadge').text('ENDED').css({ background: '#ff5555', color: '#fff' });
    } else {
        $('#modalPollBadge').text('LIVE RESULTS').css({ background: '#53fc18', color: '#000' });
    }

    startModalPollTimer(poll.endTime, poll.ended);

    const list = $('#modalPollList');
    list.empty();

    poll.options.forEach(opt => {
        const percent = poll.totalVotes > 0 ? Math.round((opt.votes / poll.totalVotes) * 100) : 0;
        const row = $(`
            <div style="position: relative; background: rgba(255,255,255,0.05); border-radius: 6px; padding: 6px 10px; overflow: hidden;">
                <div style="position: absolute; top:0; left:0; bottom:0; width: ${percent}%; background: rgba(83, 252, 24, 0.25); border-radius: 6px; transition: width 0.4s ease;"></div>
                <div style="position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; font-size: 0.85em;">
                    <div>
                        <span style="background: rgba(255,255,255,0.15); color: #53fc18; font-weight: bold; padding: 1px 5px; border-radius: 3px; font-size: 0.8em; margin-right: 6px;">${opt.keyword}</span>
                        <span style="color: #fff; font-weight: bold;">${opt.label}</span>
                    </div>
                    <div>
                        <span style="color: #53fc18; font-weight: bold; margin-right: 4px;">${percent}%</span>
                        <span style="color: #888; font-size: 0.85em;">(${opt.votes})</span>
                    </div>
                </div>
            </div>
        `);
        list.append(row);
    });
}

// Bind socket poll events for dashboard live updates
if (window.connection && window.connection.socket) {
    window.connection.socket.on('pollState', renderModalPollResults);
    window.connection.socket.on('pollUpdate', renderModalPollResults);
    window.connection.socket.on('pollEnd', renderModalPollResults);
}

/* ==========================================================================
   Tab Navigation & Custom Website Page System
   ========================================================================== */
let customTabs = [];
let activeTabId = 'main';

function loadSavedCustomTabs() {
    try {
        const saved = localStorage.getItem('combinedchat_custom_tabs');
        if (saved) {
            customTabs = JSON.parse(saved);
        }
    } catch (e) {
        console.error('Failed to load custom tabs', e);
        customTabs = [];
    }
}

function saveCustomTabsToStorage() {
    try {
        localStorage.setItem('combinedchat_custom_tabs', JSON.stringify(customTabs));
    } catch (e) {
        console.error('Failed to save custom tabs', e);
    }
}

function openAddPageModal() {
    $('#newTabTitle').val('');
    $('#newTabUrl').val('');
    $('#addPageModalOverlay').css('display', 'flex');
    setTimeout(() => $('#newTabTitle').focus(), 100);
}

function closeAddPageModal() {
    $('#addPageModalOverlay').hide();
}

function formatTabUrl(inputUrl) {
    let url = (inputUrl || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
        if (!url.includes('.') || url.includes(' ')) {
            url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
        } else {
            url = 'https://' + url;
        }
    }
    return url;
}

function saveNewTab() {
    const title = $('#newTabTitle').val().trim() || 'New Website';
    const rawUrl = $('#newTabUrl').val();
    const url = formatTabUrl(rawUrl);

    if (!rawUrl.trim()) {
        alert('Please enter a valid website URL.');
        $('#newTabUrl').focus();
        return;
    }

    const tabId = 'custom_tab_' + Date.now();
    const newTab = {
        id: tabId,
        title: title,
        url: url
    };

    customTabs.push(newTab);
    saveCustomTabsToStorage();
    renderTabs();
    closeAddPageModal();
    switchToTab(tabId);
}

function removeTab(tabId, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    // Safely preserve #mainChatContainer if it is currently hosted inside this tab view
    const mainChat = $('#mainChatContainer');
    const tabView = $(`#tab_view_${tabId}`);
    if (mainChat.length && tabView.length && $.contains(tabView[0], mainChat[0])) {
        $('#mainChatDockContent').append(mainChat);
    }

    customTabs = customTabs.filter(t => t.id !== tabId);
    saveCustomTabsToStorage();

    $(`#tab_header_${tabId}`).remove();
    tabView.remove();

    if (activeTabId === tabId) {
        switchToTab('main');
    }
}

function getAllTabIds() {
    return ['main', ...customTabs.map(t => t.id)];
}

function switchToNextTab() {
    const ids = getAllTabIds();
    if (ids.length <= 1) return;
    const currentIndex = ids.indexOf(activeTabId);
    const nextIndex = (currentIndex + 1) % ids.length;
    switchToTab(ids[nextIndex]);
}

function switchToPrevTab() {
    const ids = getAllTabIds();
    if (ids.length <= 1) return;
    const currentIndex = ids.indexOf(activeTabId);
    const prevIndex = (currentIndex - 1 + ids.length) % ids.length;
    switchToTab(ids[prevIndex]);
}

function switchToTab(tabId) {
    activeTabId = tabId;

    // Update tab bar active highlights
    $('.browser-tab').removeClass('active');
    if (tabId === 'main') {
        $('#tab-main').addClass('active');
    } else {
        $(`#tab_header_${tabId}`).addClass('active');
    }

    // Auto-scroll active tab into view
    const activeElem = document.getElementById(tabId === 'main' ? 'tab-main' : `tab_header_${tabId}`);
    if (activeElem && typeof activeElem.scrollIntoView === 'function') {
        activeElem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    const mainChat = $('#mainChatContainer');

    if (tabId === 'main') {
        // Show main dashboard, hide custom views
        $('#customViewsContainer').hide();
        $('#mainDashboardView').css('display', 'flex');

        // Move chat back to main dock
        const mainDockContent = $('#mainChatDockContent');
        if (mainDockContent.length && mainChat.length && !$.contains(mainDockContent[0], mainChat[0])) {
            mainDockContent.append(mainChat);
        }
    } else {
        // Hide main dashboard, show custom views
        $('#mainDashboardView').hide();
        $('#customViewsContainer').show();

        // Ensure the tab view exists - if not, create it
        if (!$(`#tab_view_${tabId}`).length) {
            renderTabs();
        }

        // Show only the active tab view
        $('.custom-tab-container').hide().removeClass('active');
        const viewElem = $(`#tab_view_${tabId}`);
        if (viewElem.length) {
            viewElem.addClass('active').show();
        }

        // Move chat into the active tab's dock
        const dockContent = $(`#chatDockContent_${tabId}`);
        if (dockContent.length && mainChat.length && !$.contains(dockContent[0], mainChat[0])) {
            dockContent.append(mainChat);
        }
    }
}

function initMainDockResize(e) {
    const dock = document.getElementById('mainDashboardBottomDock');
    if (!dock) return;

    let isResizing = true;
    let startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    let startHeight = dock.getBoundingClientRect().height;

    function handleMove(moveEvent) {
        if (!isResizing) return;
        const currentY = moveEvent.type.includes('touch') ? moveEvent.touches[0].clientY : moveEvent.clientY;
        const deltaY = startY - currentY;
        const newHeight = startHeight + deltaY;

        if (newHeight > 150 && newHeight < window.innerHeight * 0.85) {
            dock.style.height = newHeight + 'px';
        }

        if (moveEvent.type.includes('touch') && moveEvent.cancelable) {
            moveEvent.preventDefault();
        }
    }

    function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('touchend', stopResize);
    }

    if (e.type.includes('touch')) {
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', stopResize);
    } else {
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', stopResize);
        e.preventDefault();
    }
}

function reloadTabIframe(tabId) {
    const iframe = $(`#iframe_${tabId}`);
    if (iframe.length) {
        const src = iframe.attr('src');
        iframe.attr('src', src);
    }
}

function openTabExternal(url) {
    if (url) {
        window.open(url, '_blank');
    }
}

function renderTabs() {
    const tabsListContainer = $('#customTabsList');
    const customViewsContainer = $('#customViewsContainer');

    if (!tabsListContainer.length) return;

    // Clear existing dynamic tab headers
    tabsListContainer.empty();

    customTabs.forEach(tab => {
        // Tab Header
        const isActive = activeTabId === tab.id;
        const tabHeader = $(`
            <div class="browser-tab ${isActive ? 'active' : ''}" id="tab_header_${tab.id}" onclick="switchToTab('${tab.id}')" title="${tab.title} (${tab.url})">
                <span class="tab-icon">🌐</span>
                <span class="tab-title-text">${escapeHtml(tab.title)}</span>
                <span class="tab-close-btn" onclick="removeTab('${tab.id}', event)" title="Close tab">✕</span>
            </div>
        `);
        tabsListContainer.append(tabHeader);

        // Tab View Container
        if (!$(`#tab_view_${tab.id}`).length) {
            const tabView = $(`
                <div class="custom-tab-container ${isActive ? 'active' : ''}" id="tab_view_${tab.id}">
                    <!-- Top Toolbar -->
                    <div class="custom-web-toolbar" style="z-index: 10; position: relative;">
                        <button class="custom-web-btn" onclick="reloadTabIframe('${tab.id}')" title="Reload page">🔄</button>
                        <div class="custom-url-bar">
                            <span style="font-size: 0.9em;">🔒</span>
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(tab.url)}</span>
                        </div>
                        <button class="custom-web-btn" style="background: linear-gradient(90deg, #58a6ff, #9146FF); color: #fff; font-weight: bold; border: none; box-shadow: 0 2px 6px rgba(88,166,255,0.3);" onclick="openTabExternal('${escapeHtml(tab.url)}')" title="Open in new window or mobile browser">↗ Open Site</button>
                    </div>

                    <!-- Embedded Website Iframe -->
                    <div class="custom-web-frame-wrapper">
                        <div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #12141d; color: #8c92a6; padding: 20px; text-align: center; z-index: 0;">
                            <span style="font-size: 2.4em; margin-bottom: 8px;">🌐</span>
                            <h4 style="margin: 0 0 6px 0; color: #e3e5eb; font-size: 1.05em;">Loading Website...</h4>
                            <p style="margin: 0 0 14px 0; font-size: 0.85em; max-width: 380px; color: #8a8f9e; line-height: 1.3;">If this page restricts embedded viewing, tap below to open it directly in your browser.</p>
                            <button class="custom-web-btn" style="background: linear-gradient(90deg, #58a6ff, #9146FF); color: #fff; font-weight: bold; border: none; padding: 8px 18px; font-size: 0.88em; border-radius: 8px; box-shadow: 0 2px 10px rgba(88,166,255,0.3);" onclick="openTabExternal('${escapeHtml(tab.url)}')">↗ Open Website in Browser</button>
                        </div>
                        <iframe id="iframe_${tab.id}" class="custom-web-frame" style="position: relative; z-index: 1;" src="${escapeHtml(tab.url)}" allow="autoplay; camera; microphone; clipboard-read; clipboard-write; encrypted-media; picture-in-picture; web-share; fullscreen" sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-presentation allow-downloads allow-pointer-lock allow-top-navigation-by-user-activation" loading="lazy"></iframe>
                    </div>

                    <!-- Bottom Chat Reader Dock -->
                    <div class="bottom-chat-dock" id="chatDock_${tab.id}" style="z-index: 10;">
                        <div class="dock-resize-handle" onmousedown="initDockResize(event, '${tab.id}')" ontouchstart="initDockResize(event, '${tab.id}')">
                            <div></div>
                        </div>
                        <div class="dock-header">
                            <h4><span>💬</span> Embedded Chat Reader & Options</h4>
                            <div class="dock-controls">
                                <button onclick="switchToTab('main')" title="Go back to full dashboard">🖥️ Full Dashboard</button>
                            </div>
                        </div>
                        <div id="chatDockContent_${tab.id}" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative;"></div>
                    </div>
                </div>
            `);
            customViewsContainer.append(tabView);
        }
    });

    // If active tab was a custom tab, ensure its dock contains mainChatContainer
    if (activeTabId !== 'main') {
        const activeDock = $(`#chatDockContent_${activeTabId}`);
        if (activeDock.length) {
            activeDock.append($('#mainChatContainer'));
        }
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function initDockResize(e, tabId) {
    const dock = document.getElementById(`chatDock_${tabId}`);
    if (!dock) return;

    let isResizing = true;
    let startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    let startHeight = dock.getBoundingClientRect().height;

    function handleMove(moveEvent) {
        if (!isResizing) return;
        const currentY = moveEvent.type.includes('touch') ? moveEvent.touches[0].clientY : moveEvent.clientY;
        const deltaY = startY - currentY;
        const newHeight = startHeight + deltaY;

        if (newHeight > 150 && newHeight < window.innerHeight * 0.85) {
            dock.style.height = newHeight + 'px';
        }

        if (moveEvent.type.includes('touch') && moveEvent.cancelable) {
            moveEvent.preventDefault();
        }
    }

    function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchmove', handleMove);
        document.removeEventListener('touchend', stopResize);
    }

    if (e.type.includes('touch')) {
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', stopResize);
    } else {
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', stopResize);
        e.preventDefault();
    }
}

function setupMobileTabSwiping() {
    const tabBar = document.getElementById('browserTabBarContainer');
    if (!tabBar) return;

    let touchStartX = 0;
    let touchStartY = 0;

    tabBar.addEventListener('touchstart', function(e) {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    }, { passive: true });

    tabBar.addEventListener('touchend', function(e) {
        if (e.changedTouches.length === 1) {
            const deltaX = e.changedTouches[0].clientX - touchStartX;
            const deltaY = e.changedTouches[0].clientY - touchStartY;

            // Trigger tab switch if horizontal swipe > 40px and horizontal movement is dominant
            if (Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 1.4) {
                if (deltaX < 0) {
                    switchToNextTab();
                } else {
                    switchToPrevTab();
                }
            }
        }
    }, { passive: true });
}

// Initialize tabs on DOM content loaded
$(document).ready(function() {
    loadSavedCustomTabs();
    renderTabs();
    // Always start on main tab
    switchToTab('main');
    setupMobileTabSwiping();
});

