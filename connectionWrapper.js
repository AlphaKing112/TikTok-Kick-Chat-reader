const { WebcastPushConnection } = require('tiktok-live-connector');
const { EventEmitter } = require('events');

let globalConnectionCount = 0;

/**
 * TikTok LIVE connection wrapper with advanced reconnect functionality and error handling
 */
class TikTokConnectionWrapper extends EventEmitter {
    constructor(uniqueId, options, enableLog) {
        super();

        this.uniqueId = uniqueId;
        this.enableLog = enableLog;

        // Connection State
        this.clientDisconnected = false;
        this.reconnectEnabled = true;
        this.reconnectCount = 0;
        this.reconnectWaitMs = 1000;
        this.maxReconnectAttempts = 5;

        this.connection = new WebcastPushConnection(uniqueId, options);

        this.connection.on('streamEnd', () => {
            this.log(`streamEnd event received, giving up connection`);
            this.reconnectEnabled = false;
        })

        this.connection.on('disconnected', () => {
            globalConnectionCount -= 1;
            this.log(`TikTok connection disconnected`);
            this.scheduleReconnect();
        });

        this.connection.on('error', (err) => {
            // Don't log errors for offline users - just emit a clean message
            if (err.info && err.info.includes('user_not_found') || 
                err.exception && err.exception.message && err.exception.message.includes('user_not_found')) {
                this.log(`User is not live or not found`);
            } else {
                this.log(`Error event triggered: ${err.info}, ${err.exception}`);
                console.error(err);
            }
        })
    }

    connect(isReconnect) {
        this.connection.connect().then((state) => {
            // Defensive check for undefined or malformed state
            if (!state || typeof state !== 'object' || !('roomId' in state)) {
                const errorMsg = 'TikTok API returned an unexpected response. Please check the username or try again later.';
                this.log(errorMsg);
                if (!isReconnect) {
                    this.emit('disconnected', errorMsg);
                } else {
                    this.scheduleReconnect(errorMsg);
                }
                return;
            }

            this.log(`${isReconnect ? 'Reconnected' : 'Connected'} to roomId ${state.roomId}, websocket: ${state.upgradedToWebsocket}`);

            globalConnectionCount += 1;

            // Reset reconnect vars
            this.reconnectCount = 0;
            this.reconnectWaitMs = 1000;

            // Client disconnected while establishing connection => drop connection
            if (this.clientDisconnected) {
                this.connection.disconnect();
                return;
            }

            // Notify client
            if (!isReconnect) {
                this.emit('connected', state);
            }

        }).catch((err) => {
            // Clean up error messages for offline users
            let cleanError = err.toString();
            if (cleanError.includes('user_not_found') || cleanError.includes('Failed to retrieve room_id')) {
                cleanError = 'User is not currently live. Please try a different username.';
            }
            
            this.log(`${isReconnect ? 'Reconnect' : 'Connection'} failed: ${cleanError}`);

            if (isReconnect) {
                // Schedule the next reconnect attempt
                this.scheduleReconnect(cleanError);
            } else {
                // Notify client with clean message
                this.emit('disconnected', cleanError);
            }
        })
    }

    scheduleReconnect(reason) {

        if (!this.reconnectEnabled) {
            return;
        }

        if (this.reconnectCount >= this.maxReconnectAttempts) {
            this.log(`Give up connection, max reconnect attempts exceeded`);
            this.emit('disconnected', `Connection lost. ${reason}`);
            return;
        }

        this.log(`Try reconnect in ${this.reconnectWaitMs}ms`);
        //note

        setTimeout(() => {
            if (!this.reconnectEnabled || this.reconnectCount >= this.maxReconnectAttempts) {
                return;
            }

            this.reconnectCount += 1;
            this.reconnectWaitMs *= 2;
            this.connect(true);

        }, this.reconnectWaitMs)
    }

    disconnect() {
        this.log(`Client connection disconnected`);

        this.clientDisconnected = true;
        this.reconnectEnabled = false;

        if (this.connection.getState().isConnected) {
            this.connection.disconnect();
        }
    }

    log(logString) {
        if (this.enableLog) {
            console.log(`WRAPPER @${this.uniqueId}: ${logString}`);
        }
    }
}

module.exports = {
    TikTokConnectionWrapper,
    getGlobalConnectionCount: () => {
        return globalConnectionCount;
    }
};
