require('dotenv').config();

// Set environment variables to avoid Puppeteer issues in Vercel
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
process.env.PUPPETEER_ARGS = '--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --disable-accelerated-2d-canvas --no-first-run --no-zygote --single-process --disable-gpu';

const express = require('express');
const proxy = require('express-http-proxy');
const { createServer } = require('http');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
// === Twitch Avatar Fetching ===
const twitchAvatarCache = new Map();
const pendingAvatarRequests = new Map();

async function fetchTwitchAvatar(username) {
    if (!username) return 'https://static-cdn.jtvnw.net/user-default-pictures-uv/41780b5a-def8-11e9-94d9-784f43822e80-profile_image-70x70.png';
    username = username.toLowerCase();
    
    if (twitchAvatarCache.has(username)) {
        return twitchAvatarCache.get(username);
    }
    
    if (pendingAvatarRequests.has(username)) {
        return pendingAvatarRequests.get(username);
    }

    const fetchPromise = (async () => {
        try {
            const https = require('https');
            const url = await new Promise((resolve, reject) => {
                const req = https.get(`https://decapi.me/twitch/avatar/${username}`, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data.trim()));
                });
                req.on('error', reject);
                req.setTimeout(3000, () => { req.destroy(); resolve(null); });
            });
            
            if (url && url.startsWith('http')) {
                return url;
            }
        } catch (e) {
            console.error(`[Twitch Avatar Error] for ${username}:`, e.message);
        }
        
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=random`;
    })();

    pendingAvatarRequests.set(username, fetchPromise);

    const result = await fetchPromise;
    pendingAvatarRequests.delete(username);

    // Limit cache size to 2000 entries to prevent memory leaks over long streams
    if (twitchAvatarCache.size >= 2000) {
        const firstKey = twitchAvatarCache.keys().next().value;
        twitchAvatarCache.delete(firstKey);
    }
    twitchAvatarCache.set(username, result);

    return result;
}

// === Kick Subscriber Badges Fetching ===
const kickSubBadgeCache = new Map();
async function fetchKickChannelSubBadges(channelSlug) {
    if (!channelSlug) return [];
    const lower = channelSlug.toLowerCase();
    if (kickSubBadgeCache.has(lower)) {
        return kickSubBadgeCache.get(lower);
    }
    try {
        const res = await axios.get(`https://kick.com/api/v1/channels/${channelSlug}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json'
            },
            timeout: 5000
        });
        const data = res.data;
        const rawBadges = data.subscriber_badges || data.subscriberBadges || data.badges || [];
        const parsed = rawBadges.map(b => ({
            months: b.months || b.count || 1,
            url: b.badge_image?.src || b.badge_image?.srcset || b.url || b.badge_url || b.src || b.image_url
        })).filter(b => b.url).sort((a, b) => a.months - b.months);
        
        kickSubBadgeCache.set(lower, parsed);
        return parsed;
    } catch (e) {
        return [];
    }
}

require('socket.io');
const { Server } = require('socket.io');
const { TikTokConnectionWrapper, getGlobalConnectionCount } = require('./connectionWrapper');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { WebcastPushConnection } = require('tiktok-live-connector');
const { clientBlocked } = require('./limiter');
const { createClient } = require('@retconned/kick-js');
const KickChatFallback = require('./kick-chat-fallback');
const tmi = require('tmi.js');


// Global error handler for Puppeteer errors
process.on('unhandledRejection', (reason, promise) => {
    console.log(`[Global] Unhandled Rejection at:`, promise, 'reason:', reason);
    // Don't crash the app, just log the error
});

const app = express();
app.set('trust proxy', true);
const httpServer = createServer(app);

// Enable cross origin resource sharing
const io = new Server(httpServer, {
    cors: {
        origin: '*'
    }
});

// Handle favicon requests cleanly
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Serve static files with explicit MIME types
app.use(express.static('public', {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));
// Support JSON and Form URL-encoded data for proxy form submissions and logins
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Suppress Cloudflare RUM beacon 404s
app.all('/cdn-cgi/*', (req, res) => res.status(204).end());

// Automatically redirect bare domain requests (e.g. http://localhost:8081/streamelements.com) directly to https://
app.use((req, res, next) => {
    const raw = req.path.replace(/^\//, '');
    const ignoredExtensions = ['.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.json', '.woff', '.woff2', '.map'];
    if (!ignoredExtensions.some(ext => raw.toLowerCase().endsWith(ext)) && /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(raw)) {
        return res.redirect('https://' + raw);
    }
    next();
});

// Proxy root-relative /assets/* requests dynamically
app.get('/assets/*', async (req, res) => {
    const referer = req.headers['referer'] || '';
    let targetOrigin = 'https://streamelements.com';
    if (referer.includes('url=')) {
        try {
            const refUrl = new URL(referer);
            const raw = refUrl.searchParams.get('url');
            if (raw) targetOrigin = new URL(raw).origin;
        } catch(e) {}
    }
    const targetUrl = `${targetOrigin}${req.originalUrl}`;
    try {
        const response = await axios.get(targetUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': targetOrigin,
                ...(currentStreamElementsToken ? {
                    'Authorization': `Bearer ${currentStreamElementsToken}`,
                    'Cookie': `id_token_creator=${currentStreamElementsToken}; se-token=${currentStreamElementsToken}; token=${currentStreamElementsToken}`
                } : {})
            },
            timeout: 10000,
            validateStatus: () => true
        });
        let contentType = response.headers['content-type'];
        if (!contentType || contentType === 'application/octet-stream') {
            if (req.path.endsWith('.js')) contentType = 'text/javascript';
            else if (req.path.endsWith('.css')) contentType = 'text/css';
            else if (req.path.endsWith('.json')) contentType = 'application/json';
            else contentType = 'application/octet-stream';
        }
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.removeHeader('X-Frame-Options');
        res.removeHeader('Content-Security-Policy');
        res.status(response.status).send(response.data);
    } catch(e) {
        res.status(404).send('Not Found');
    }
});

// Global tracked origin and asset directory for SPA chunk resolution
let activeProxyOrigin = 'https://streamelements.com';
let activeAssetDir = 'https://streamelements.com/assets/dashboard/';
let currentStreamElementsToken = process.env.STREAMELEMENTS_JWT_TOKEN || '';

// Endpoints to store and retrieve StreamElements JWT Token
app.post('/api/streamelements-token', express.json(), (req, res) => {
    const { token } = req.body || {};
    if (token) {
        currentStreamElementsToken = token.trim();
        process.env.STREAMELEMENTS_JWT_TOKEN = currentStreamElementsToken;
        try {
            const envPath = path.join(__dirname, '.env');
            let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
            if (envContent.includes('STREAMELEMENTS_JWT_TOKEN=')) {
                envContent = envContent.replace(/STREAMELEMENTS_JWT_TOKEN=.*/g, `STREAMELEMENTS_JWT_TOKEN=${currentStreamElementsToken}`);
            } else {
                envContent += `\nSTREAMELEMENTS_JWT_TOKEN=${currentStreamElementsToken}\n`;
            }
            fs.writeFileSync(envPath, envContent);
        } catch(e) {}
        return res.json({ success: true, hasToken: true });
    }
    return res.status(400).json({ error: 'Token is required' });
});

app.get('/api/streamelements-token', (req, res) => {
    res.json({ hasToken: !!currentStreamElementsToken });
});

// Helper to rewrite and sanitize cookies for localhost iframe compatibility
function sanitizeCookiesForProxy(rawCookies) {
    if (!rawCookies) return [];
    const list = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
    return list.map(c => {
        return c
            .replace(/Domain=[^;]+;?\s*/gi, '')
            .replace(/Secure;?\s*/gi, '')
            .replace(/SameSite=[^;]+;?\s*/gi, '')
            .trim() + '; SameSite=None';
    });
}

