# Tiktok/Kick Chat Reader

A real-time chat reader for TikTok and Kick livestreams. This project lets you view and merge chat messages from both platforms, with stats and a modern, mobile-friendly UI. Perfect for streamers, moderators, and viewers who want to monitor multiple chat platforms simultaneously.

## Screenshot

![Screenshot of Tiktok/Kick Chat Reader](https://i.imgur.com/QFqfrLN.png)

## 🌟 Key Features

- **Multi-Platform Chat**: Merge TikTok and Kick chat in one interface
- **Mobile-Friendly**: Responsive design that works perfectly on phones and tablets
- **OBS Integration**: Generate overlay URLs for streaming software
- **External Access**: Use No-IP to access from anywhere in the world
- **Real-Time Stats**: Live follower counts, viewer counts, likes, and diamonds
- **Smart Scrolling**: Mobile-optimized chat scrolling with scroll-to-bottom button
- **User Join Notifications**: See when users join TikTok chatrooms
- **Emote Support**: Full Kick emote rendering and TikTok badge support

## Credits & Open Source Projects Used

- [zerodytrash/TikTok-Chat-Reader](https://github.com/zerodytrash/TikTok-Chat-Reader) — TikTok chat backend and frontend inspiration
- [KickEngineering/KickDevDocs](https://github.com/KickEngineering/KickDevDocs) — Official Kick API documentation
- [@retconned/kick-js](https://github.com/retconned/kick-js) — Node.js library for Kick chat integration
- [Socket.IO](https://socket.io/) — Real-time communication
- [Express](https://expressjs.com/) — Backend server
- [Axios](https://axios-http.com/) — HTTP requests
- [jQuery](https://jquery.com/) — Frontend DOM manipulation

## 📱 Mobile Usage

### **Using on Your Phone**

1. **Local Network Access**:
   - Make sure your phone and computer are on the same WiFi network
   - Find your computer's IP address (usually `192.168.1.x` or `10.0.0.x`)
   - On your phone, visit: `http://[YOUR_COMPUTER_IP]:8081`
   - Example: `http://192.168.1.100:8081`

2. **External Access (No-IP)**:
   - Follow the No-IP setup instructions below
   - Access from anywhere using your No-IP domain
   - Perfect for monitoring chat while away from home

### **Mobile Features**
- ✅ **Touch-friendly interface** with large buttons
- ✅ **Smart chat scrolling** - scroll up to read old messages without interruption
- ✅ **Scroll-to-bottom button** (↓) appears when you scroll up
- ✅ **Responsive design** adapts to any screen size
- ✅ **Fast loading** optimized for mobile networks

## 🎥 OBS Integration

### **Adding Chat to Your Stream**

1. **Generate Overlay URL**:
   - Enter TikTok username and/or Kick channel name
   - Click "Generate Overlay URL"
   - Copy the generated URL

2. **Add to OBS**:
   - In OBS, add a new "Browser Source"
   - Paste the overlay URL
   - Set width and height (recommended: 400x600)
   - Check "Refresh browser when scene becomes active"

3. **Customize Overlay**:
   - The overlay URL includes parameters for customization:
   - `bgColor`: Background color (default: rgb(24,23,28))
   - `fontColor`: Text color (default: rgb(227,229,235))
   - `fontSize`: Font size (default: 1.3em)
   - `showLikes=1`: Show like notifications
   - `showGifts=1`: Show gift notifications
   - `showFollows=1`: Show follow notifications
   - `showJoins=1`: Show user join notifications

### **Example Overlay URL**:
```
http://yourdomain.com/obs.html?username=someuser&kick=somechannel&showLikes=1&showGifts=1&bgColor=rgb(0,0,0)&fontColor=rgb(255,255,255)&fontSize=1.2em
```

## 🌐 External Access with No-IP

### **What is No-IP?**
No-IP provides free dynamic DNS that gives you a permanent domain name for your home server, even if your IP address changes.

### **Setup Instructions**

1. **Create No-IP Account**:
   - Go to [noip.com](https://www.noip.com) and create a free account
   - Choose a hostname (e.g., `yourname.ddns.net`)

2. **Configure Router Port Forwarding**:
   - Log into your router admin panel (usually `192.168.1.1` or `192.168.0.1`)
   - Go to "Port Forwarding" or "Virtual Server"
   - Add new rule:
     - **External Port**: 80 (or 8081)
     - **Internal Port**: 8081
     - **Internal IP**: Your computer's local IP
     - **Protocol**: TCP

3. **Access from Anywhere**:
   - Your chat reader will be available at: `http://yourname.ddns.net:8081`
   - Works from any device, anywhere in the world
   - Perfect for monitoring chat while traveling

### **Alternative: Quick Testing with ngrok**
For temporary external access:
```bash
npm install -g ngrok
node server.js
# In another terminal:
ngrok http 8081
```

## 🚀 Setup & Installation

### **Quick Start**

1. **Clone the repository**:
```bash
git clone <your-repo-url>
cd <your-repo-directory>
```

2. **Install dependencies**:
```bash
npm install
```

3. **Run the server**:
```bash
node server.js
```

4. **Access the application**:
- **Local**: [http://localhost:8081](http://localhost:8081)
- **Network**: `http://[YOUR_IP]:8081`
- **External**: `http://yourname.ddns.net:8081` (after No-IP setup)

## 📖 Usage Guide

### **Basic Usage**

1. **TikTok Chat**:
   - Enter a TikTok username (e.g., `@username`)
   - Click "Connect" to view TikTok chat and stats
   - See real-time messages, likes, gifts, and user joins

2. **Kick Chat**:
   - Enter a Kick channel name (e.g., `somechannel`)
   - Click "Connect" to view Kick chat and stats
   - See real-time messages, emotes, and stream information

3. **Multi-Platform**:
   - Connect to both TikTok and Kick simultaneously
   - Chat messages are color-coded (TikTok: blue, Kick: green)
   - Stats are displayed for both platforms

### **Advanced Features**

- **Mobile Scrolling**: Scroll up to read old messages without interruption
- **Stats Display**: Real-time follower counts, viewer counts, likes, and diamonds
- **Stream Duration**: Live stream duration counter for Kick streams
- **User Joins**: See when users join TikTok chatrooms
- **Emote Support**: Full Kick emote rendering and TikTok badges
- **Auto-Refresh**: Stats update every 3 seconds automatically

### **Switching Streamers**
- When you connect to a new streamer, chat and stats update automatically
- Previous chat history is cleared for the new stream
- Live status dots show real-time online/offline status

## 🔧 How it Works

### **Backend Architecture**
- **TikTok Integration**: Uses `tiktok-live-connector` to connect to TikTok LIVE streams
- **Kick Integration**: Uses WebSocket connections to Kick's Pusher service for real-time chat
- **Socket.IO**: Real-time communication between backend and frontend
- **Express Server**: Handles HTTP requests and serves the web interface

### **Frontend Features**
- **Responsive Design**: Mobile-first approach with touch-friendly interface
- **Smart Scrolling**: Prevents auto-scroll interruption when reading old messages
- **Real-Time Updates**: Live chat messages, stats, and stream information
- **Cross-Platform**: Works on desktop, mobile, and tablet devices

### **Data Flow**
1. Backend connects to TikTok and Kick APIs
2. Chat messages and stats are received in real-time
3. Data is processed and sent to frontend via Socket.IO
4. Frontend displays merged chat with color coding and stats
5. Mobile-optimized scrolling provides smooth user experience

## 🛠️ Troubleshooting

### **Common Issues**

1. **Can't connect to TikTok**:
   - Make sure the username is correct and the user is currently live
   - TikTok may block connections if too many requests are made
   - Try refreshing the page and reconnecting

2. **Can't connect to Kick**:
   - Verify the channel name is correct
   - Check if the channel is currently live
   - Kick's API may have rate limiting

3. **Mobile scrolling issues**:
   - Use the scroll-to-bottom button (↓) to return to latest messages
   - The chat will stop auto-scrolling when you scroll up
   - Wait 1.5 seconds after stopping scroll for auto-scroll to resume

4. **No-IP not working**:
   - Check if port forwarding is configured correctly
   - Verify the No-IP DUC client is running and updated
   - Test with `ngrok` first to ensure the application works externally

### **Performance Tips**
- Close unnecessary browser tabs to improve performance
- Use a wired internet connection for better stability
- Restart the server if connections become unstable

## 🤝 Contributing

Pull requests and issues are welcome! Please:
- Credit all upstream projects and contributors
- Follow best practices for Node.js and frontend code
- Open an issue for bugs or feature requests
- Test on both desktop and mobile devices

## 📚 Documentation & References
- [TikTok-Chat-Reader](https://github.com/zerodytrash/TikTok-Chat-Reader) - Original TikTok integration
- [Kick Dev Docs](https://github.com/KickEngineering/KickDevDocs) - Official Kick API documentation
- [@retconned/kick-js](https://github.com/retconned/kick-js) - Kick JavaScript library
- [No-IP Setup Guide](https://www.noip.com/support/knowledgebase/getting-started-with-no-ip-com/) - Dynamic DNS setup
- [OBS Browser Source](https://obsproject.com/wiki/Sources-Guide#browser-source) - OBS integration guide

## 📄 License
This project is open source and provided under the MIT License. See LICENSE for details.
