# Multi-Platform Chat Reader & OBS Overlay

A powerful, unified chat reader for **Twitch, TikTok, and Kick** built specifically for streamers. It combines all live chats into a single web interface and provides a customizable transparent overlay for OBS Studio.

It features built-in Twitch & Kick authentication, channel stream title management, moderation tools (pinning messages, timeout/ban, deleting messages with OBS overlay removal, checking banned lists, and creating clips).

---

## 🚀 Features

- **Unified Chat:** Read Twitch, TikTok, and Kick chats side-by-side in real time.
- **OBS Stream Overlay:** Transparent `/obs.html` page that integrates directly into OBS Studio with slick animations and auto-scroll.
- **Interactive Live Polls:** Create real-time stream polls from the dashboard with custom options and chat vote keywords (`1`, `2`, `GTA`, `Fortnite`). Viewers on Twitch, Kick, and TikTok vote by typing keywords in chat (1 vote per user max). Results render dynamically on a dedicated OBS poll overlay (`/poll.html`) with animated progress bars!
- **Kick & Twitch Authorization:** 1-click popup authorization for Kick & Twitch that displays the logged-in username directly next to the Logout button.
- **Stream Title & Category Management:** Easily edit your stream title and search categories for **Kick** and **Twitch** directly from the **🎬 (Channel Actions)** modal in the chat UI.
- **Kick & Twitch Moderation:** Click any Kick or Twitch username in chat to **Delete Message**, **Timeout User (1m, 10m, 1h)**, or **Ban User**. Deleted/moderated messages are instantly removed from the OBS stream overlay!
- **Dynamic Emotes & Badges:** Automatically fetches custom channel emotes and global badges.

---

## 🛠️ Setup Instructions (Local / Desktop)

### 1. Prerequisites
- Download and install [Node.js](https://nodejs.org/) (v16 or higher).
- Accounts for Twitch and/or Kick.

---

### 2. Configure Twitch Developer App (For Twitch Chat & Moderation)
1. Go to the [Twitch Developer Console](https://dev.twitch.tv/console/apps) and log in.
2. Click **Register Your Application** (or **Add New App**).
3. Set the **Name** to your preferred app name (e.g., "My Stream Chat").
4. Add the following **OAuth Redirect URL**:
   - `http://localhost:8081/twitch-callback.html`
5. Set **Category** to `Chat Bot` or `Broadcaster Utility`.
6. Click **Create**, then **Manage** to copy your **Client ID**.

---

### 3. Configure Kick Developer App (For Kick Auth & Title Updates)
1. Go to the [Kick Developer Dashboard](https://id.kick.com/developer/apps) and log in.
2. Click **Create Application**.
3. Set your **App Name** and **Description**.
4. Add the following **Redirect URL**:
   - `http://localhost:8081/api/kick-oauth/callback`
5. Select the requested **Scopes**:
   - `user:read`
   - `channel:read`
   - `channel:write`
   - `chat:write`
6. Save your application, then copy your **Client ID** and **Client Secret**.

---

### 4. Install & Create Environment File (`.env`)
1. Download or clone this repository to your computer.
2. Open a terminal (Command Prompt / PowerShell / Terminal) in the project folder.
3. Run:
   ```bash
   npm install
   ```
4. Create a new file named `.env` in the root folder and add your credentials:
   ```env
   # Twitch Credentials
   TWITCH_CLIENT_ID=your_twitch_client_id_here

   # Kick Credentials
   KICK_CLIENT_ID=your_kick_client_id_here
   KICK_CLIENT_SECRET=your_kick_client_secret_here

   # Rate Limiting & Options
   ENABLE_RATE_LIMIT=true
   ```

---

### 5. Run the Application
1. In your terminal, run:
   ```bash
   npm run dev
   ```
2. Open your browser and go to: `http://localhost:8081`
3. Click **Authorize Kick 🔑** and/or **Authorize Twitch 🔑** to log into your accounts. Once authorized, your logged-in account name will display next to the **Logout** buttons.

---

### 6. How to Edit Stream Titles
1. Next to the chat input at the bottom, click the **🎬 (Channel Actions)** button.
2. Under **Stream Info**, select the **Twitch** or **Kick** tab.
3. Type your new **STREAM TITLE** and click **Save Changes**.

---

### 7. OBS Studio Setup
1. In OBS Studio, add a new **Browser Source**.
2. Set the URL to: `http://localhost:8081/obs.html`
3. Check the box **"Refresh browser when scene becomes active"**.
4. The transparent chat overlay is ready for your stream!

---

## ☁️ Deploying to Render (Cloud Hosting)

To host your app online on [Render.com](https://render.com/):

1. Push your repository to GitHub.
2. Log into Render, click **New +** -> **Web Service**, and select your repository.
3. Set the **Build Command** to `npm install` and **Start Command** to `node server.js`.
4. In Render's **Environment Variables** tab, add:
   - `TWITCH_CLIENT_ID`
   - `KICK_CLIENT_ID`
   - `KICK_CLIENT_SECRET`
5. Add your Render callback URLs to your Developer App settings:
   - **Twitch Redirect URL**: `https://<your-app-name>.onrender.com/twitch-callback.html`
   - **Kick Redirect URL**: `https://<your-app-name>.onrender.com/api/kick-oauth/callback`
6. Deploy! Your app will automatically format callback URLs for production.