// === Universal Un-Framing Proxy (Supports GET, POST, Forms, Logins, Cookies) ===
const handleUnframeProxy = async (req, res) => {
    try {
        let targetUrl = req.query.url || (req.body && req.body.url);
        if (!targetUrl) return res.status(400).send('Missing target URL parameter (?url=)');
        if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

        const forwardHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': targetUrl
        };

        if (req.headers['cookie']) {
            forwardHeaders['Cookie'] = req.headers['cookie'];
        }
        if (req.headers['content-type']) {
            forwardHeaders['Content-Type'] = req.headers['content-type'];
        }

        // Attach StreamElements JWT token authentication if targeting StreamElements
        if (targetUrl.includes('streamelements.com')) {
            const seToken = req.headers['x-se-token'] || req.query.se_token || currentStreamElementsToken;
            if (seToken) {
                forwardHeaders['Authorization'] = `Bearer ${seToken}`;
                const cookieParts = [
                    forwardHeaders['Cookie'] || '',
                    `id_token_creator=${seToken}`,
                    `se-token=${seToken}`,
                    `token=${seToken}`
                ].filter(Boolean);
                forwardHeaders['Cookie'] = cookieParts.join('; ');
            }
        }

        const axiosConfig = {
            method: req.method || 'GET',
            url: targetUrl,
            headers: forwardHeaders,
            timeout: 15000,
            responseType: 'text',
            maxRedirects: 5,
            validateStatus: () => true
        };

        // If POST or PUT (e.g. form login submission), serialize and forward payload
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            if (req.is('application/x-www-form-urlencoded')) {
                const querystring = require('querystring');
                axiosConfig.data = querystring.stringify(req.body);
            } else if (req.is('application/json')) {
                axiosConfig.data = req.body;
            } else {
                axiosConfig.data = req.body;
            }
        }

        const response = await axios(axiosConfig);

        // Forward session and login cookies back to client
        if (response.headers['set-cookie']) {
            const rewrittenCookies = sanitizeCookiesForProxy(response.headers['set-cookie']);
            if (rewrittenCookies.length) {
                res.setHeader('Set-Cookie', rewrittenCookies);
            }
        }

        const contentType = response.headers['content-type'] || '';
        // If not HTML (e.g. redirected to image, JSON API response, file download), stream directly
        if (!contentType.includes('text/html')) {
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.removeHeader('X-Frame-Options');
            res.removeHeader('Content-Security-Policy');
            return res.status(response.status).send(response.data);
        }

        let html = response.data;
        if (typeof html === 'string') {
            const parsedTarget = new URL(targetUrl);
            const origin = parsedTarget.origin;
            activeProxyOrigin = origin;
            activeAssetDir = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
            const protocol = (req.headers['x-forwarded-proto'] || req.protocol).split(',')[0].trim();
            const host = req.get('host');
            // Crucial: Use absolute local URLs so <base href> does not hijack them to the remote domain
            const localProxyPrefix = `${protocol}://${host}/api/proxy-asset?url=`;
            const localUnframePrefix = `${protocol}://${host}/api/unframe-proxy?url=`;

            const $ = cheerio.load(html);

            const baseTag = targetUrl.includes('streamelements.com') ? '<base href="/">' : `<base href="${origin}/">`;
            const injectedScripts = `
                ${baseTag}
                <script>
                    (function() {
                        try {
                            // 1. Defeat frame-busters cleanly (no infinite getter recursion)
                            Object.defineProperty(window, 'top', { get: () => window, configurable: true });
                            Object.defineProperty(window, 'parent', { get: () => window, configurable: true });
                            Object.defineProperty(window, 'frameElement', { get: () => null, configurable: true });
                        } catch(e) {}

                        // Safe DOM element retrieval for React createRoot
                        try {
                            const _origGetElem = document.getElementById.bind(document);
                            document.getElementById = function(id) {
                                let el = _origGetElem(id);
                                if (!el && id === 'root') {
                                    el = document.querySelector('#root');
                                    if (!el && document.body) {
                                        el = document.createElement('div');
                                        el.id = 'root';
                                        document.body.prepend(el);
                                    }
                                }
                                return el;
                            };
                        } catch(e) {}

                        ${targetUrl.includes('streamelements.com') && currentStreamElementsToken ? `
                        try {
                            document.cookie = "id_token_creator=${currentStreamElementsToken}; path=/; max-age=31536000";
                            document.cookie = "se-token=${currentStreamElementsToken}; path=/; max-age=31536000";
                            localStorage.setItem("StreamElements.id_token", "${currentStreamElementsToken}");
                            localStorage.setItem("se-token", "${currentStreamElementsToken}");
                            localStorage.setItem("token", "${currentStreamElementsToken}");
                        } catch(e) {}
                        ` : ''}

                        // 2. Intercept fetch for SPAs, React hydration, and dynamic AJAX calls
                        try {
                            const _origFetch = window.fetch;
                            if (_origFetch) {
                                window.fetch = function(resource, init) {
                                    try {
                                        let u = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
                                        if (u && !u.startsWith('data:') && !u.startsWith('blob:')) {
                                            const abs = new URL(u, "${origin}").href;
                                            if (!abs.startsWith("${protocol}://${host}")) {
                                                const proxied = "${localProxyPrefix}" + encodeURIComponent(abs);
                                                if (typeof resource === 'string') {
                                                    return _origFetch(proxied, init);
                                                } else {
                                                    return _origFetch(new Request(proxied, resource), init);
                                                }
                                            }
                                        }
                                    } catch(err) {}
                                    return _origFetch(resource, init);
                                };
                            }
                        } catch(e) {}

                        // 3. Intercept XMLHttpRequest for legacy, analytics, and chunk requests
                        try {
                            const _origXhrOpen = XMLHttpRequest.prototype.open;
                            XMLHttpRequest.prototype.open = function(method, u, ...args) {
                                try {
                                    if (u && typeof u === 'string' && !u.startsWith('data:') && !u.startsWith('blob:')) {
                                        const abs = new URL(u, "${origin}").href;
                                        if (!abs.startsWith("${protocol}://${host}")) {
                                            u = "${localProxyPrefix}" + encodeURIComponent(abs);
                                        }
                                    }
                                } catch(err) {}
                                return _origXhrOpen.call(this, method, u, ...args);
                            };
                        } catch(e) {}

                        // 4. Intercept form submissions dynamically (preserves login actions)
                        window.addEventListener('submit', function(e) {
                            try {
                                const form = e.target;
                                if (form && form.action) {
                                    const abs = new URL(form.action, "${origin}").href;
                                    if (!abs.startsWith("${protocol}://${host}/api/unframe-proxy")) {
                                        form.action = "${localUnframePrefix}" + encodeURIComponent(abs);
                                    }
                                }
                            } catch(err) {}
                        }, true);

                        // 5. OAuth & Popup escape helper
                        function isAuthOrOAuth(u) {
                            if (!u) return false;
                            const s = u.toLowerCase();
                            return s.includes('id.twitch.tv') ||
                                   s.includes('accounts.google.com') ||
                                   s.includes('appleid.apple.com') ||
                                   s.includes('discord.com/oauth2') ||
                                   s.includes('discord.com/api/oauth2') ||
                                   s.includes('facebook.com/dialog/oauth') ||
                                   s.includes('api.streamelements.com/kappa/v2/channels/login') ||
                                   s.includes('auth.streamelements.com') ||
                                   s.includes('/login/twitch') ||
                                   s.includes('/login/youtube') ||
                                   s.includes('twitter.com/i/oauth2') ||
                                   s.includes('steamcommunity.com/openid');
                        }

                        // 6. Support OAuth popup windows escaping iframe restrictions
                        try {
                            const _origOpen = window.open;
                            window.open = function(url, name, specs) {
                                if (url) {
                                    try {
                                        const abs = new URL(url, "${origin}").href;
                                        if (isAuthOrOAuth(abs)) {
                                            return window.parent ? window.parent.open(abs, '_blank', 'noopener,noreferrer') : _origOpen.call(window, abs, '_blank', 'noopener,noreferrer');
                                        }
                                    } catch(err) {}
                                }
                                return _origOpen.apply(window, arguments);
                            };
                        } catch(e) {}

                        // 7. Non-destructive link navigation: do NOT call preventDefault/stopPropagation
                        // so that React/Vue/SPA frameworks and dropdown menus work normally.
                        // Only redirect if it's an OAuth login link.
                        document.addEventListener('click', function(e) {
                            try {
                                let el = e.target;
                                while (el && el.tagName !== 'A' && el !== document.body) {
                                    el = el.parentElement;
                                }
                                if (el && el.tagName === 'A') {
                                    const href = el.getAttribute('href') || el.href;
                                    if (href && isAuthOrOAuth(href)) {
                                        e.preventDefault();
                                        const abs = new URL(href, "${origin}").href;
                                        window.open(abs, '_blank', 'noopener,noreferrer');
                                    }
                                }
                            } catch(err) {}
                        }, false);
                    })();
                </script>
            `;

            // Remove any existing base tags and prepend our proxy base and scripts
            $('base').remove();
            if ($('head').length) {
                $('head').prepend(injectedScripts);
            } else {
                $.root().prepend(injectedScripts);
            }

            // Rewrite ALL link tags (stylesheets, modulepreload, preload, icons, manifests)
            $('link[href]').each((_, el) => {
                const href = $(el).attr('href');
                if (href && !href.startsWith('data:') && !href.startsWith('javascript:')) {
                    try {
                        if (targetUrl.includes('streamelements.com') && href.startsWith('/assets/')) {
                            // Preserve root-relative /assets/ path directly so ES module resolution remains clean
                            return;
                        }
                        const absUrl = new URL(href, targetUrl).href;
                        $(el).attr('href', localProxyPrefix + encodeURIComponent(absUrl));
                        $(el).removeAttr('crossorigin');
                    } catch (e) {}
                }
            });

            // Rewrite script tags and strip crossorigin to force same-origin proxy load
            $('script[src]').each((_, el) => {
                const src = $(el).attr('src');
                if (src && !src.startsWith('data:') && !src.startsWith('javascript:')) {
                    try {
                        if (targetUrl.includes('streamelements.com') && src.startsWith('/assets/')) {
                            // Preserve root-relative /assets/ path directly so ES module resolution remains clean
                            return;
                        }
                        const absUrl = new URL(src, targetUrl).href;
                        $(el).attr('src', localProxyPrefix + encodeURIComponent(absUrl));
                        $(el).removeAttr('crossorigin');
                    } catch (e) {}
                }
            });

            // Rewrite image, audio, video sources
            $('img[src], audio[src], video[src], source[src], iframe[src]').each((_, el) => {
                const src = $(el).attr('src');
                if (src && !src.startsWith('data:') && !src.startsWith('javascript:')) {
                    try {
                        const absUrl = new URL(src, targetUrl).href;
                        $(el).attr('src', localProxyPrefix + encodeURIComponent(absUrl));
                        $(el).removeAttr('crossorigin');
                    } catch (e) {}
                }
            });

            // Rewrite anchor links to navigate within the local proxy using fully-qualified local URLs
            $('a[href]').each((_, el) => {
                const href = $(el).attr('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                    try {
                        const absUrl = new URL(href, targetUrl).href;
                        $(el).attr('href', `${localUnframePrefix}${encodeURIComponent(absUrl)}`);
                        $(el).attr('target', '_self');
                    } catch (e) {}
                }
            });

            // Rewrite form actions to submit to local proxy using fully-qualified local URLs
            $('form[action]').each((_, el) => {
                const action = $(el).attr('action');
                if (action && !action.startsWith('javascript:')) {
                    try {
                        const absUrl = new URL(action, targetUrl).href;
                        $(el).attr('action', `${localUnframePrefix}${encodeURIComponent(absUrl)}`);
                    } catch (e) {}
                }
            });

            // Rewrite inline <style> url(...) calls
            $('style').each((_, el) => {
                let css = $(el).html();
                if (css) {
                    css = css.replace(/url\((['"]?)([^'"\)]+)\1\)/g, (match, quote, url) => {
                        if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) return match;
                        try {
                            const absUrl = new URL(url, targetUrl).href;
                            return `url("${localProxyPrefix}${encodeURIComponent(absUrl)}")`;
                        } catch (e) {
                            return match;
                        }
                    });
                    $(el).html(css);
                }
            });

            html = $.html();
        }

        res.removeHeader('X-Frame-Options');
        res.removeHeader('Content-Security-Policy');
        res.removeHeader('Cross-Origin-Opener-Policy');
        res.removeHeader('Cross-Origin-Embedder-Policy');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (e) {
        const safeUrl = (req.query.url || (req.body && req.body.url) || '').replace(/"/g, '&quot;');
        res.status(500).send(`
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px 20px; text-align: center; background: #12131a; color: #e3e5eb; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; box-sizing: border-box;">
                <div style="font-size: 3rem; margin-bottom: 12px;">🛡️</div>
                <h2 style="margin: 0 0 10px 0; font-size: 1.4rem; color: #ffffff;">Unable to Embed Page Directly</h2>
                <p style="color: #8c92a6; max-width: 460px; line-height: 1.5; margin: 0 0 24px 0; font-size: 0.95rem;">
                    This website enforces strict anti-embedding, bot detection, or requires direct browser login. You can open it in a companion popout window positioned above your chat.
                </p>
                <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center;">
                    <a href="${safeUrl}" target="_blank" style="background: linear-gradient(90deg, #58a6ff, #9146FF); color: white; text-decoration: none; padding: 10px 22px; border-radius: 8px; font-weight: bold; font-size: 0.95rem; box-shadow: 0 4px 14px rgba(88,166,255,0.3);">Open in Popout Window ↗</a>
                    <button onclick="window.location.reload()" style="background: #252838; color: #d0d4e4; border: 1px solid #383c54; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.95rem;">🔄 Retry</button>
                </div>
            </div>
        `);
    }
};

app.all('/api/streamelements-proxy', handleUnframeProxy);
app.all('/api/unframe-proxy', handleUnframeProxy);

// Dedicated route to preserve SPA routing for StreamElements Dashboard & Auth
app.all([
    '/dashboard', '/dashboard/*',
    '/activity-feed',
    '/login', '/login/*',
    '/logout',
    '/account', '/account/*',
    '/overlays', '/overlays/*',
    '/chatstats',
    '/tip', '/tip/*'
], (req, res) => {
    req.query.url = 'https://streamelements.com' + req.originalUrl;
    return handleUnframeProxy(req, res);
});

// === Proxy Asset Endpoint for un-framing proxy (handles GET, POST, OPTIONS, and chunk fallback) ===
app.all('/api/proxy-asset', async (req, res) => {
    try {
        let targetUrl = req.query.url;
        if (!targetUrl) return res.status(400).send('Missing target URL parameter (?url=)');
        if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
        activeProxyOrigin = new URL(targetUrl).origin;
        activeAssetDir = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

        const forwardHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': targetUrl
        };
        if (req.headers['cookie']) {
            forwardHeaders['Cookie'] = req.headers['cookie'];
        }
        if (req.headers['content-type']) {
            forwardHeaders['Content-Type'] = req.headers['content-type'];
        }

        if (targetUrl.includes('streamelements.com') && currentStreamElementsToken) {
            forwardHeaders['Authorization'] = `Bearer ${currentStreamElementsToken}`;
            const cp = [
                forwardHeaders['Cookie'] || '',
                `id_token_creator=${currentStreamElementsToken}`,
                `se-token=${currentStreamElementsToken}`,
                `token=${currentStreamElementsToken}`
            ].filter(Boolean);
            forwardHeaders['Cookie'] = cp.join('; ');
        }

        const axiosConfig = {
            method: req.method || 'GET',
            url: targetUrl,
            responseType: 'arraybuffer',
            headers: forwardHeaders,
            timeout: 15000,
            validateStatus: () => true
        };

        if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
            axiosConfig.data = req.body;
        }

        let response = await axios(axiosConfig);

        // Fallback for CDN asset chunks (e.g. if kick.com/static/chunks/... returns HTML fallback)
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        if (targetUrl.includes('kick.com/static/chunks/') && contentType.includes('text/html')) {
            const chunkName = targetUrl.split('/chunks/').pop();
            try {
                const cdnUrl = `https://assets.kick.com/main/_next/static/chunks/${chunkName}`;
                const cdnResp = await axios({ ...axiosConfig, url: cdnUrl });
                if (cdnResp.status === 200 && !cdnResp.headers['content-type'].includes('text/html')) {
                    response = cdnResp;
                }
            } catch(e) {}
        }

        // Forward and sanitize cookies from assets if any
        if (response.headers['set-cookie']) {
            const rewrittenCookies = sanitizeCookiesForProxy(response.headers['set-cookie']);
            if (rewrittenCookies.length) {
                res.setHeader('Set-Cookie', rewrittenCookies);
            }
        }

        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.removeHeader('X-Frame-Options');
        res.removeHeader('Content-Security-Policy');
        res.status(response.status).send(response.data);
    } catch (e) {
        res.status(500).send('Proxy Asset Error: ' + e.message);
    }
});

