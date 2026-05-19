# Polygraph.AI Website - Real-Time Eye Lie Detection

This project combines a cyberpunk-themed frontend with a Python backend for real‑time eye‑based deception analysis.

## ⚠️ CRITICAL SETUP STEP

Before running anything, you **MUST** download the dlib face landmark model:

### Download dlib Model (Required!)

1. **Download** from: https://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2
   - File size: ~100 MB
   - This contains the pre-trained 68-point face landmark predictor

2. **Extract** the `.bz2` file:
   - **Windows**: Use 7-Zip, WinRAR, or WSL
   - **macOS/Linux**: `bunzip2 shape_predictor_68_face_landmarks.dat.bz2`

3. **Place** the resulting `.dat` file here:
   ```
   c:\Users\anees\OneDrive\Desktop\MINI\shape_predictor_68_face_landmarks.dat
   ```

4. **Verify** by running:
   ```powershell
   python test_backend.py
   ```
   You should see all ✓ checks pass.

---

## Features

* **Real-time webcam streaming** from browser to Python backend
* **Eye feature extraction** (OpenCV + dlib):
  - **Blink Rate** (blinks per second over 5-second window)
  - **Blink Duration** (length of last blink)
  - **Pupil Dilation** (dark-pixel ratio in eye ROI)
  - **Gaze Direction** (x, y vector relative to face center)
  - **Micro-saccades** (rapid eye shifts per second)
  - **Eye Fixation Time** (duration of current fixation)
* **REST API** (`/analyze`) connects frontend and backend
* **All metrics displayed in real-time** in the eye-tracking panel
* **Existing UI design preserved** – new functionality layered on top

---

## Running the System

### Step 1: Install Dependencies

Make sure you're in the workspace directory:

```powershell
cd C:\Users\anees\OneDrive\Desktop\MINI
pip install -r requirements.txt
```

Required packages:
- `flask` – web server
- `flask-cors` – cross-origin requests
- `opencv-python` – image processing
- `dlib` – face & landmark detection
- `numpy` – numerical computing

### Step 2: Verify Backend Setup

Run the diagnostic script:

```powershell
python test_backend.py
```

Expected output:
```
[1] Python Version: 3.11.5 ...  ✓
[2] Checking Required Packages:
    ✓ cv2
    ✓ dlib
    ✓ numpy
    ✓ flask
    ✓ flask_cors
[3] Checking for dlib Model File:
    ✓ Found: shape_predictor_68_face_landmarks.dat
       Size: 99,716,992 bytes (~95.1 MB)
...
```

If dlib model is missing, download it first (see CRITICAL SETUP above).

### Step 3: Start the Backend Server

```powershell
python server.py
```

Expected console output:
```
============================================================
  POLYGRAPH.AI EYE TRACKING SERVER
============================================================

✅ [SERVER] dlib models loaded successfully
   - Face detector: ready
   - Landmark predictor: shape_predictor_68_face_landmarks.dat

🚀 Starting Flask server on http://localhost:5000/
   Open this URL in your browser.

   (Press Ctrl+C to stop)
...
```

### Step 4: Open in Browser

Navigate to: **http://localhost:5000/**

- Grant webcam access when prompted
- Allow microphone if using voice features
- Position your face in the center of the video frame

### Step 5: Monitor the Backend Console

You should see real-time debug output like:

```
[/analyze] ✓ face detected at (120,80) size 180x200
[analyze_frame] ✓ features: pupil=0.125 gaze=(0.032,-0.015) blink_dur=0.143s fixation=1.234s blink_rate=0.80/s micro_rate=0.40/s
[/analyze] success: returning 7 features
```

If you see "no face detected" repeatedly:
- Move closer to camera
- Ensure good lighting
- Try repositioning your face

---

## What You Should See

The eye-tracking panel (left side) will display in real-time:

