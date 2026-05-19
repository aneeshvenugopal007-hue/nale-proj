// app.js - Main Application Controller combining UI, Serial, and Tracking

document.addEventListener('DOMContentLoaded', () => {
    console.clear();
    console.log('═══════════════════════════════════════════════');
    console.log('🚀 POLYGRAPH.AI - INITIALIZATION STARTED');
    console.log('═══════════════════════════════════════════════');
    console.log('✅ DOM Content Loaded');
    console.log('Global aiEngine available:', !!window.aiEngine);
    console.log('Global geminiAgent available:', !!window.geminiAgent);

    // --- DOM Elements ---
    const views = {
        setup: document.getElementById('setupView'),
        calibration: document.getElementById('calibrationView'),
        analysis: document.getElementById('analysisView'),
        results: document.getElementById('resultsView')
    };

    // Inputs
    const subjectNameInput = document.getElementById('subjectName');
    const crimeDetailsInput = document.getElementById('crimeDetails');

    // Buttons
    const btnConnectHardware = document.getElementById('btnConnectHardware');
    const btnStartCalibration = document.getElementById('btnStartCalibration');
    const btnNextCalibration = document.getElementById('btnNextCalibration');
    const btnBeginAnalysis = document.getElementById('btnBeginAnalysis');
    const btnNextAnalysis = document.getElementById('btnNextAnalysis');
    const btnEndAnalysis = document.getElementById('btnEndAnalysis');
    const btnReset = document.getElementById('btnReset');

    // UI Feedback
    const pulseCanvas = document.getElementById('pulseCanvas');
    const bpmValue = document.getElementById('bpmValue');
    const webcamVideo = document.getElementById('webcamVideo');
    const trackingCanvas = document.getElementById('trackingCanvas');
    const hardwareStatus = document.querySelector('.hardware-status .dot');
    const cameraStatus = document.querySelector('.camera-status .dot');

    // App State Control
    let eyeTracker = null;
    let currentCalibQuestion = 0;
    let currentAnalysisQuestion = 0;
    let analysisInterval = null;

    // store Q&A during analysis for follow-up generation
    let analysisResponses = [];
    let lastAnalysisQuestion = null;

    // Voice reply / recording state
    let mediaRecorder = null;
    let audioChunks = [];
    let lastRecordedAudioBlob = null;
    let recordedAnswerURL = null;

    // Speech recognition
    let speechRecognition = null;
    let isListening = false;
    let recognitionTranscript = '';
    let recognitionFinalTranscript = '';

    // Canvas contexts
    const pulseCtx = pulseCanvas.getContext('2d');
    const blinkChart = document.getElementById('blinkChart');
    const blinkCtx = blinkChart ? blinkChart.getContext('2d') : null;
    let blinkHistory = [];
    const maxBlinkHistory = 60; // seconds

    // Resize canvases
    function resizeCanvases() {
        pulseCanvas.width = pulseCanvas.parentElement.clientWidth;
        pulseCanvas.height = pulseCanvas.parentElement.clientHeight;
        if (blinkChart) {
            // set logical canvas size to match CSS size for crisp rendering
            const style = getComputedStyle(blinkChart);
            const w = parseInt(style.width, 10) || 180;
            const h = parseInt(style.height, 10) || 56;
            blinkChart.width = w * (window.devicePixelRatio || 1);
            blinkChart.height = h * (window.devicePixelRatio || 1);
            blinkChart.style.width = `${w}px`;
            blinkChart.style.height = `${h}px`;
            if (blinkCtx) blinkCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
        }
    }
    window.addEventListener('resize', resizeCanvases);
    resizeCanvases();

    // --- Graph Rendering ---
    function drawPulseGraph(buffer) {
        pulseCtx.clearRect(0, 0, pulseCanvas.width, pulseCanvas.height);

        // Draw grid
        pulseCtx.strokeStyle = 'rgba(0, 243, 255, 0.1)';
        pulseCtx.lineWidth = 1;
        pulseCtx.beginPath();
        for (let i = 0; i < pulseCanvas.height; i += 20) {
            pulseCtx.moveTo(0, i);
            pulseCtx.lineTo(pulseCanvas.width, i);
        }
        pulseCtx.stroke();

        // Draw data
        pulseCtx.strokeStyle = '#00f3ff';
        pulseCtx.lineWidth = 2;
        pulseCtx.beginPath();

        const step = pulseCanvas.width / buffer.length;

        // Find min/max to normalize
        let min = Math.min(...buffer.filter(v => v > 0));
        let max = Math.max(...buffer);
        if (min === max) { min = 0; max = 1023; } // fallback
        const range = max - min || 1;

        for (let i = 0; i < buffer.length; i++) {
            const val = buffer[i];
            const x = i * step;
            // Normalize and scale to height
            const normalized = (val - min) / range;
            const y = pulseCanvas.height - (normalized * (pulseCanvas.height - 20)) - 10;

            if (i === 0) pulseCtx.moveTo(x, y);
            else pulseCtx.lineTo(x, y);
        }
        pulseCtx.stroke();
    }

    function drawBlinkChart() {
        if (!blinkCtx || !blinkChart) return;
        // draw small line chart of recent blink/sec values
        const w = blinkChart.width / (window.devicePixelRatio || 1);
        const h = blinkChart.height / (window.devicePixelRatio || 1);
        blinkCtx.clearRect(0, 0, w, h);
        // background
        blinkCtx.fillStyle = 'rgba(0,0,0,0.12)';
        blinkCtx.fillRect(0, 0, w, h);

        const data = blinkHistory.slice(-maxBlinkHistory);
        if (data.length === 0) return;
        const maxVal = Math.max(1, ...data);
        const stepX = w / Math.max(1, data.length - 1);

        blinkCtx.strokeStyle = '#00f3ff';
        blinkCtx.lineWidth = 1.5;
        blinkCtx.beginPath();
        data.forEach((v, i) => {
            const x = i * stepX;
            const y = h - (v / maxVal) * (h - 6) - 3;
            if (i === 0) blinkCtx.moveTo(x, y);
            else blinkCtx.lineTo(x, y);
        });
        blinkCtx.stroke();

        // draw small baseline marker
        blinkCtx.fillStyle = 'rgba(255,255,255,0.6)';
        blinkCtx.font = '11px Arial';
        blinkCtx.fillText(`${data[data.length-1].toFixed(1)} b/s`, 6, 12);
    }

    // --- Voice Recording ---
    const btnToggleRecording = document.getElementById('btnToggleRecording');
    const recordingStatus = document.getElementById('recordingStatus');
    const recordedAudio = document.getElementById('recordedAudio');
    const recordingHint = document.getElementById('recordingHint');

    function updateRecordingUI(isRecording) {
        if (isRecording) {
            btnToggleRecording.textContent = 'Stop Recording';
            btnToggleRecording.classList.add('danger');
            recordingStatus.textContent = 'Recording… speak now';
            recordingStatus.style.color = 'var(--neon-red)';
            recordedAudio.classList.add('hidden');
        } else {
            btnToggleRecording.textContent = 'Record Answer';
            btnToggleRecording.classList.remove('danger');
            recordingStatus.textContent = 'Recording stopped - speech converted';
            recordingStatus.style.color = 'var(--neon-green)';
        }
    }

    async function initializeMicrophone() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Microphone access is not supported by this browser.');
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.addEventListener('dataavailable', event => {
            if (event.data && event.data.size > 0) audioChunks.push(event.data);
        });

        mediaRecorder.addEventListener('stop', () => {
            lastRecordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            if (recordedAnswerURL) URL.revokeObjectURL(recordedAnswerURL);
            recordedAnswerURL = URL.createObjectURL(lastRecordedAudioBlob);
            recordedAudio.src = recordedAnswerURL;
            recordedAudio.classList.remove('hidden');
            recordedAudio.load();
            recordingHint.textContent = 'Audio reply recorded. You can playback or continue to the next question.';
        });

        // Initialize speech recognition for real-time transcription
        if (!speechRecognition) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                speechRecognition = new SpeechRecognition();
                speechRecognition.lang = 'en-US';
                speechRecognition.interimResults = true;
                speechRecognition.continuous = true;
                speechRecognition.maxAlternatives = 1;

                recognitionFinalTranscript = '';

                speechRecognition.onstart = () => {
                    isListening = true;
                    recognitionTranscript = '';
                    recordingStatus.textContent = 'Listening...';
                    recordingStatus.style.color = 'var(--neon-blue)';
                    console.log('🎤 Speech recognition started');
                };

                speechRecognition.onresult = (event) => {
                    let interimTranscript = '';

                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const transcript = event.results[i][0].transcript;
                        if (event.results[i].isFinal) {
                            recognitionFinalTranscript += transcript + ' ';
                        } else {
                            interimTranscript += transcript;
                        }
                    }

                    const displayText = (recognitionFinalTranscript + interimTranscript).trim();
                    recognitionTranscript = displayText;
                    document.getElementById('answerInput').value = displayText;
                    console.log('📝 Transcript:', displayText);
                };

                speechRecognition.onerror = (event) => {
                    console.warn('🔴 Speech recognition error:', event.error);
                    recordingStatus.textContent = 'Error: ' + event.error;
                    recordingStatus.style.color = 'var(--neon-red)';
                };

                speechRecognition.onend = () => {
                    isListening = false;
                    console.log('⏹️ Speech recognition ended');
                };
            } else {
                console.warn('⚠️ Speech Recognition API not supported in this browser');
                recordingStatus.textContent = 'Speech-to-text not supported';
                recordingStatus.style.color = 'var(--neon-yellow)';
            }
        }
    }

    async function toggleRecording() {
        try {
            if (!mediaRecorder) {
                await initializeMicrophone();
            }

            if (mediaRecorder.state === 'recording') {
                // Stop recording
                mediaRecorder.stop();
                if (speechRecognition && isListening) {
                    try {
                        speechRecognition.stop();
                    } catch (e) {
                        console.warn('Error stopping speech recognition:', e);
                    }
                }
                updateRecordingUI(false);
                recordingStatus.textContent = 'Recording stopped - Processing...';
                recordingStatus.style.color = 'var(--neon-green)';
            } else {
                // Start recording
                audioChunks = [];
                lastRecordedAudioBlob = null;
                recordedAnswerURL = null;
                recognitionTranscript = '';
                document.getElementById('answerInput').value = '';
                
                mediaRecorder.start();
                
                // Start speech recognition
                if (speechRecognition) {
                    try {
                        if (isListening) {
                            speechRecognition.stop();
                        }
                        recognitionFinalTranscript = '';
                        recognitionTranscript = '';
                        speechRecognition.start();
                        console.log('🎤 Speech recognition starting...');
                    } catch (e) {
                        console.warn('Error starting speech recognition:', e);
                        recordingStatus.textContent = 'Speech recognition failed';
                        recordingStatus.style.color = 'var(--neon-red)';
                    }
                } else {
                    console.warn('⚠️ Speech recognition not initialized');
                    recordingStatus.textContent = 'Speech-to-text unavailable';
                    recordingStatus.style.color = 'var(--neon-yellow)';
                }
                
                updateRecordingUI(true);
            }
        } catch (err) {
            console.error('Microphone initialization failed:', err);
            recordingStatus.textContent = 'Microphone unavailable';
            recordingStatus.style.color = 'var(--neon-yellow)';
        }
    }

    async function stopRecordingIfActive() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            if (speechRecognition && isListening) {
                try {
                    speechRecognition.stop();
                } catch (e) {
                    console.warn('Error stopping speech recognition:', e);
                }
            }
            updateRecordingUI(false);
            // give the browser a moment to finalize the blob and transcript
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    btnToggleRecording.addEventListener('click', toggleRecording);

    // --- Hardware Events ---
    window.customSerial.onConnect(() => {
        hardwareStatus.className = 'dot green';
        hardwareStatus.parentElement.dataset.tooltip = 'Arduino Connected (COM Port)';
        btnConnectHardware.textContent = "[CONNECTED]";
        btnConnectHardware.classList.add('primary');
        btnConnectHardware.classList.remove('secondary');
        checkSetupReady();
    });

    window.customSerial.onDisconnect(() => {
        hardwareStatus.className = 'dot red';
        hardwareStatus.parentElement.dataset.tooltip = 'Hardware Disconnected';
        btnConnectHardware.textContent = "[+] CONNECT COM PORT";
        btnConnectHardware.classList.remove('primary');
        btnConnectHardware.classList.add('secondary');
        checkSetupReady();
    });

    window.customSerial.onData((bpm, buffer, raw) => {
        bpmValue.textContent = bpm;
        drawPulseGraph(buffer);
    });

    // --- UI Logic ---
    function switchView(viewName) {
        console.log(`🎬 Switching view to: ${viewName}`);
        Object.entries(views).forEach(([name, v]) => {
            if (v) {
                v.classList.remove('active');
                v.classList.add('hidden');
            }
        });
        if (views[viewName]) {
            views[viewName].classList.remove('hidden');
            views[viewName].classList.add('active');
            console.log(`✅ ${viewName} view is now active`);
        } else {
            console.error(`❌ View "${viewName}" not found! Available views:`, Object.keys(views));
        }
    }

    function checkSetupReady() {
        if (subjectNameInput.value.trim() !== '' &&
            crimeDetailsInput.value.trim() !== '' &&
            window.customSerial.connected) {
            btnStartCalibration.disabled = false;
        } else {
            // Enable it anyway for testing if fields are filled, even without hardware
            if (subjectNameInput.value.trim() !== '' && crimeDetailsInput.value.trim() !== '') {
                btnStartCalibration.disabled = false;
            } else {
                btnStartCalibration.disabled = true;
            }
        }
    }

    subjectNameInput.addEventListener('input', checkSetupReady);
    crimeDetailsInput.addEventListener('input', checkSetupReady);
    
    // Check setup readiness on page load
    checkSetupReady();

    btnConnectHardware.addEventListener('click', async () => {
        if (!window.customSerial.connected) {
            // If the user cancels the serial prompt or browser doesn't support it,
            // fallback to mockup mode for demonstration purposes.
            try {
                if (navigator.serial) {
                    const success = await window.customSerial.connect();
                    if (!success) window.customSerial.testConnection();
                } else {
                    alert("Web Serial API not supported in this browser. Running in Simulation Mode.");
                    window.customSerial.testConnection();
                }
            } catch (e) {
                window.customSerial.testConnection();
            }
        }
    });

    btnStartCalibration.addEventListener('click', async () => {
        console.log('🔷 START ANALYSIS CLICKED (Skipping Calibration)');
        
        // Using fallback questions mode
        console.log('⚠️ Using fallback questions mode');

        // Generate investigation questions
        console.log('📋 Generating investigation questions...');
        try {
            await window.aiEngine.setContext(crimeDetailsInput.value, subjectNameInput.value);
            console.log('✅ Context set. Questions available:', window.aiEngine.investigationQuestions?.length || 0);
        } catch (e) {
            console.error('❌ Context initialization failed:', e);
            window.aiEngine.generateContextualQuestions(crimeDetailsInput.value);
            console.log('✅ Forced fallback questions. Total:', window.aiEngine.investigationQuestions.length);
        }

        // Switch directly to analysis (skip calibration)
        console.log('🎬 Switching to analysis view...');
        switchView('analysis');
        currentAnalysisQuestion = 0;
        analysisResponses = [];

        const firstQ = window.aiEngine.getQuestion(false, 0) || "No questions available. Please describe the incident more clearly.";
        lastAnalysisQuestion = firstQ;
        document.getElementById('analysisQuestion').textContent = firstQ;
        document.getElementById('answerInput').value = '';

        console.log('❓ First analysis question set:', firstQ.substring(0, 50) + '...');

        // Update status
        console.log('✅ AI Engine status: GREEN');

        // Attempt camera access (this will prompt for permissions)
        console.log('📹 Starting webcam access...');
        if (!eyeTracker) {
            eyeTracker = new window.EyeTracker(webcamVideo, trackingCanvas);
            try {
                const camSuccess = await eyeTracker.start();
                if (camSuccess) {
                    cameraStatus.className = 'dot green';
                    cameraStatus.parentElement.dataset.tooltip = 'Webcam Active';
                    console.log('✅ Webcam started successfully');
                } else {
                    console.warn('⚠️ Webcam start returned false - may be unavailable');
                    cameraStatus.className = 'dot yellow';
                }
            } catch (e) {
                console.warn('⚠️ Webcam error (app continues without video):', e.message);
                cameraStatus.className = 'dot yellow';
            }
        }

        // Start realtime analysis tick loop
        startAnalysisLoop();
        console.log('✅ ANALYSIS PHASE READY');
    });

    function updateCalibrationProgress() {
        // This function is kept for legacy compatibility but is no longer used
        console.log('⚠️ updateCalibrationProgress called but calibration is skipped');
    }

    btnNextCalibration.addEventListener('click', () => {
        // Legacy: no longer used since calibration is skipped
        console.log('⚠️ btnNextCalibration clicked but calibration is skipped');
    });

    btnNextAnalysis.addEventListener('click', async () => {
        const answerInput = document.getElementById('answerInput');
        const answer = answerInput.value.trim();

        await stopRecordingIfActive();

        // store previous Q&A if available
        if (lastAnalysisQuestion && (answer || lastRecordedAudioBlob)) {
            analysisResponses.push({
                question: lastAnalysisQuestion,
                answer,
                audioBlob: lastRecordedAudioBlob,
                audioUrl: recordedAnswerURL,
                recordedAt: new Date().toISOString()
            });
            lastRecordedAudioBlob = null;
            recordedAnswerURL = null;
            recordedAudio.classList.add('hidden');
        }
        answerInput.value = '';

        // try to generate a follow-up using Gemini agent if initialized
        if (window.geminiAgent) {
            try {
                const followUp = await window.geminiAgent.generateFollowUpQuestion(
                    crimeDetailsInput.value,
                    analysisResponses,
                    ''
                );
                if (followUp && followUp.trim() !== '') {
                    lastAnalysisQuestion = followUp;
                    document.getElementById('analysisQuestion').textContent = followUp;
                    return; // show new question, do not advance index
                }
            } catch (e) {
                console.warn('Follow-up generation failed, falling back to preset list.', e);
            }
        }

        // fallback to pre-generated investigation questions
        currentAnalysisQuestion++;
        const nextQ = window.aiEngine.getQuestion(false, currentAnalysisQuestion) || "(no further questions available)";
        if (nextQ) {
            lastAnalysisQuestion = nextQ;
            document.getElementById('analysisQuestion').textContent = nextQ;
        } else {
            // No more questions
            document.getElementById('analysisQuestion').textContent = "ALL QUESTIONS EXHAUSTED.";
            btnNextAnalysis.disabled = true;
        }
    });

    btnEndAnalysis.addEventListener('click', () => {
        clearInterval(analysisInterval);
        showResults();
    });

    function startAnalysisLoop() {
        const stressFill = document.getElementById('stressFill');
        const eyeShiftScore = document.getElementById('eyeShiftScore');

        analysisInterval = setInterval(() => {
            const saccades = eyeTracker ? eyeTracker.saccadesPerSec : 0;
            const blinks = eyeTracker ? eyeTracker.blinksPerSec : 0;
            const bpm = window.customSerial.currentBpm;

            const stress = window.aiEngine.analyzeRealTme(bpm, saccades, blinks);

            // update blink history
            blinkHistory.push(blinks);
            if (blinkHistory.length > maxBlinkHistory) blinkHistory.shift();
            drawBlinkChart();

            // UI Updates
            stressFill.style.width = stress + '%';
            if (stress > 70) stressFill.style.background = 'var(--neon-red)';
            else if (stress > 30) stressFill.style.background = 'var(--neon-yellow)';
            else stressFill.style.background = '#00ff00';

            // Eye text
            if (saccades > 3) {
                eyeShiftScore.textContent = "ERRATIC";
                eyeShiftScore.style.color = "var(--neon-red)";
            } else {
                eyeShiftScore.textContent = "NORMAL";
                eyeShiftScore.style.color = "var(--neon-blue)";
            }


        }, 1000);
    }

    // --- Results Phase ---
    function showResults() {
        switchView('results');

        const resultData = window.aiEngine.calculateFinalProbability();
        const probText = document.getElementById('finalProbability');
        const probCircle = document.getElementById('probCircle');
        const rationaleList = document.getElementById('rationaleList');

        // Animate Probability Number
        let currentProb = 0;
        const targetProb = parseFloat(resultData.probability);
        const animInterval = setInterval(() => {
            currentProb += targetProb / 40; // 40 steps
            if (currentProb >= targetProb) {
                currentProb = targetProb;
                clearInterval(animInterval);
            }
            probText.textContent = currentProb.toFixed(1);
        }, 50);

        // Set Circle
        requestAnimationFrame(() => {
            probCircle.style.strokeDasharray = `${targetProb}, 100`;
            if (targetProb > 70) probCircle.style.stroke = "var(--neon-red)";
            else if (targetProb > 40) probCircle.style.stroke = "var(--neon-yellow)";
            else probCircle.style.stroke = "#00ff00";
        });

        // Set Rationale
        rationaleList.innerHTML = '';
        resultData.reasons.forEach(r => {
            const li = document.createElement('li');
            li.textContent = r;
            rationaleList.appendChild(li);
        });
    }

    btnReset.addEventListener('click', () => {
        location.reload(); // Quickest way to safely reset all states
    });

});