// Dynamic chunk proxy for Single Page Apps (Vite/React/Webpack like StreamElements, Kick, etc.)
app.all(['/api/*.js', '/api/*.css', '/api/*.json', '/api/*.svg', '/api/*.png', '/api/*.woff2', '/*.js', '/*.css', '/*.json'], async (req, res, next) => {
    const localFile = path.join(__dirname, 'public', req.path.replace(/^\/api\//, '/'));
    if (fs.existsSync(localFile)) {
        return next();
    }

    const referer = req.headers['referer'] || '';
    let targetOrigin = activeProxyOrigin || 'https://streamelements.com';
    let refDir = activeAssetDir || `${targetOrigin}/assets/dashboard/`;

    if (referer.includes('url=')) {
        try {
            const rUrl = new URL(referer);
            const originalTarget = rUrl.searchParams.get('url');
            if (originalTarget) {
                targetOrigin = new URL(originalTarget).origin;
                refDir = originalTarget.substring(0, originalTarget.lastIndexOf('/') + 1);
            }
        } catch(e) {}
    }

    const cleanPath = req.path.replace(/^\/api\//, '/').replace(/^\//, '');

    const candidateUrls = [
        // 1. Direct from known SPA asset directories (immediate 200 hit, zero delays)
        `${targetOrigin}/assets/dashboard/${cleanPath}`,
        `${targetOrigin}/assets/homepage/${cleanPath}`,
        `${targetOrigin}/assets/${cleanPath}`,
        // 2. Resolve relative to the active asset directory path (e.g. https://streamelements.com/assets/dashboard/...)
        new URL(cleanPath, refDir).href,
        // 3. Direct from target origin
        `${targetOrigin}/${cleanPath}`
    ];

    for (const candidate of candidateUrls) {
        try {
            const response = await axios.get(candidate, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': targetOrigin,
                    ...(targetOrigin.includes('streamelements.com') && currentStreamElementsToken ? {
                        'Authorization': `Bearer ${currentStreamElementsToken}`,
                        'Cookie': `id_token_creator=${currentStreamElementsToken}; se-token=${currentStreamElementsToken}; token=${currentStreamElementsToken}`
                    } : {})
                },
                timeout: 8000,
                validateStatus: () => true
            });

            const ct = response.headers['content-type'] || '';
            if (response.status === 200 && !ct.includes('text/html')) {
                let finalContentType = ct;
                if (req.path.endsWith('.js')) finalContentType = 'text/javascript';
                else if (req.path.endsWith('.css')) finalContentType = 'text/css';
                else if (req.path.endsWith('.json')) finalContentType = 'application/json';

                res.setHeader('Content-Type', finalContentType);
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.removeHeader('X-Frame-Options');
                res.removeHeader('Content-Security-Policy');
                return res.status(200).send(response.data);
            }
        } catch (err) {}
    }
    next();
});

// === Iframe Compatibility Check ===
// Returns { allowed: bool } so the client can auto-enable proxy mode if needed
app.get('/api/check-iframe-compat', async (req, res) => {
    try {
        let targetUrl = req.query.url;
        if (!targetUrl) return res.json({ allowed: true });
        if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

        // YouTube embed URLs are always allowed
        try {
            const parsed = new URL(targetUrl);
            const host = parsed.hostname.replace('www.', '');
            if ((host === 'youtube.com' || host === 'youtu.be') && parsed.pathname.startsWith('/embed/')) {
                return res.json({ allowed: true });
            }
        } catch (e) {}

        // Do a HEAD request (fallback to GET) to read response headers only
        let headers = {};
        try {
            const headResp = await axios.head(targetUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
                timeout: 7000,
                maxRedirects: 5,
                validateStatus: () => true
            });
            headers = headResp.headers || {};
        } catch (e) {
            // HEAD failed, try GET with no body
            try {
                const getResp = await axios.get(targetUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
                    timeout: 7000,
                    maxRedirects: 5,
                    responseType: 'stream',
                    validateStatus: () => true
                });
                headers = getResp.headers || {};
                getResp.data.destroy(); // Don't read the body
            } catch (e2) {
                // Can't reach site — assume allowed, direct load will fail visibly
                return res.json({ allowed: true });
            }
        }

        const xfo = (headers['x-frame-options'] || '').toLowerCase();
        const csp = (headers['content-security-policy'] || '').toLowerCase();

        // Blocked if X-Frame-Options is DENY or SAMEORIGIN
        const blockedByXFO = xfo === 'deny' || xfo === 'sameorigin';

        // Blocked if CSP frame-ancestors doesn't include a wildcard
        let blockedByCSP = false;
        if (csp.includes('frame-ancestors')) {
            const faMatch = csp.match(/frame-ancestors\s+([^;]+)/);
            if (faMatch) {
                const faValue = faMatch[1].trim();
                blockedByCSP = !faValue.includes("'none'") === false || (!faValue.includes('*') && !faValue.includes('http'));
                // Simpler: if it doesn't have * it's likely restricted
                blockedByCSP = !faValue.includes('*');
            }
        }

        const allowed = !blockedByXFO && !blockedByCSP;
        res.json({ allowed });
    } catch (e) {
        res.json({ allowed: true }); // Default to allowed on error
    }
});

app.get('/api/proxy-asset', async (req, res) => {
    try {
        const assetUrl = req.query.url;
        if (!assetUrl) return res.status(400).send('Missing URL');

        const response = await axios.get(assetUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            },
            timeout: 10000
        });

        let contentType = response.headers['content-type'] || '';
        const cleanUrl = assetUrl.split('?')[0].toLowerCase();
        if (cleanUrl.endsWith('.css')) contentType = 'text/css; charset=utf-8';
        else if (cleanUrl.endsWith('.js') || cleanUrl.endsWith('.mjs')) contentType = 'application/javascript; charset=utf-8';
        else if (cleanUrl.endsWith('.svg')) contentType = 'image/svg+xml';
        else if (cleanUrl.endsWith('.png')) contentType = 'image/png';
        else if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) contentType = 'image/jpeg';
        else if (cleanUrl.endsWith('.woff2')) contentType = 'font/woff2';
        else if (cleanUrl.endsWith('.woff')) contentType = 'font/woff';
        else if (!contentType) contentType = 'application/octet-stream';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.send(Buffer.from(response.data));
    } catch (e) {
        res.status(404).send('Asset Proxy Error');
    }
});





let globalOverlaySettings = {};

// === GLOBAL POLL STATE MANAGER ===
let activePoll = null;
let pollTimerTimeout = null;
let pollHideTimeout = null;

function processPollVote(platform, username, text) {
    if (!activePoll || !activePoll.active || activePoll.ended) return;
    if (!text || !username) return;

    // Check platform filter if specified
    if (activePoll.targetPlatform && activePoll.targetPlatform !== 'all') {
        if (platform.toLowerCase() !== activePoll.targetPlatform.toLowerCase()) return;
    }

    const trimmedText = text.trim().toLowerCase();
    const userKey = `${platform.toLowerCase()}:${username.toLowerCase()}`;

    let matchedOptionId = null;

    activePoll.options.forEach((opt, idx) => {
        const kw = (opt.keyword || '').trim().toLowerCase();
        const indexStr = (idx + 1).toString();
        
        if (trimmedText === kw || trimmedText === indexStr || trimmedText === `!vote ${kw}` || trimmedText === `!vote ${indexStr}`) {
            matchedOptionId = opt.id;
        }
    });

    if (matchedOptionId !== null) {
        const previousVote = activePoll.voterMap.get(userKey);

        if (previousVote === matchedOptionId) return; // Same vote

        if (previousVote !== undefined) {
            const prevOpt = activePoll.options.find(o => o.id === previousVote);
            if (prevOpt && prevOpt.votes > 0) prevOpt.votes -= 1;
        }

        const newOpt = activePoll.options.find(o => o.id === matchedOptionId);
        if (newOpt) {
            newOpt.votes += 1;
            activePoll.voterMap.set(userKey, matchedOptionId);
            activePoll.totalVotes = activePoll.voterMap.size;

            io.emit('pollUpdate', getPollPayload());
        }
    }
}

function finalizeAndSchedulePollRemoval() {
    if (!activePoll || activePoll.ended) return;

    if (pollTimerTimeout) clearTimeout(pollTimerTimeout);
    if (pollHideTimeout) clearTimeout(pollHideTimeout);

    activePoll.ended = true;
    io.emit('pollEnd', getPollPayload());

    // Remove overlay & reset poll state 10 seconds after poll ends
    pollHideTimeout = setTimeout(() => {
        if (activePoll) {
            activePoll = { active: false };
            io.emit('pollState', getPollPayload());
            io.emit('pollCleared');
        }
    }, 10000);
}

let currentPollFont = 'Press Start 2P';

function getPollPayload() {
    if (!activePoll) return { active: false, font: currentPollFont };
    return {
        active: activePoll.active,
        ended: activePoll.ended,
        title: activePoll.title,
        options: activePoll.options ? activePoll.options.map(o => ({ id: o.id, label: o.label, keyword: o.keyword, votes: o.votes })) : [],
        totalVotes: activePoll.totalVotes || 0,
        duration: activePoll.duration,
        endTime: activePoll.endTime,
        targetPlatform: activePoll.targetPlatform || 'all',
        font: activePoll.font || currentPollFont
    };
}

