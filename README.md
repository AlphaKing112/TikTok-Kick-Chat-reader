# Tiktok/Kick Chat Reader

A real-time chat reader for TikTok and Kick livestreams. This project lets you view and merge chat messages from both platforms, with stats and a modern, mobile-friendly UI.

## Credits & Open Source Projects Used

- [zerodytrash/TikTok-Chat-Reader](https://github.com/zerodytrash/TikTok-Chat-Reader) — TikTok chat backend and frontend inspiration
- [KickEngineering/KickDevDocs](https://github.com/KickEngineering/KickDevDocs) — Official Kick API documentation
- [@retconned/kick-js](https://github.com/retconned/kick-js) — Node.js library for Kick chat integration
- [Socket.IO](https://socket.io/) — Real-time communication
- [Express](https://expressjs.com/) — Backend server
- [Axios](https://axios-http.com/) — HTTP requests
- [jQuery](https://jquery.com/) — Frontend DOM manipulation

## Features

- Merge TikTok and Kick chat in one UI
- Color-coded messages (TikTok: blue, Kick: green)
- Kick and TikTok stats (followers, viewers, likes, diamonds)
- Mobile-friendly, modern design
- Fast, real-time updates
- Easy to deploy and run

## Screenshot

![Screenshot of Tiktok/Kick Chat Reader](https://i.imgur.com/FBZNbvZ.png)

## Setup & Installation

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd <your-repo-directory>
```

### 2. Install dependencies
```bash
npm install
```

### 3. Run the server
```bash
node server.js
```

By default, the server runs on [http://localhost:8081](http://localhost:8081).

### 4. Open the frontend
- Visit [http://localhost:8081](http://localhost:8081) in your browser.

## Usage

1. **TikTok:** Enter a TikTok username and click connect to view TikTok chat and stats.
2. **Kick:** Enter a Kick channel name or link and click connect to view Kick chat and stats.
3. **Switching:** When you connect to a new streamer, the chat and stats will update automatically.
4. **Overlay:** You can generate an overlay URL for OBS from the main page.

## How it Works
- The backend connects to TikTok and Kick using open-source libraries and relays chat and stats to the frontend via Socket.IO.
- The frontend merges and displays chat messages, color-codes them, and shows stats in real time.

## Contributing

Pull requests and issues are welcome! Please:
- Credit all upstream projects and contributors
- Follow best practices for Node.js and frontend code
- Open an issue for bugs or feature requests

## Documentation & References
- [TikTok-Chat-Reader](https://github.com/zerodytrash/TikTok-Chat-Reader)
- [Kick Dev Docs](https://github.com/KickEngineering/KickDevDocs)
- [@retconned/kick-js](https://github.com/retconned/kick-js)

## License
This project is open source and provided under the MIT License. See LICENSE for details.
