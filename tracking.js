// tracking.js - Handles Webcam and MediaPipe Face Tracking for Eye Movement

class EyeTracker {
    constructor(videoElement, canvasElement) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d');

        this.saccadesPerSec = 0;
        this.lastEyeX = 0;
        this.saccadeCount = 0;
        this.blinkCount = 0;
        this.blinksPerSec = 0;
        this.lastBlinkState = false;
        this.blinkThreshold = 0.35; // vertical/horizontal ratio threshold (tuned more permissive)
        this.trackingActive = false;

        // MediaPipe setup
        this.faceMesh = new FaceMesh({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
            }
        });

        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true, // Needed for iris tracking
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.faceMesh.onResults(this.onResults.bind(this));

        // Start 1-second interval to calculate saccades per second
        setInterval(() => {
            this.saccadesPerSec = this.saccadeCount;
            this.saccadeCount = 0;
            // Update UI if element exists
            const saccadeEl = document.getElementById('saccadeRate');
            if (saccadeEl) saccadeEl.innerText = this.saccadesPerSec;
            // Blink rate update (one decimal)
            this.blinksPerSec = this.blinkCount;
            this.blinkCount = 0;
            const blinkEl = document.getElementById('blinkRate');
            try {
                if (blinkEl) blinkEl.innerText = (this.blinksPerSec).toFixed(1);
            } catch (e) {
                if (blinkEl) blinkEl.innerText = String(this.blinksPerSec);
            }
        }, 1000);

        // backend settings
        // relative URL lets the same Flask server host both frontend and API
        this.backendUrl = '/analyze';
        this.lastBackendSend = 0;
        this.backendInterval = 500; // ms
    }

    async start() {
        // Start Webcam
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: 640, height: 480, facingMode: "user" }
                });
                this.video.srcObject = stream;

                // Once returning true, tell app it is connected
                this.video.onloadeddata = () => {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;

                    // Start MediaPipe
                    const camera = new Camera(this.video, {
                        onFrame: async () => {
                            if (this.trackingActive) {
                                await this.faceMesh.send({ image: this.video });
                                // occasionally send raw frame to backend
                                const now = Date.now();
                                if (now - this.lastBackendSend > this.backendInterval) {
                                    this.lastBackendSend = now;
                                    this.sendFrameToBackend();
                                }
                            }
                        },
                        width: 640,
                        height: 480
                    });
                    camera.start();
                    this.trackingActive = true;
                };
                return true;
            } catch (err) {
                console.error("Error accessing webcam: ", err);
                return false;
            }
        }
    }

    stop() {
        this.trackingActive = false;
        if (this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(track => track.stop());
        }
    }

    async sendFrameToBackend() {
        if (!this.backendUrl) return;
        try {
            const off = document.createElement('canvas');
            off.width = this.video.videoWidth;
            off.height = this.video.videoHeight;
            const c2 = off.getContext('2d');
            c2.drawImage(this.video, 0, 0);
            // use lossless PNG to avoid compression artifacts that can
            // confuse dlib; quality is not a concern since we send infrequently
            const dataUrl = off.toDataURL('image/png');
            console.log('[tracker] sending frame to backend');
            const resp = await fetch(this.backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ frame: dataUrl })
            });
            if (!resp.ok) {
                console.warn('[tracker] backend returned HTTP', resp.status);
                return;
            }
            const json = await resp.json();
            console.log('[tracker] backend response', json);
            if (json.error) {
                console.warn('backend error response', json.error);
                // clear UI metrics if face lost
                document.getElementById('pupilDilation').innerText = '--';
                document.getElementById('gazeDirection').innerText = '--';
                document.getElementById('blinkDuration').innerText = '--';
                document.getElementById('fixationTime').innerText = '--';
                document.getElementById('microSaccadeRate').innerText = '0';
                return;
            }
            if (json.features) {
                // update UI elements
                const { pupil_dilation, gaze_direction, blink_rate, blink_duration, fixation_time, micro_saccades, micro_saccade_rate } = json.features;
                console.debug('backend features', json.features);
                // update UI fields with fallbacks
                if (pupil_dilation !== undefined) document.getElementById('pupilDilation').innerText = pupil_dilation === null ? '--' : pupil_dilation.toFixed ? pupil_dilation.toFixed(2) : pupil_dilation;
                if (gaze_direction) {
                    document.getElementById('gazeDirection').innerText = `${parseFloat(gaze_direction.x).toFixed(2)},${parseFloat(gaze_direction.y).toFixed(2)}`;
                }
                if (blink_duration !== undefined) document.getElementById('blinkDuration').innerText = blink_duration.toFixed ? blink_duration.toFixed(2) : blink_duration;
                if (fixation_time !== undefined) document.getElementById('fixationTime').innerText = fixation_time.toFixed ? fixation_time.toFixed(2) : fixation_time;
                if (micro_saccades !== undefined) document.getElementById('microSaccades').innerText = micro_saccades;
                if (micro_saccade_rate !== undefined) document.getElementById('microSaccadeRate').innerText = micro_saccade_rate.toFixed ? micro_saccade_rate.toFixed(2) : micro_saccade_rate;
                if (blink_rate !== undefined) {
                    const el = document.getElementById('blinkRate');
                    if (el) el.innerText = blink_rate.toFixed ? blink_rate.toFixed(1) : blink_rate;
                }

                // let AI engine incorporate the new features if available
                if (window.aiEngine && typeof window.aiEngine.processEyeFeatures === 'function') {
                    window.aiEngine.processEyeFeatures(json.features);
                }
            }
        } catch (e) {
            console.warn('backend error', e);
        }
    }

    onResults(results) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw basic mesh
        if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
            const landmarks = results.multiFaceLandmarks[0];

            // Draw mesh
            drawConnectors(this.ctx, landmarks, FACEMESH_TESSELATION,
                { color: '#00f3ff22', lineWidth: 0.5 });

            // Draw eyes outlines
            drawConnectors(this.ctx, landmarks, FACEMESH_RIGHT_EYE, { color: '#ff2a2a' });
            drawConnectors(this.ctx, landmarks, FACEMESH_RIGHT_IRIS, { color: '#ff2a2a' });
            drawConnectors(this.ctx, landmarks, FACEMESH_LEFT_EYE, { color: '#00f3ff' });
            drawConnectors(this.ctx, landmarks, FACEMESH_LEFT_IRIS, { color: '#00f3ff' });

            // Calculate eye movement (Saccades detect rapid eye shifts)
            // Left Iris Center is index 468, Right Iris Center is 473
            if (landmarks[468]) {
                const currentEyeX = landmarks[468].x;
                const movement = Math.abs(currentEyeX - this.lastEyeX);

                // Threshold for a saccade (rapid shift)
                if (movement > 0.01) {
                    this.saccadeCount++;
                    // Trigger flash effect on canvas
                    this.ctx.fillStyle = 'rgba(255, 42, 42, 0.2)';
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }

                this.lastEyeX = currentEyeX;
            }

            // Calculate blink detection using vertical/horizontal eye ratios
            const dist = (a, b) => Math.hypot((a.x - b.x) * this.canvas.width, (a.y - b.y) * this.canvas.height);

            // Left eye landmarks: vertical approx 159 (upper) and 145 (lower); horizontal corners 33 & 133
            // Right eye landmarks: vertical approx 386 (upper) and 374 (lower); horizontal corners 362 & 263
            try {
                const leftUpper = landmarks[159];
                const leftLower = landmarks[145];
                const leftLeft = landmarks[33];
                const leftRight = landmarks[133];

                const rightUpper = landmarks[386];
                const rightLower = landmarks[374];
                const rightLeft = landmarks[362];
                const rightRight = landmarks[263];

                let leftRatio = 1;
                let rightRatio = 1;
                if (leftUpper && leftLower && leftLeft && leftRight) {
                    const v = dist(leftUpper, leftLower);
                    const h = dist(leftLeft, leftRight) || 1;
                    leftRatio = v / h;
                }
                if (rightUpper && rightLower && rightLeft && rightRight) {
                    const v = dist(rightUpper, rightLower);
                    const h = dist(rightLeft, rightRight) || 1;
                    rightRatio = v / h;
                }

                const isBlinking = (leftRatio < this.blinkThreshold) || (rightRatio < this.blinkThreshold);
                if (isBlinking && !this.lastBlinkState) {
                    // New blink event
                    this.blinkCount++;
                    // Visual cue
                    this.ctx.fillStyle = 'rgba(255,255,255,0.08)';
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                    // debug
                    if (window && window.console && window.console.debug) window.console.debug('Blink detected — total this sec:', this.blinkCount);
                }
                this.lastBlinkState = isBlinking;
            } catch (e) {
                // ignore landmark access errors
            }
        }
    }
}

window.EyeTracker = EyeTracker;