io.on('connection', (socket) => {
    let tiktokConnectionWrapper = null;
    let kickChatClient = null;
    let kickSessionId = 0;
    let twitchChatClient = null;

    console.info('New connection from origin', socket.handshake.headers['origin'] || socket.handshake.headers['referer']);

    // Send poll state on connect
    socket.emit('pollState', getPollPayload());

    socket.on('getPollState', () => {
        socket.emit('pollState', getPollPayload());
    });

    socket.on('updatePollFont', ({ font }) => {
        if (font) {
            currentPollFont = font;
            if (activePoll) {
                activePoll.font = font;
            }
            io.emit('pollFontChanged', { font });
            io.emit('pollUpdate', getPollPayload());
        }
    });

    socket.on('createPoll', ({ title, options, duration, targetPlatform, font }) => {
        if (pollTimerTimeout) clearTimeout(pollTimerTimeout);
        if (pollHideTimeout) clearTimeout(pollHideTimeout);

        if (font) currentPollFont = font;

        const formattedOptions = (options || []).map((opt, i) => ({
            id: i + 1,
            label: opt.label || `Option ${i + 1}`,
            keyword: opt.keyword || (i + 1).toString(),
            votes: 0
        }));

        const durationSec = parseInt(duration) || 0;
        const endTime = durationSec > 0 ? Date.now() + (durationSec * 1000) : null;

        activePoll = {
            active: true,
            ended: false,
            title: title || 'Live Stream Poll',
            options: formattedOptions,
            totalVotes: 0,
            voterMap: new Map(),
            duration: durationSec,
            endTime: endTime,
            targetPlatform: targetPlatform || 'all',
            font: currentPollFont
        };

        if (endTime) {
            pollTimerTimeout = setTimeout(() => {
                finalizeAndSchedulePollRemoval();
            }, durationSec * 1000);
        }

        io.emit('pollCreated', getPollPayload());
        io.emit('pollUpdate', getPollPayload());
    });

    socket.on('endPoll', () => {
        finalizeAndSchedulePollRemoval();
    });

    socket.on('testEvent', (data) => {
        console.log('[Test] testEvent received:', data);
        socket.emit('testEvent', { message: 'Backend received your test event!', timestamp: new Date().toISOString() });
    });

    socket.on('disconnectKick', () => {
        if (kickChatClient) {
            try { kickChatClient.disconnect(); } catch (e) {}
            kickChatClient = null;
        }
        socket.emit('kickDisconnected', 'Disconnected');
    });

    socket.on('disconnectTwitch', () => {
        if (twitchChatClient) {
            try { twitchChatClient.disconnect(); } catch (e) {}
            twitchChatClient = null;
        }
        socket.emit('twitchDisconnected', 'Disconnected');
    });

    socket.on('disconnectTikTok', () => {
        if (tiktokConnectionWrapper) {
            tiktokConnectionWrapper.disconnect();
            tiktokConnectionWrapper = null;
        }
        socket.emit('tiktokDisconnected', 'Disconnected');
    });

    // Send initial settings to the new client
    socket.emit('overlaySettingsUpdated', globalOverlaySettings);

    // TIKTOK CHAT HANDLING
    socket.on('updateOverlaySettings', (settings) => {
        globalOverlaySettings = settings;
        io.emit('overlaySettingsUpdated', settings);
    });

    socket.on('refreshOverlay', () => {
        io.emit('refreshOverlay');
    });

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
            options.session = {
                cookie: {
                    value: {
                        sessionId: process.env.SESSIONID
                    }
                }
            };
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

        tiktokConnectionWrapper.on('connected', state => {
            console.log(`[TikTok] Connected to: ${state.roomId}`);
            socket.emit('tiktokConnected', state);
        });

        tiktokConnectionWrapper.on('disconnected', reason => {
            console.log(`[TikTok] Disconnected: ${reason}`);
            socket.emit('tiktokDisconnected', reason);
        });

        const extractUserInfo = (data) => {
            const user = data.user || data;
            let profilePictureUrl = '';
            if (user.avatarThumb && user.avatarThumb.urlList && user.avatarThumb.urlList.length > 0) {
                profilePictureUrl = user.avatarThumb.urlList[0];
            } else if (data.profilePictureUrl) {
                profilePictureUrl = data.profilePictureUrl;
            }
            return {
                uniqueId: user.displayId || user.uniqueId || '',
                nickname: user.nickname || '',
                profilePictureUrl: profilePictureUrl
            };
        };

        const emitTikTok = (eventName, data) => {
            if (!data) return;
            const userInfo = extractUserInfo(data);
            const emitData = {
                ...data,
                ...userInfo,
                comment: data.content || data.comment || ''
            };
            if (eventName === 'gift') {
                if (data.gift) {
                    emitData.giftId = data.gift.id || data.giftId;
                    emitData.giftName = data.gift.name || data.giftName;
                    emitData.diamondCount = data.gift.diamondCount || data.diamondCount;
                }
            }
            socket.emit(eventName, emitData);
        };

        // Forward events to the client using the shim
        tiktokConnectionWrapper.connection.on('chat', (data) => {
            if (data) processPollVote('tiktok', data.uniqueId || data.nickname, data.comment || data.content || '');
            emitTikTok('chat', data);
        });
        tiktokConnectionWrapper.connection.on('member', (data) => emitTikTok('member', data));
        tiktokConnectionWrapper.connection.on('gift', (data) => emitTikTok('gift', data));
        tiktokConnectionWrapper.connection.on('roomUser', (data) => {
            socket.emit('roomUser', data);
        });
        tiktokConnectionWrapper.connection.on('like', (data) => {
            if (data.likeCount === undefined && data.count !== undefined) {
                data.likeCount = data.count;
            }
            emitTikTok('like', data);
        });
        tiktokConnectionWrapper.connection.on('social', (data) => emitTikTok('social', data));
        
        // Ensure streamEnd is forwarded properly
        tiktokConnectionWrapper.connection.on('streamEnd', () => socket.emit('streamEnd'));
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
    
    socket.on('setKickLink', async (kickLink, providedChatroomId) => {
        try {
            if (!kickLink) return;
            
            let channelSlug = kickLink.trim();
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
            const match = kickLink.match(/kick\.com\/([A-Za-z0-9_]+)/i);
            if (match) {
                channelSlug = match[1];
            }
            if (!channelSlug) {
                socket.emit('kickDisconnected', 'Invalid Kick link');
                return;
            }
            channelSlug = channelSlug.toLowerCase();

            console.log(`[Kick] Attempting to connect to ${channelSlug} (original input: ${kickLink}, providedChatroomId: ${providedChatroomId})`);

            if (providedChatroomId) {
                console.log(`[Kick] Using chatroomId from frontend: ${providedChatroomId}`);
                socket.emit('kickConnected', { channelSlug });
                startKickChatClient(channelSlug, thisSessionId, providedChatroomId);
                return;
            }

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
                
                let fetchedChatroomId = null;
                console.log(`[Kick] Trying Puppeteer to fetch chatroom ID...`);
                try {
                    const browser = await puppeteer.launch({
                        headless: "new",
                        args: process.env.PUPPETEER_ARGS ? process.env.PUPPETEER_ARGS.split(' ') : ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
                    });
                    const page = await browser.newPage();
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                    await page.goto(`https://kick.com/api/v1/channels/${channelSlug}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    const content = await page.evaluate(() => {
                        const pre = document.querySelector('pre');
                        return pre ? pre.innerText : document.body.innerText;
                    });
                    const data = JSON.parse(content);
                    if (data && (data.chatroom?.id || data.chatroom_id || data.id)) {
                        fetchedChatroomId = data.chatroom?.id || data.chatroom_id || data.id;
                        console.log(`[Kick] Puppeteer fetched chatroom ID: ${fetchedChatroomId}`);
                    }
                    await browser.close();
                } catch (puppeteerErr) {
                    console.error(`[Kick] Puppeteer also failed to fetch chatroomId:`, puppeteerErr.message);
                }

                console.log(`[Kick] Proceeding with connection despite API failure`);
                socket.emit('kickConnected', { channelSlug });
                
                // Start Kick chat client anyway
                startKickChatClient(channelSlug, thisSessionId, fetchedChatroomId);
            }
            
        } catch (error) {
            console.error(`[Kick] Error setting up Kick connection:`, error);
            socket.emit('kickDisconnected', `Error setting up connection: ${error.message}`);
        }
    });

    // Kick chat client setup
    async function startKickChatClient(channelSlug, sessionId, chatroomId = null) {
        try {
            console.log(`[Kick] Starting chat client for ${channelSlug} using Fallback method`);
            
            // Bypass the official library because Cloudflare blocks Puppeteer and crashes the Node.js process
            kickChatClient = new KickChatFallback(channelSlug, chatroomId);
            kickChatClient.isFallback = true;
            await kickChatClient.connect();
            
            // Set up event handlers
            kickChatClient.on('ChatMessage', (msg) => {
                if (socket.currentKickSessionId !== sessionId) {
                    return;
                }
                
                if (msg.sender && msg.sender.username && msg.content) {
                    processPollVote('kick', msg.sender.username, msg.content);
                }

                console.log(`[Kick] Chat message received:`, msg);
                
                // Fetch avatar asynchronously to avoid delaying chat messages!
                if (msg.sender && msg.sender.username) {
                    const lowerUser = msg.sender.username.toLowerCase();
                    if (kickAvatarCache.has(lowerUser)) {
                        msg.sender.profilePic = kickAvatarCache.get(lowerUser);
                    } else {
                        // Provide default fallback immediately
                        let defaultNum = 1;
                        let hash = 0;
                        for (let i = 0; i < msg.sender.username.length; i++) {
                            hash = msg.sender.username.charCodeAt(i) + ((hash << 5) - hash);
                        }
                        defaultNum = Math.abs(hash % 6) + 1;
                        msg.sender.profilePic = `https://kick.com/img/default-profile-pictures/default-avatar-${defaultNum}.webp`;
                        
                        // Fetch in background and notify client if it changes
                        fetchKickAvatar(msg.sender.username).then(url => {
                            if (url && url !== msg.sender.profilePic) {
                                io.emit('updateKickAvatar', { username: msg.sender.username, url });
                            }
                        }).catch(() => {});
                    }
                }
                
                // Enhanced badge processing
                let badges = [];
                if (msg.badges && Array.isArray(msg.badges)) {
                    badges = msg.badges;
                } else if (msg.sender && msg.sender.badges && Array.isArray(msg.sender.badges)) {
                    badges = msg.sender.badges;
                }
                
                // Attach custom sub badge image URL if available
                const channelSubBadges = kickSubBadgeCache.get(channelSlug.toLowerCase()) || [];
                badges = badges.map(b => {
                    if ((b.type === 'subscriber' || b.name === 'subscriber') && (!b.icon_url && !b.url && !b.badge_url)) {
                        const months = b.count || b.months || 1;
                        let matched = null;
                        for (const cb of channelSubBadges) {
                            if (cb.months <= months) {
                                matched = cb;
                            }
                        }
                        if (!matched && channelSubBadges.length > 0) matched = channelSubBadges[0];
                        if (matched && matched.url) {
                            return {
                                ...b,
                                icon_url: matched.url,
                                badge_url: matched.url
                            };
                        }
                    }
                    return b;
                });
                
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

            kickChatClient.on('GiftedSubscriptions', (gift) => {
                if (socket.currentKickSessionId !== sessionId) {
                    return;
                }
                
                console.log(`[Kick] Gifted Subscriptions received:`, gift);
                socket.emit('kickGiftedSubscriptions', {
                    data: gift,
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

    // TWITCH CHAT HANDLING
    socket.on('setTwitchChannel', (channelName) => {
        if (!channelName) return;
        console.log(`[Twitch] Attempting to connect to ${channelName}`);
        
        if (twitchChatClient) {
            twitchChatClient.disconnect().catch(() => {});
        }

        twitchChatClient = new tmi.Client({
            channels: [ channelName ]
        });

        twitchChatClient.connect().then(async () => {
            console.log(`[Twitch] Connected to ${channelName}`);
            
            let roomId = null;
            try {
                if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_ACCESS_TOKEN) {
                    const userRes = await axios.get(`https://api.twitch.tv/helix/users?login=${channelName}`, {
                        headers: {
                            'Client-ID': process.env.TWITCH_CLIENT_ID,
                            'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                        }
                    });
                    if (userRes.data && userRes.data.data && userRes.data.data.length > 0) {
                        roomId = userRes.data.data[0].id;
                    }
                }
            } catch (err) {
                console.error(`[Twitch] Failed to fetch roomId for ${channelName}:`, err.message);
            }

            socket.emit('twitchConnected', { channelName, roomId });
        }).catch((err) => {
            console.error(`[Twitch] Connection error for ${channelName}:`, err);
            socket.emit('twitchDisconnected', 'Error connecting to Twitch channel.');
        });

        twitchChatClient.on('message', async (channel, tags, message, self) => {
            if (self) return;
            
            const username = tags.username || tags['display-name'];
            processPollVote('twitch', username, message);
            const profilePic = await fetchTwitchAvatar(username);
            
            socket.emit('twitchChat', {
                channel: channel,
                tags: tags,
                message: message,
                timestamp: Date.now(),
                profilePic: profilePic,
                username: username
            });
        });
        
        twitchChatClient.on('disconnected', (reason) => {
            console.log(`[Twitch] Disconnected from ${channelName}: ${reason}`);
            socket.emit('twitchDisconnected', reason);
        });

        twitchChatClient.on('timeout', (channel, username, reason, duration, userstate) => {
            socket.emit('twitchTimeout', { username, duration });
        });

        twitchChatClient.on('ban', (channel, username, reason, userstate) => {
            socket.emit('twitchBan', { username });
        });

        twitchChatClient.on('messagedeleted', (channel, username, deletedMessage, userstate) => {
            const msgId = userstate['target-msg-id'];
            io.emit('twitchMessageDeleted', { username, messageId: msgId });
        });

        twitchChatClient.on('clearchat', (channel) => {
            socket.emit('twitchClearChat');
        });
    });

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

        // Clean up Twitch chat client
        if (twitchChatClient) {
            twitchChatClient.disconnect().catch(() => {});
            twitchChatClient = null;
        }
    });
});

// Emit global connection statistics
setInterval(() => {
    io.emit('statistic', { globalConnectionCount: getGlobalConnectionCount() });
}, 5000)



// TWITCH MODERATION ENDPOINT
app.post('/api/twitch/moderate', async (req, res) => {
    const { action, targetUserId, broadcasterId, messageId, duration: reqDuration, reason: reqReason } = req.body;
    
    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_ACCESS_TOKEN) {
        return res.status(400).json({ error: 'Twitch API credentials not configured in .env' });
    }

    try {
        // Fetch moderator ID if not cached
        if (!global.twitchModeratorId) {
            const userRes = await axios.get('https://api.twitch.tv/helix/users', {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                }
            });
            if (userRes.data && userRes.data.data && userRes.data.data.length > 0) {
                global.twitchModeratorId = userRes.data.data[0].id;
            } else {
                throw new Error("Could not fetch user ID from access token.");
            }
        }

        const modId = global.twitchModeratorId;

        if (action === 'delete') {
            await axios.delete(`https://api.twitch.tv/helix/moderation/chat?broadcaster_id=${broadcasterId}&moderator_id=${modId}&message_id=${messageId}`, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                }
            });
            io.emit('twitchMessageDeleted', { username: '', messageId: messageId });
            return res.json({ success: true });
        } else if (action === 'clear') {
            await axios.delete(`https://api.twitch.tv/helix/moderation/chat?broadcaster_id=${broadcasterId}&moderator_id=${modId}`, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                }
            });
            return res.json({ success: true });
        } else if (action === 'timeout' || action === 'ban') {
            const duration = action === 'timeout' ? (reqDuration || 600) : undefined; // Use requested duration or default to 10 minutes
            
            await axios.post(`https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${modId}`, {
                data: {
                    user_id: targetUserId,
                    duration: duration,
                    reason: reqReason || "Moderated via Chat Reader"
                }
            }, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            return res.json({ success: true });
        } else if (action === 'unban') {
            await axios.delete(`https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${modId}&user_id=${targetUserId}`, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                }
            });
            return res.json({ success: true });
        } else if (action === 'vip') {
            await axios.post(`https://api.twitch.tv/helix/channels/vips?broadcaster_id=${broadcasterId}&user_id=${targetUserId}`, null, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                }
            });
            return res.json({ success: true });
        } else if (action === 'unvip') {
            await axios.delete(`https://api.twitch.tv/helix/channels/vips?broadcaster_id=${broadcasterId}&user_id=${targetUserId}`, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                }
            });
            return res.json({ success: true });
        } else if (action === 'shoutout') {
            await axios.post(`https://api.twitch.tv/helix/chat/shoutouts?from_broadcaster_id=${broadcasterId}&to_broadcaster_id=${targetUserId}&moderator_id=${modId}`, null, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                }
            });
            return res.json({ success: true });
        } else if (action === 'warning') {
            await axios.post(`https://api.twitch.tv/helix/moderation/warnings?broadcaster_id=${broadcasterId}&moderator_id=${modId}`, {
                data: {
                    user_id: targetUserId,
                    reason: reqReason || "Warning via Chat Reader"
                }
            }, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            return res.json({ success: true });
        }
        
        return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
        console.error('[Twitch] Moderation Error:', error.response?.data || error.message);
        const errMsg = error.response?.data?.message || error.message;
        const isScopeError = errMsg.includes('Missing scope') || (error.response?.status === 401 || error.response?.status === 403);
        
        if (isScopeError) {
            return res.status(403).json({ 
                error: `${errMsg}. Please click "Logout Twitch ❌" and then "Authorize Twitch 🔑" to update your account permissions.`,
                needsReauth: true 
            });
        }
        
        return res.status(500).json({ error: errMsg });
    }
});