```
BIOMETRICS: PULSE RATE
  [Pulse graph]

OPTICAL: EYE TRACKING
  [Webcam with face mesh]
  
  Saccades/sec: 1.23
  Blinks/sec: 0.8
  
  Pupil: 0.12        ← dilation ratio
  Gaze: 0.03,-0.01   ← gaze vector
  Blink dur: 0.15s   ← last blink duration
  Fixation: 1.2s     ← current fixation length
  Micro-sacc/sec: 1.40
```

All values update every 500 ms when a face is detected.

---

## If Metrics Don't Show

### Check 1: Is the server running?
- Terminal should show no error messages
- Flask should print "Running on http://localhost:5000/"

### Check 2: Is dlib model present?
```powershell
python test_backend.py
```
Look for `✓ Found: shape_predictor_68_face_landmarks.dat`

### Check 3: Check browser console
- Press **F12** → **Console** tab
- Look for messages like:
  ```
  [tracker] sending frame to backend
  [tracker] backend response {features: {...}}
  ```
- If errors: "backend error response: no face detected"
  → Reposition your face & try again

### Check 4: Is your face in frame?
- Position your entire face in the center of the webcam
- Ensure adequate lighting
- Look directly at the camera

### Check 5: Check Flask logs
- Server terminal should show:
  ```
  [analyze_frame] ✓ face detected at (x,y) size WxH
  [analyze_frame] ✓ features: pupil=... gaze=... ...
  ```
- If you see "no face detected": adjust lighting/position

---

## Backend Details

The backend (`server.py`) processes frames as follows:

1. **Decode** base64 PNG frame from frontend
2. **Mirror** to match webcam orientation
3. **Detect face** using dlib's HOG detector
4. **Extract landmarks** (68 points including eyes)
5. **Compute metrics**:
   - Eye Aspect Ratio (EAR) → blink detection
   - Pupil area → dilation estimate
   - Iris center → gaze direction
   - Frame-to-frame movement → micro-saccades
   - Gaze velocity → fixation duration
6. **Return JSON** with all 7 features
7. **Frontend updates** UI in real-time

---

## Architecture

```
Browser (index.html)
    ↓
[Webcam stream]
    ↓
tracking.js (every 500 ms)
    ↓
[POST frame as PNG]
    ↓
Flask /analyze endpoint
    ↓
analyze_frame() - OpenCV + dlib
    ↓
[JSON: features]
    ↓
tracking.js parses response
    ↓
Update UI elements (pupil, gaze, etc.)
    ↓
[Display metrics]
```

---

## Files Overview

| File | Purpose |
|------|---------|
| `index.html` | UI with eye-tracking panel |
| `styles.css` | Cyberpunk visual theme |
| `tracking.js` | Webcam capture + backend POST |
| `server.py` | Flask backend + analysis logic |
| `requirements.txt` | Python dependencies |
| `test_backend.py` | Diagnostic script |
| `logic.js` | AI scoring (unchanged) |
| `serial.js`, `gemini-api.js` | Existing features (unchanged) |

---

## Troubleshooting

### "dlib model not loaded"
→ Download & place `shape_predictor_68_face_landmarks.dat` in workspace root

### "no face detected"
→ Ensure good lighting, position face in center, close proximity to camera

### Metrics all show "0" or "--"
→ Check Flask console output
→ Run `python test_backend.py` to verify setup
→ Check browser Console (F12) for POST errors

### Server crashes on startup
→ Run `python test_backend.py`
→ Check that all required packages are installed
→ Ensure port 5000 is not in use

---

## Notes

- The backend heuristics are intentionally simple; swap in your trained model as needed
- Metrics are smoothed over 5-second windows for blink/saccade rates
- Pupil dilation is approximated via dark-pixel threshold (not true photometry)
- All processing happens on your machine – no data sent to cloud
- The rest of the original UI (calibration, Gemini agent, pulse, etc.) remains unchanged

---

**Ready?** Run `python server.py` and open `http://localhost:5000/` 🚀
