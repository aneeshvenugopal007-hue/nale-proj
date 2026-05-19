// serial.js - Handles connection to Arduino via Web Serial API

class SerialManager {
    constructor() {
        this.port = null;
        this.reader = null;
        this.keepReading = true;
        this.connected = false;

        // Data buffers
        this.pulseBuffer = new Array(100).fill(0);
        this.currentBpm = 0;

        this.onConnectCallbacks = [];
        this.onDisconnectCallbacks = [];
        this.onDataCallbacks = [];
    }

    async connect() {
        try {
            // Request a port and open a connection
            this.port = await navigator.serial.requestPort();
            // Standard baud rate for Arduino Serial.begin(9600)
            await this.port.open({ baudRate: 9600 });

            this.connected = true;
            this.keepReading = true;

            this.notifyConnect();

            // Start reading the stream
            this.readLoop();

            return true;
        } catch (error) {
            console.error("Failed to connect to COM Port:", error);
            return false;
        }
    }

    async disconnect() {
        this.keepReading = false;

        if (this.reader) {
            await this.reader.cancel();
        }

        if (this.port) {
            await this.port.close();
        }

        this.connected = false;
        this.notifyDisconnect();
    }

    async readLoop() {
        const textDecoder = new TextDecoderStream();
        const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
        this.reader = textDecoder.readable.getReader();

        let partialBuffer = "";

        try {
            while (this.keepReading) {
                const { value, done } = await this.reader.read();
                if (done) break;

                partialBuffer += value;
                const lines = partialBuffer.split('\n');

                // Keep the last partial line in the buffer
                partialBuffer = lines.pop();

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed) {
                        this.processData(trimmed);
                    }
                }
            }
        } catch (error) {
            console.error("Error reading from serial port:", error);
        } finally {
            this.reader.releaseLock();
            this.connected = false;
            this.notifyDisconnect();
        }
    }

    processData(dataString) {
        // Assume format "BPM:75,PULSE:512" or similar
        // For simplicity, let's assume the Arduino simply sends the raw analog value (0-1023)
        // If it sends BPM, that's better. We'll try to parse both.

        let rawPulse = 0;
        let bpm = this.currentBpm;

        if (dataString.includes('BPM:')) {
            // Format: "BPM:75,RAW:512"
            const parts = dataString.split(',');
            for (const p of parts) {
                if (p.startsWith('BPM:')) bpm = parseInt(p.substring(4));
                if (p.startsWith('RAW:')) rawPulse = parseInt(p.substring(4));
            }
        } else {
            // Just raw integer
            rawPulse = parseInt(dataString);
            if (isNaN(rawPulse)) return;
            // Generate mock BPM if not provided by hardware
            bpm = Math.floor(60 + (rawPulse % 40));
        }

        this.currentBpm = bpm;

        // Add to buffer
        this.pulseBuffer.push(rawPulse);
        if (this.pulseBuffer.length > 100) {
            this.pulseBuffer.shift(); // keep it at 100 length
        }

        // Notify UI
        this.onDataCallbacks.forEach(cb => cb(this.currentBpm, this.pulseBuffer, rawPulse));
    }

    testConnection() {
        // Simulation mode if no hardware is connected
        console.log("Starting Web Serial Simulation Mode since hardware may not be available immediately...");
        this.connected = true;
        this.notifyConnect();

        setInterval(() => {
            if (!this.connected) return;
            const simulatedRaw = 500 + Math.random() * 200 + Math.sin(Date.now() / 200) * 100;
            const simulatedBpm = 75 + Math.floor(Math.sin(Date.now() / 1000) * 15 + Math.random() * 5);
            this.processData(`BPM:${simulatedBpm},RAW:${Math.floor(simulatedRaw)}`);
        }, 50);
    }

    onData(callback) {
        this.onDataCallbacks.push(callback);
    }

    onConnect(callback) {
        this.onConnectCallbacks.push(callback);
    }

    onDisconnect(callback) {
        this.onDisconnectCallbacks.push(callback);
    }

    notifyConnect() {
        this.onConnectCallbacks.forEach(cb => cb());
    }

    notifyDisconnect() {
        this.onDisconnectCallbacks.forEach(cb => cb());
    }
}

const customSerial = new SerialManager();
window.customSerial = customSerial;