// TWITCH BANNED USERS ENDPOINT

// TWITCH CHAT ENDPOINT
app.post('/api/twitch/chat', async (req, res) => {
    const { broadcasterId, message, replyMessageId } = req.body;
    
    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_ACCESS_TOKEN) {
        return res.status(400).json({ error: 'Twitch API credentials not configured in .env' });
    }

    try {
        if (!global.twitchModeratorId) {
            const userRes = await axios.get('https://api.twitch.tv/helix/users', {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                }
            });
            if (userRes.data && userRes.data.data && userRes.data.data.length > 0) {
                global.twitchModeratorId = userRes.data.data[0].id;
            } else {
                throw new Error("Could not fetch user ID from access token.");
            }
        }

        const payload = {
            broadcaster_id: broadcasterId,
            sender_id: global.twitchModeratorId,
            message: message
        };
        
        if (replyMessageId) {
            payload.reply_parent_message_id = replyMessageId;
        }

        await axios.post('https://api.twitch.tv/helix/chat/messages', payload, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        return res.json({ success: true });
    } catch (error) {
        console.error('[Twitch] Chat Send Error:', error.response?.data || error.message);
        return res.status(500).json({ error: error.response?.data?.message || error.message });
    }
});

// TWITCH PINS ENDPOINT
app.get('/api/twitch/pins/:broadcasterId', async (req, res) => {
    const { broadcasterId } = req.params;
    
    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_ACCESS_TOKEN) {
        return res.status(400).json({ error: 'Twitch API credentials not configured in .env' });
    }

    try {
        if (!global.twitchModeratorId) {
            const userRes = await axios.get('https://api.twitch.tv/helix/users', {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                }
            });
            if (userRes.data && userRes.data.data && userRes.data.data.length > 0) {
                global.twitchModeratorId = userRes.data.data[0].id;
            } else {
                throw new Error("Could not fetch user ID from access token.");
            }
        }

        const modId = global.twitchModeratorId;

        const response = await axios.get(`https://api.twitch.tv/helix/chat/pins?broadcaster_id=${broadcasterId}&moderator_id=${modId}`, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
            }
        });
        
        return res.json({ data: response.data.data });
    } catch (error) {
        if (error.response?.status !== 401 && error.response?.status !== 404) {
            console.error('[Twitch] Get Pins Error:', error.response?.data || error.message);
        }
        return res.status(200).json({ data: [] }); 
    }
});

app.post('/api/twitch/pins', async (req, res) => {
    const { broadcasterId, messageId, action } = req.body;
    
    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_ACCESS_TOKEN) {
        return res.status(400).json({ error: 'Twitch API credentials not configured in .env' });
    }

    if (!messageId) {
        return res.status(400).json({ error: 'messageId is required to pin or unpin' });
    }

    try {
        if (!global.twitchModeratorId) {
            const userRes = await axios.get('https://api.twitch.tv/helix/users', {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                }
            });
            if (userRes.data && userRes.data.data && userRes.data.data.length > 0) {
                global.twitchModeratorId = userRes.data.data[0].id;
            } else {
                throw new Error("Could not fetch user ID from access token.");
            }
        }

        const modId = global.twitchModeratorId;
        
        if (action === 'pin') {
            // Pin message
            await axios.put(`https://api.twitch.tv/helix/chat/pins?broadcaster_id=${broadcasterId}&moderator_id=${modId}&message_id=${messageId}`, {}, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                }
            });
        } else if (action === 'unpin') {
            // Unpin message
            await axios.delete(`https://api.twitch.tv/helix/chat/pins?broadcaster_id=${broadcasterId}&moderator_id=${modId}&message_id=${messageId}`, {
                headers: {
                    'Client-ID': process.env.TWITCH_CLIENT_ID,
                    'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
                }
            });
        } else {
            return res.status(400).json({ error: 'Invalid action. Must be "pin" or "unpin".' });
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('[Twitch] Post/Delete Pins Error:', error.response?.data || error.message);
        return res.status(500).json({ error: error.response?.data?.message || error.message });
    }
});

let twitchAppAccessToken = null;
let twitchAppAccessTokenExpiry = 0;

async function getTwitchAuthHeaders() {
    if (!process.env.TWITCH_CLIENT_ID) return null;
    
    // Check if process.env.TWITCH_ACCESS_TOKEN exists and is set
    let token = process.env.TWITCH_ACCESS_TOKEN;

    // If TWITCH_CLIENT_SECRET is available and token is missing or we want App Access Token:
    if (!token && process.env.TWITCH_CLIENT_SECRET) {
        if (twitchAppAccessToken && Date.now() < twitchAppAccessTokenExpiry) {
            token = twitchAppAccessToken;
        } else {
            try {
                const tokenRes = await axios.post(`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`);
                if (tokenRes.data && tokenRes.data.access_token) {
                    twitchAppAccessToken = tokenRes.data.access_token;
                    twitchAppAccessTokenExpiry = Date.now() + ((tokenRes.data.expires_in - 60) * 1000);
                    token = twitchAppAccessToken;
                }
            } catch (e) {
                console.error('[Twitch] Failed to generate App Access Token:', e.message);
            }
        }
    }

    if (!token) return null;

    return {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${token}`
    };
}

app.get('/api/twitch/auth/url', (req, res) => {
    if (!process.env.TWITCH_CLIENT_ID) {
        return res.status(400).json({ error: 'TWITCH_CLIENT_ID not configured in .env' });
    }
    const scopes = 'moderator:manage:chat_messages moderator:manage:banned_users channel:manage:vips channel:manage:moderators channel:manage:broadcast channel:manage:raids channel:edit:commercial user:bot channel:bot user:read:email chat:read chat:edit user:write:chat channel:moderate moderation:read moderator:read:chatters user:edit:broadcast moderator:read:followers channel:read:ads';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    const redirectUri = `${protocol}://${host}/twitch-callback.html`;
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=token&scope=${encodeURIComponent(scopes)}`;
    res.json({ url: authUrl });
});

app.get('/api/twitch/auth/status', async (req, res) => {
    const hasToken = !!process.env.TWITCH_ACCESS_TOKEN;
    if (!hasToken) return res.json({ authorized: false });
    
    try {
        const axios = require('axios');
        const response = await axios.get('https://api.twitch.tv/helix/users', {
            headers: {
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        });
        const user = response.data.data[0];
        res.json({ authorized: true, username: user.login, displayName: user.display_name || user.login });
    } catch (e) {
        res.json({ authorized: false });
    }
});

app.post('/api/twitch/auth', (req, res) => {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    // Update process.env
    process.env.TWITCH_ACCESS_TOKEN = token;
    
    // Update .env file
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('TWITCH_ACCESS_TOKEN=')) {
            envContent = envContent.replace(/TWITCH_ACCESS_TOKEN=.*/g, `TWITCH_ACCESS_TOKEN=${token}`);
        } else {
            envContent += `\nTWITCH_ACCESS_TOKEN=${token}`;
        }
        fs.writeFileSync(envPath, envContent);
    } else {
        fs.writeFileSync(envPath, `TWITCH_ACCESS_TOKEN=${token}`);
    }

    // Reset the cached moderator ID so it is re-fetched with the new token
    global.twitchModeratorId = null;

    res.json({ success: true });
});

app.post('/api/twitch/auth/logout', (req, res) => {
    process.env.TWITCH_ACCESS_TOKEN = '';
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        envContent = envContent.replace(/TWITCH_ACCESS_TOKEN=.*/g, 'TWITCH_ACCESS_TOKEN=');
        fs.writeFileSync(envPath, envContent);
    }
    global.twitchModeratorId = null;
    res.json({ success: true });
});

// === KICK OAUTH & CHANNEL ENDPOINTS ===
const kickAuthStates = new Map();
const crypto = require('crypto');

function base64UrlEncode(str) {
    return str.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

app.get('/api/kick/auth/url', (req, res) => {
    const clientId = process.env.KICK_CLIENT_ID || '01KMSMY655DKGVH15FB5DB0RK7';
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers.host;
    
    // Redirect URI matching registered Kick app config (allows override via env)
    const redirectUri = process.env.KICK_REDIRECT_URI || `${protocol}://${host}/api/kick-oauth/callback`;
    const state = crypto.randomBytes(16).toString('hex');
    
    // PKCE parameters
    const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
    const codeChallenge = base64UrlEncode(crypto.createHash('sha256').update(codeVerifier).digest());
    
    kickAuthStates.set(state, { codeVerifier, redirectUri, timestamp: Date.now() });

    const scopes = 'user:read channel:read channel:write chat:write';
    const authUrl = `https://id.kick.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256`;
    
    res.json({ url: authUrl, redirectUri });
});

app.get('/api/kick-oauth/callback', async (req, res) => {
    const { code, state, error, error_description } = req.query;
    if (error) {
        return res.send(`<html><body style="background:#121212;color:white;font-family:sans-serif;padding:20px;"><h2 style="color:#ff5555">Authorization Failed</h2><p>${error_description || error}</p></body></html>`);
    }
    if (!code || !state) {
        return res.status(400).send('Missing code or state');
    }

    const stateData = kickAuthStates.get(state);

    const clientId = process.env.KICK_CLIENT_ID || '01KMSMY655DKGVH15FB5DB0RK7';
    const clientSecret = process.env.KICK_CLIENT_SECRET || '';
    const redirectUri = (stateData && stateData.redirectUri) ? stateData.redirectUri : (process.env.KICK_REDIRECT_URI || `${req.headers['x-forwarded-proto'] || req.protocol}://${req.headers.host}/api/kick-oauth/callback`);
    const codeVerifier = stateData ? stateData.codeVerifier : '';

    try {
        const bodyParams = new URLSearchParams();
        bodyParams.append('grant_type', 'authorization_code');
        bodyParams.append('client_id', clientId);
        if (clientSecret) bodyParams.append('client_secret', clientSecret);
        bodyParams.append('code', code);
        bodyParams.append('redirect_uri', redirectUri);
        if (codeVerifier) bodyParams.append('code_verifier', codeVerifier);

        const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
        if (clientSecret) {
            headers['Authorization'] = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        }

        const tokenRes = await axios.post('https://id.kick.com/oauth/token', bodyParams.toString(), { headers });
        if (stateData) kickAuthStates.delete(state);

        const tokenData = tokenRes.data;
        if (tokenData.access_token) {
            process.env.KICK_ACCESS_TOKEN = tokenData.access_token;
            if (tokenData.refresh_token) process.env.KICK_REFRESH_TOKEN = tokenData.refresh_token;

            // Fetch and cache exact Kick username
            try {
                const uRes = await axios.get('https://api.kick.com/public/v1/users', {
                    headers: { 'Authorization': `Bearer ${tokenData.access_token}`, 'Accept': 'application/json' }
                });
                const uData = uRes.data;
                const u = Array.isArray(uData.data) ? uData.data[0] : (uData.data || uData);
                if (u && (u.username || u.name)) {
                    process.env.KICK_USERNAME = u.username || u.name;
                }
            } catch (e) {}

            const envPath = path.join(__dirname, '.env');
            if (fs.existsSync(envPath)) {
                let envContent = fs.readFileSync(envPath, 'utf8');
                if (envContent.includes('KICK_ACCESS_TOKEN=')) {
                    envContent = envContent.replace(/KICK_ACCESS_TOKEN=.*/g, `KICK_ACCESS_TOKEN=${tokenData.access_token}`);
                } else {
                    envContent += `\nKICK_ACCESS_TOKEN=${tokenData.access_token}`;
                }
                if (process.env.KICK_USERNAME) {
                    if (envContent.includes('KICK_USERNAME=')) {
                        envContent = envContent.replace(/KICK_USERNAME=.*/g, `KICK_USERNAME=${process.env.KICK_USERNAME}`);
                    } else {
                        envContent += `\nKICK_USERNAME=${process.env.KICK_USERNAME}`;
                    }
                }
                fs.writeFileSync(envPath, envContent);
            } else {
                fs.writeFileSync(envPath, `KICK_ACCESS_TOKEN=${tokenData.access_token}\nKICK_USERNAME=${process.env.KICK_USERNAME || ''}`);
            }

            return res.redirect(`/kick-callback.html?token=${encodeURIComponent(tokenData.access_token)}&username=${encodeURIComponent(process.env.KICK_USERNAME || '')}`);
        } else {
            throw new Error(tokenData.error || 'No access_token returned');
        }
    } catch (err) {
        console.error('[Kick Auth Error Status]:', err.response?.status);
        console.error('[Kick Auth Error Data]:', err.response?.data);
        const errDetail = err.response?.data ? (typeof err.response.data === 'object' ? JSON.stringify(err.response.data, null, 2) : err.response.data) : err.message;
        return res.status(500).send(`<html><body style="background:#121212;color:white;font-family:sans-serif;padding:20px;"><h2 style="color:#ff5555">Token Exchange Failed</h2><p style="color:#aaa;">Details from Kick API (Status ${err.response?.status || 500}):</p><pre style="background:#222;padding:15px;border-radius:6px;color:#ffaa00;overflow-x:auto;">${errDetail}</pre></body></html>`);
    }
});

app.post('/api/kick/auth/restore', (req, res) => {
    const { token, username } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    process.env.KICK_ACCESS_TOKEN = token;
    if (username) process.env.KICK_USERNAME = username;

    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('KICK_ACCESS_TOKEN=')) {
            envContent = envContent.replace(/KICK_ACCESS_TOKEN=.*/g, `KICK_ACCESS_TOKEN=${token}`);
        } else {
            envContent += `\nKICK_ACCESS_TOKEN=${token}`;
        }
        if (username) {
            if (envContent.includes('KICK_USERNAME=')) {
                envContent = envContent.replace(/KICK_USERNAME=.*/g, `KICK_USERNAME=${username}`);
            } else {
                envContent += `\nKICK_USERNAME=${username}`;
            }
        }
        fs.writeFileSync(envPath, envContent);
    }
    res.json({ success: true });
});

app.get('/api/kick/auth/status', async (req, res) => {
    const hasToken = !!process.env.KICK_ACCESS_TOKEN;
    if (!hasToken) return res.json({ authorized: false });

    if (process.env.KICK_USERNAME) {
        return res.json({ authorized: true, username: process.env.KICK_USERNAME, displayName: process.env.KICK_USERNAME });
    }

    try {
        // First try official channel endpoint
        const chanRes = await axios.get('https://api.kick.com/public/v1/channels', {
            headers: { 'Authorization': `Bearer ${process.env.KICK_ACCESS_TOKEN}`, 'Accept': 'application/json' }
        });
        const firstChan = chanRes.data?.data?.[0];
        if (firstChan?.slug) {
            process.env.KICK_USERNAME = firstChan.slug;
            return res.json({ authorized: true, username: firstChan.slug, displayName: firstChan.slug });
        }

        const response = await axios.get('https://api.kick.com/public/v1/users', {
            headers: { 'Authorization': `Bearer ${process.env.KICK_ACCESS_TOKEN}`, 'Accept': 'application/json' }
        });
        const data = response.data;
        const user = Array.isArray(data.data) ? data.data[0] : (data.data || data);
        if (user && (user.username || user.name)) {
            const name = user.username || user.name;
            process.env.KICK_USERNAME = name;
            res.json({ authorized: true, username: name, displayName: user.name || name });
        } else {
            res.json({ authorized: true, username: process.env.KICK_CHANNEL_NAME || 'Kick User' });
        }
    } catch (e) {
        res.json({ authorized: hasToken, username: process.env.KICK_USERNAME || process.env.KICK_CHANNEL_NAME || 'Authorized' });
    }
});

app.post('/api/kick/auth/logout', (req, res) => {
    process.env.KICK_ACCESS_TOKEN = '';
    process.env.KICK_USERNAME = '';
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        envContent = envContent.replace(/KICK_ACCESS_TOKEN=.*/g, 'KICK_ACCESS_TOKEN=');
        envContent = envContent.replace(/KICK_USERNAME=.*/g, 'KICK_USERNAME=');
        fs.writeFileSync(envPath, envContent);
    }
    res.json({ success: true });
});

// KICK CHANNEL TITLE ENDPOINTS
const kickChannelCache = new Map();

app.get('/api/kick/channel', async (req, res) => {
    let channelSlug = req.query.channel || process.env.KICK_USERNAME || process.env.KICK_CHANNEL_NAME || '';

    // If channel is missing or placeholder, resolve from official token
    if (process.env.KICK_ACCESS_TOKEN && (!channelSlug || channelSlug === 'Kick User' || channelSlug === 'Kick Streamer')) {
        try {
            const chanRes = await axios.get('https://api.kick.com/public/v1/channels', {
                headers: { 'Authorization': `Bearer ${process.env.KICK_ACCESS_TOKEN}`, 'Accept': 'application/json' }
            });
            const firstChan = chanRes.data?.data?.[0];
            if (firstChan?.slug) {
                channelSlug = firstChan.slug;
                process.env.KICK_USERNAME = firstChan.slug;
            }
        } catch (e) {}
    }

    if (!channelSlug) return res.status(400).json({ error: true, message: 'Channel slug required' });

    const cached = kickChannelCache.get(channelSlug.toLowerCase());

    try {
        const { gotScraping } = await import('got-scraping');
        const response = await gotScraping({
            url: `https://kick.com/api/v1/channels/${encodeURIComponent(channelSlug.toLowerCase())}`,
            responseType: 'json',
            timeout: { request: 5000 }
        });
        const data = response.body || {};
        
        const live = data.livestream;
        const prev = (data.previous_livestreams && data.previous_livestreams.length > 0) ? data.previous_livestreams[0] : null;
        const recentCat = (data.recent_categories && data.recent_categories.length > 0) ? data.recent_categories[0] : null;

        const title = live?.session_title || cached?.title || prev?.session_title || data.title || '';
        const categoryName = live?.categories?.[0]?.name || cached?.category_name || prev?.categories?.[0]?.name || recentCat?.name || data.category?.name || '';
        const categoryId = live?.categories?.[0]?.id || cached?.category_id || prev?.categories?.[0]?.id || recentCat?.id || data.category?.id || '';

        res.json({
            title: title,
            category_name: categoryName,
            category_id: categoryId,
            is_live: !!live
        });
    } catch (e) {
        console.error(`[Kick Channel Error] for ${channelSlug}:`, e.message);
        res.json({
            title: cached?.title || '',
            category_name: cached?.category_name || '',
            category_id: cached?.category_id || '',
            is_live: false
        });
    }
});

// KICK CATEGORY SEARCH ENDPOINT
app.get('/api/kick/categories/search', async (req, res) => {
    const query = req.query.q || req.query.query || '';
    if (!query) return res.json({ data: [] });

    try {
        const { gotScraping } = await import('got-scraping');
        const response = await gotScraping({
            url: `https://kick.com/api/v1/subcategories?q=${encodeURIComponent(query)}`,
            responseType: 'json',
            timeout: { request: 5000 }
        });

        const items = response.body.data || response.body || [];
        const formatted = items.map(c => {
            let imgUrl = 'https://kick.com/img/kick-logo.svg';
            if (c.banner) {
                if (typeof c.banner === 'string') {
                    imgUrl = c.banner.split(' ')[0];
                } else if (c.banner.url) {
                    imgUrl = c.banner.url;
                } else if (c.banner.src) {
                    imgUrl = c.banner.src;
                } else if (c.banner.responsive && typeof c.banner.responsive === 'string') {
                    imgUrl = c.banner.responsive.split(' ')[0];
                }
            }
            return {
                id: c.id,
                name: c.name,
                box_art_url: imgUrl
            };
        });
        res.json({ data: formatted });
    } catch (e) {
        console.error('[Kick Category Search Error]:', e.message);
        res.json({ data: [] });
    }
});

app.patch('/api/kick/channel', async (req, res) => {
    const { title, category_id, category_name } = req.body;
    if (!process.env.KICK_ACCESS_TOKEN) {
        return res.status(400).json({ error: true, message: 'Kick access token missing. Please authorize Kick first!' });
    }

    try {
        const payload = {};
        if (title !== undefined && title !== '') payload.stream_title = title;
        if (category_id !== undefined && category_id !== '') payload.category_id = parseInt(category_id);

        const response = await axios.patch('https://api.kick.com/public/v1/channels', payload, {
            headers: {
                'Authorization': `Bearer ${process.env.KICK_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        const channelSlug = process.env.KICK_USERNAME || process.env.KICK_CHANNEL_NAME || 'mychannel';
        const currentCache = kickChannelCache.get(channelSlug.toLowerCase()) || {};
        kickChannelCache.set(channelSlug.toLowerCase(), {
            title: title !== undefined ? title : currentCache.title,
            category_name: category_name !== undefined ? category_name : currentCache.category_name,
            category_id: category_id !== undefined ? category_id : currentCache.category_id
        });

        res.json({ success: true, data: response.data });
    } catch (err) {
        console.error('[Kick Update Channel Error]:', err.response?.data || err.message);
        res.status(err.response?.status || 500).json({ error: true, message: err.response?.data?.message || err.message });
    }
});

// KICK MODERATION ENDPOINT
app.post('/api/kick/moderate', async (req, res) => {
    const { action, targetUserId, username, messageId, duration, reason, channel } = req.body;
    if (!process.env.KICK_ACCESS_TOKEN) {
        return res.status(401).json({ error: true, message: 'Kick access token missing. Please authorize Kick first!' });
    }

    try {
        // Fetch current user from Kick API to verify authorized channel name
        let authorizedUsername = null;
        try {
            const userRes = await axios.get('https://api.kick.com/public/v1/users', {
                headers: { 'Authorization': `Bearer ${process.env.KICK_ACCESS_TOKEN}` }
            });
            const userData = userRes.data;
            const u = Array.isArray(userData.data) ? userData.data[0] : (userData.data || userData);
            authorizedUsername = u?.username || u?.name || null;
        } catch (e) {}

        if (channel && authorizedUsername && channel.toLowerCase() !== authorizedUsername.toLowerCase()) {
            return res.status(403).json({
                error: true,
                message: `Moderation failed: You are authorized as '${authorizedUsername}', but currently viewing channel '${channel}'. You can only moderate your own channel.`
            });
        }

        if (action === 'delete') {
            if (!messageId) {
                return res.status(400).json({ error: true, message: 'Message ID required for deletion' });
            }
            let success = false;
            let lastError = null;

            try {
                await axios.delete(`https://api.kick.com/public/v1/chat/messages/${messageId}`, {
                    headers: { 'Authorization': `Bearer ${process.env.KICK_ACCESS_TOKEN}` }
                });
                success = true;
            } catch (e1) {
                lastError = e1;
                try {
                    await axios.delete(`https://api.kick.com/public/v1/moderation/messages/${messageId}`, {
                        headers: { 'Authorization': `Bearer ${process.env.KICK_ACCESS_TOKEN}` }
                    });
                    success = true;
                } catch (e2) {
                    lastError = e2;
                }
            }

            if (!success) {
                const errMsg = lastError?.response?.data?.message || lastError?.response?.data?.error || 'Failed to delete message. Make sure you are authorized as a moderator/owner of this channel.';
                return res.status(lastError?.response?.status || 403).json({ error: true, message: errMsg });
            }

            io.emit('kickMessageDeleted', { username, messageId });
            return res.json({ success: true });
        } else if (action === 'timeout' || action === 'ban') {
            const timeoutSecs = action === 'timeout' ? (duration || 600) : undefined;
            const payload = {
                banned_user_id: targetUserId || username,
                reason: reason || "Moderated via CombinedChat"
            };
            if (timeoutSecs) payload.duration = timeoutSecs;

            let success = false;
            let lastError = null;

            try {
                await axios.post('https://api.kick.com/public/v1/moderation/bans', payload, {
                    headers: {
                        'Authorization': `Bearer ${process.env.KICK_ACCESS_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });
                success = true;
            } catch (e1) {
                lastError = e1;
                try {
                    await axios.post('https://api.kick.com/public/v1/channels/bans', payload, {
                        headers: {
                            'Authorization': `Bearer ${process.env.KICK_ACCESS_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    success = true;
                } catch (e2) {
                    lastError = e2;
                }
            }

            if (!success) {
                const errMsg = lastError?.response?.data?.message || lastError?.response?.data?.error || `Failed to ${action} user. Make sure you are authorized as a moderator/owner of this channel.`;
                return res.status(lastError?.response?.status || 403).json({ error: true, message: errMsg });
            }

            io.emit(action === 'timeout' ? 'kickTimeout' : 'kickBan', { username, duration: timeoutSecs });
            return res.json({ success: true });
        }
        res.status(400).json({ error: true, message: 'Invalid moderation action' });
    } catch (err) {
        console.error('[Kick Moderate Error]:', err.response?.data || err.message);
        res.status(err.response?.status || 500).json({ error: true, message: err.response?.data?.message || 'Kick moderation failed' });
    }
});

// KICK USER INFO & FOLLOW DATE ENDPOINT
app.get('/api/kick/userinfo', async (req, res) => {
    const { channel, username } = req.query;
    if (!channel || !username) {
        return res.status(400).json({ error: true, message: 'Missing channel or username' });
    }

    try {
        const { gotScraping } = await import('got-scraping');
        const response = await gotScraping({
            url: `https://kick.com/api/v2/channels/${encodeURIComponent(channel)}/users/${encodeURIComponent(username)}`,
            responseType: 'json',
            timeout: { request: 5000 }
        });

        const data = response.body || {};
        res.json({
            profilePic: data.profile_pic || null,
            followingSince: data.following_since || null,
            subscribedFor: data.subscribed_for || 0,
            createdAt: data.created_at || null,
            isModerator: data.is_moderator || false,
            isBanned: !!data.banned
        });
    } catch (e) {
        console.error(`[Kick UserInfo Error] for ${username} in ${channel}:`, e.message);
        res.json({ profilePic: null, followingSince: null, subscribedFor: 0, createdAt: null });
    }
});


// KICK BADGES ENDPOINT
app.get('/api/kick/badges/:channel', async (req, res) => {
    const { channel } = req.params;
    if (!channel) return res.status(400).json({ error: 'Missing channel parameter', badges: [] });
    
    try {
        const badges = await fetchKickChannelSubBadges(channel);
        return res.json({ channel, badges: badges || [] });
    } catch (e) {
        console.error(`[Kick Badges] Error fetching badges for ${channel}:`, e.message);
        return res.json({ channel, badges: [] });
    }
});

// TWITCH BADGES ENDPOINT
app.get('/api/twitch/badges/:broadcasterId', async (req, res) => {
    const { broadcasterId } = req.params;
    
    if (!broadcasterId || broadcasterId === 'null' || broadcasterId === 'undefined') {
        return res.status(400).json({ error: 'Invalid broadcasterId', channelBadges: [], globalBadges: [] });
    }

    const headers = await getTwitchAuthHeaders();
    let channelBadges = [];
    let globalBadges = [];

    if (headers) {
        try {
            const channelBadgesRes = await axios.get(`https://api.twitch.tv/helix/chat/badges?broadcaster_id=${broadcasterId}`, { headers, timeout: 5000 });
            channelBadges = channelBadgesRes.data?.data || [];
        } catch (e) {
            console.warn('[Twitch] Channel badges fetch notice:', e.response?.data?.message || e.message);
        }

        try {
            const globalBadgesRes = await axios.get('https://api.twitch.tv/helix/chat/badges/global', { headers, timeout: 5000 });
            globalBadges = globalBadgesRes.data?.data || [];
        } catch (e) {
            console.warn('[Twitch] Global badges fetch notice:', e.response?.data?.message || e.message);
        }
    }

    // Fallback: If channel badges or global badges are empty, try IVR public Twitch API
    if (channelBadges.length === 0 || globalBadges.length === 0) {
        try {
            if (channelBadges.length === 0) {
                const ivrChanRes = await axios.get(`https://api.ivr.fi/v2/twitch/badges/channel?id=${broadcasterId}`, {
                    headers: { 'User-Agent': 'CombinedChat/1.0' },
                    timeout: 4000
                });
                if (Array.isArray(ivrChanRes.data)) {
                    channelBadges = ivrChanRes.data.map(set => ({
                        set_id: set.set_id || set.id,
                        versions: (set.versions || []).map(v => ({
                            id: String(v.id),
                            image_url_1x: v.image_url_1x || v.image_url_2x || v.image_url_4x || v.url,
                            image_url_2x: v.image_url_2x || v.image_url_1x || v.url,
                            image_url_4x: v.image_url_4x || v.image_url_2x || v.url,
                            title: v.title || v.description || set.set_id
                        }))
                    }));
                }
            }
        } catch(e) {
            // IVR channel fallback failed silently
        }

        try {
            if (globalBadges.length === 0) {
                const ivrGlobRes = await axios.get('https://api.ivr.fi/v2/twitch/badges/global', {
                    headers: { 'User-Agent': 'CombinedChat/1.0' },
                    timeout: 4000
                });
                if (Array.isArray(ivrGlobRes.data)) {
                    globalBadges = ivrGlobRes.data.map(set => ({
                        set_id: set.set_id || set.id,
                        versions: (set.versions || []).map(v => ({
                            id: String(v.id),
                            image_url_1x: v.image_url_1x || v.image_url_2x || v.image_url_4x || v.url,
                            image_url_2x: v.image_url_2x || v.image_url_1x || v.url,
                            image_url_4x: v.image_url_4x || v.image_url_2x || v.url,
                            title: v.title || v.description || set.set_id
                        }))
                    }));
                }
            }
        } catch(e) {
            // IVR global fallback failed silently
        }
    }

    res.json({ channelBadges, globalBadges });
});

// TWITCH EMOTES ENDPOINT
app.get('/api/twitch/emotes/:broadcasterId', async (req, res) => {
    const { broadcasterId } = req.params;
    
    if (!broadcasterId || broadcasterId === 'null' || broadcasterId === 'undefined') {
        return res.status(400).json({ error: 'Invalid broadcasterId', channelEmotes: [], globalEmotes: [] });
    }

    const headers = await getTwitchAuthHeaders();
    if (!headers) {
        return res.status(400).json({ error: 'Twitch API credentials not configured', channelEmotes: [], globalEmotes: [] });
    }

    let channelEmotes = [];
    let globalEmotes = [];

    try {
        const channelEmotesRes = await axios.get(`https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${broadcasterId}`, { headers });
        channelEmotes = channelEmotesRes.data?.data || [];
    } catch (e) {
        console.warn('[Twitch] Channel emotes fetch notice:', e.response?.data?.message || e.message);
    }

    try {
        const globalEmotesRes = await axios.get('https://api.twitch.tv/helix/chat/emotes/global', { headers });
        globalEmotes = globalEmotesRes.data?.data || [];
    } catch (e) {
        console.warn('[Twitch] Global emotes fetch notice:', e.response?.data?.message || e.message);
    }

    res.json({ channelEmotes, globalEmotes });
});

// TWITCH CLIP ENDPOINT
app.post('/api/twitch/clip/:channelName', async (req, res) => {
    const { channelName } = req.params;
    
    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_ACCESS_TOKEN) {
        return res.status(400).json({ error: 'Twitch credentials not configured in server' });
    }

    try {
        const headers = {
            'Client-ID': process.env.TWITCH_CLIENT_ID,
            'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        };

        // Fetch broadcaster ID first
        const userRes = await axios.get(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(channelName)}`, { headers });
        if (!userRes.data || !userRes.data.data || userRes.data.data.length === 0) {
            return res.status(404).json({ error: 'Twitch channel not found' });
        }
        const broadcasterId = userRes.data.data[0].id;

        // Create clip
        const response = await axios.post(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`, {}, { headers });
        
        return res.json(response.data.data[0]);
    } catch (error) {
        console.error('[Twitch] Clip Error:', error.response?.data || error.message);
        return res.status(error.response?.status || 500).json(error.response?.data || { message: error.message });
    }
});

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



// Avatar proxy to bypass CORS for Kick profile pictures
const kickAvatarCache = new Map();
const kickAvatarPending = new Map();
let kickAvatarBrowser = null;
let kickAvatarPage = null;

async function getKickAvatarPage() {
    if (!kickAvatarBrowser) {
        console.log('[Kick] Initializing Puppeteer for avatars...');
        kickAvatarBrowser = await puppeteer.launch({ 
            headless: true,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote',
                '--single-process', '--disable-gpu'
            ]
        });
        kickAvatarPage = await kickAvatarBrowser.newPage();
    }
    return kickAvatarPage;
}

async function fetchKickAvatar(username) {
    let defaultNum = 1;
    if (username) {
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        defaultNum = Math.abs(hash % 6) + 1; // 1 to 6
    }
    const fallbackUrl = `https://kick.com/img/default-profile-pictures/default-avatar-${defaultNum}.webp`;
    
    if (!username) return fallbackUrl;
    
    const lowerUser = username.toLowerCase();
    if (kickAvatarCache.has(lowerUser)) {
        return kickAvatarCache.get(lowerUser);
    }

    try {
        const axios = require('axios');
        // Use allorigins to bypass Kick's Cloudflare protection for the API
        const res = await axios.get(`https://api.allorigins.win/raw?url=https://kick.com/api/v2/channels/${encodeURIComponent(lowerUser)}`, { timeout: 3000 });
        if (res.data && res.data.user && res.data.user.profile_pic) {
            kickAvatarCache.set(lowerUser, res.data.user.profile_pic);
            return res.data.user.profile_pic;
        }
    } catch (e) {
        // If the user doesn't have a channel (404), cache the fallback so we don't keep delaying their messages
        if (e.response && e.response.status === 404) {
            kickAvatarCache.set(lowerUser, fallbackUrl);
        }
        // For timeouts or 403s, we DO NOT cache the fallback, so it can retry on their next message!
    }
    
    return fallbackUrl;
}

app.get('/api/kick-avatar/:username', async (req, res) => {
    const url = await fetchKickAvatar(req.params.username);
    res.json({ url });
});


// Serve frontend files handled at the top

// Global error handlers to prevent crashes
process.on('uncaughtException', function (err) {
    console.error('Caught exception: ', err);
    // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Global] Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

// TWITCH AD SCHEDULE ENDPOINT
app.get('/api/twitch/ads', async (req, res) => {
    const { broadcasterId } = req.query;
    
    if (!broadcasterId || broadcasterId === 'null' || broadcasterId === 'undefined') {
        return res.status(400).json({ error: 'Missing or invalid broadcasterId', unauthenticated: false });
    }

    if (!process.env.TWITCH_CLIENT_ID || !process.env.TWITCH_ACCESS_TOKEN) {
        return res.json({ error: 'Twitch API credentials not configured', unauthenticated: true });
    }

    try {
        const response = await axios.get(`https://api.twitch.tv/helix/channels/ads?broadcaster_id=${broadcasterId}`, {
            headers: {
                'Client-ID': process.env.TWITCH_CLIENT_ID,
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`
            }
        });
        return res.json(response.data);
    } catch (error) {
        const statusCode = error.response?.status || 500;
        const errorMessage = error.response?.data?.message || error.message;
        const isAuthError = statusCode === 401 || statusCode === 403;
        
        return res.json({ 
            error: errorMessage, 
            unauthenticated: isAuthError,
            status: statusCode
        });
    }
});


// TWITCH CHANNEL ACTIONS ENDPOINTS
app.get('/api/twitch/userinfo', async (req, res) => {
    const { broadcasterId, userId, broadcasterLogin, userLogin } = req.query;
    if (!broadcasterId || !userId || !process.env.TWITCH_ACCESS_TOKEN) return res.json({ error: true });

    try {
        const axios = require('axios');
        const headers = {
            'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
            'Client-Id': process.env.TWITCH_CLIENT_ID
        };

        // Run both requests concurrently to cut loading time in half!
        const profilePromise = axios.get(`https://api.twitch.tv/helix/users?id=${userId}`, { headers })
            .then(res => res.data?.data?.[0]?.profile_image_url || null)
            .catch(() => null);

        const followPromise = axios.get(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${broadcasterId}&user_id=${userId}`, { headers })
            .then(res => res.data?.data?.[0]?.followed_at || null)
            .catch(async (e) => {
                // If official API fails (e.g. 403 Forbidden because you aren't a mod), fallback to IVR
                if (broadcasterLogin && userLogin) {
                    try {
                        const ivrRes = await axios.get(`https://api.ivr.fi/v2/twitch/subage/${userLogin}/${broadcasterLogin}`);
                        return ivrRes.data?.followedAt || null;
                    } catch (ivrErr) {
                        return null;
                    }
                }
                return null;
            });

        const [profilePic, followDate] = await Promise.all([profilePromise, followPromise]);

        res.json({ profilePic, followDate });
    } catch (err) {
        console.error('[Twitch] Userinfo error:', err.message);
        res.status(500).json({ error: true, message: err.message });
    }
});

app.get('/api/twitch/banned', async (req, res) => {
    const { broadcasterId } = req.query;
    if (!broadcasterId || !process.env.TWITCH_ACCESS_TOKEN) return res.json({ error: true });

    try {
        const response = await axios.get(`https://api.twitch.tv/helix/moderation/banned?broadcaster_id=${broadcasterId}&moderator_id=${broadcasterId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        });
        res.json(response.data);
    } catch (err) {
        console.error('[Twitch] Banned Fetch Error:', err.response?.data || err.message);
        res.status(500).json({ error: true, message: err.response?.data?.message || err.message });
    }
});

app.get('/api/twitch/channel', async (req, res) => {
    const { broadcasterId } = req.query;
    if (!broadcasterId || !process.env.TWITCH_ACCESS_TOKEN) return res.status(400).json({ error: true, message: 'Missing parameters or token' });

    try {
        const response = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
            headers: {
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        });
        const data = await response.json();
        if (data.error) throw new Error(data.message);
        res.json(data.data[0]);
    } catch (err) {
        res.status(500).json({ error: true, message: err.message });
    }
});

app.patch('/api/twitch/channel', async (req, res) => {
    const { broadcasterId, title, game_id } = req.body;
    console.log('[Twitch] PATCH /channels request body:', req.body);
    if (!broadcasterId || !process.env.TWITCH_ACCESS_TOKEN) return res.status(400).json({ error: true, message: 'Missing parameters or token' });

    try {
        const response = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${broadcasterId}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, game_id })
        });
        
        console.log('[Twitch] PATCH /channels response status:', response.status);
        if (response.status === 204) {
            res.json({ success: true });
        } else {
            const data = await response.json();
            console.log('[Twitch] PATCH /channels error data:', data);
            res.status(response.status).json({ error: true, message: data.message || 'Failed to update channel' });
        }
    } catch (err) {
        console.error('[Twitch] PATCH /channels caught error:', err.message);
        res.status(500).json({ error: true, message: err.message });
    }
});

app.get('/api/twitch/search-categories', async (req, res) => {
    const { query } = req.query;
    if (!query || !process.env.TWITCH_ACCESS_TOKEN) return res.status(400).json({ error: true, message: 'Missing query or token' });

    try {
        const response = await fetch(`https://api.twitch.tv/helix/search/categories?query=${encodeURIComponent(query)}`, {
            headers: {
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        });
        const data = await response.json();
        if (data.error) throw new Error(data.message);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: true, message: err.message });
    }
});

app.get('/api/twitch/search-channels', async (req, res) => {
    const { query } = req.query;
    if (!query || !process.env.TWITCH_ACCESS_TOKEN) return res.json({ data: [] });

    try {
        // 1. Search for channels (bypassing live_only=true due to Twitch API caching bugs)
        const searchRes = await fetch(`https://api.twitch.tv/helix/search/channels?query=${encodeURIComponent(query)}&first=10`, {
            headers: {
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        });
        const searchData = await searchRes.json();
        
        if (!searchData.data || searchData.data.length === 0) {
            return res.json({ data: [] });
        }

        // 2. Fetch viewer counts for these channels to confirm they are actually live
        const userIds = searchData.data.map(c => `user_id=${c.id}`).join('&');
        const streamRes = await fetch(`https://api.twitch.tv/helix/streams?${userIds}`, {
            headers: {
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        });
        const streamData = await streamRes.json();

        // 3. Map viewer counts back to channels
        const viewerMap = {};
        if (streamData.data) {
            streamData.data.forEach(stream => {
                viewerMap[stream.user_id] = stream.viewer_count;
            });
        }

        const enrichedData = searchData.data.map(c => ({
            ...c,
            viewer_count: viewerMap[c.id] || 0
        })).filter(c => c.viewer_count > 0).sort((a, b) => b.viewer_count - a.viewer_count); // Sort by viewers descending

        res.json({ data: enrichedData });
    } catch (err) {
        console.error('[Twitch] Channel Search error:', err.message);
        res.json({ data: [] });
    }
});

app.post('/api/twitch/raid', async (req, res) => {
    const { broadcasterId, targetUsername } = req.body;
    if (!broadcasterId || !targetUsername || !process.env.TWITCH_ACCESS_TOKEN) return res.status(400).json({ error: true, message: 'Missing parameters or token' });

    try {
        // 1. Get target broadcaster ID
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${targetUsername}`, {
            headers: {
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        });
        const userData = await userRes.json();
        if (userData.error) throw new Error(userData.message);
        if (!userData.data || userData.data.length === 0) throw new Error('Target user not found');
        const targetId = userData.data[0].id;

        // 2. Start raid
        const raidRes = await fetch(`https://api.twitch.tv/helix/raids?from_broadcaster_id=${broadcasterId}&to_broadcaster_id=${targetId}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        });
        const raidData = await raidRes.json();
        if (raidData.error) throw new Error(raidData.message);
        res.json(raidData);
    } catch (err) {
        res.status(500).json({ error: true, message: err.message });
    }
});

app.delete('/api/twitch/raid', async (req, res) => {
    const { broadcasterId } = req.body;
    if (!broadcasterId || !process.env.TWITCH_ACCESS_TOKEN) return res.status(400).json({ error: true, message: 'Missing parameters or token' });

    try {
        const response = await fetch(`https://api.twitch.tv/helix/raids?broadcaster_id=${broadcasterId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${process.env.TWITCH_ACCESS_TOKEN}`,
                'Client-Id': process.env.TWITCH_CLIENT_ID
            }
        });
        if (response.status === 204) {
            res.json({ success: true });
        } else {
            const data = await response.json();
            throw new Error(data.message || 'Failed to cancel raid');
        }
    } catch (err) {
        res.status(500).json({ error: true, message: err.message });
    }
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