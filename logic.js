// logic.js - Core application logic, mock AI generation, and deception probability calculation

class AIEngine {
    constructor() {
        this.baseQuestions = [
            "What is your full name?",
            "What is your date of birth?",
            "Where do you live?",
            "Are you currently employed?"
        ];

        // Mock generative responses based on context
        this.investigationQuestions = [];
        this.currentContext = "";

        // Final metrics for probability
        this.avgBaselinePulse = 0;
        this.avgBaselineSaccades = 0;

        this.anomalyCount = 0;
        this.totalAnalysisTicks = 0;

        // cumulative stress for final scoring
        this.stressSum = 0;

        // Reasons for final report
        this.rationale = [];
    }

    async setContext(context, subjectName = "Subject") {
        this.currentContext = context;
        console.log('🔄 setContext() called with:', { context: context?.substring(0, 50), subjectName });

        // Initialize empty array if needed
        if (!this.investigationQuestions) {
            this.investigationQuestions = [];
        }

        // Attempt to use Gemini agent if it has been initialized
        if (window.geminiAgent) {
            try {
                console.log('🤖 Attempting Gemini API for smart questions...');
                const questions = await window.geminiAgent.generateInvestigationQuestions(context, subjectName);
                if (Array.isArray(questions) && questions.length > 0) {
                    this.investigationQuestions = questions;
                    // Also use first 4 for calibration questions
                    this.baseQuestions = questions.slice(0, 4);
                    console.log('✅ Loaded', questions.length, 'questions from Gemini:', questions);
                    return;
                }
            } catch (e) {
                console.warn('⚠️ Gemini question generation failed:', e.message);
            }
        }

        // Fallback to built-in contextual questions
        console.log('📋 Using fall-back contextual questions');
        this.generateContextualQuestions(context, subjectName);
        
        // Safety check
        if (!this.investigationQuestions || this.investigationQuestions.length === 0) {
            console.error('❌ No questions generated! Using emergency defaults.');
            this.investigationQuestions = [
                "Can you tell us what you know about this incident?",
                "Where were you at the time this occurred?",
                "Have you discussed this incident with anyone?",
                "Is there anything you want to clarify about your involvement?",
                "Are you willing to answer any questions we ask?",
                "Tell me the truth: what happened?"
            ];
        }
        
        // Use first 4 investigation questions as calibration questions (even for fallback)
        this.baseQuestions = this.investigationQuestions.slice(0, 4);
        
        // Use first 4 investigation questions as calibration questions
        this.baseQuestions = this.investigationQuestions.slice(0, 4);
        
        console.log('✅ Final investigation questions count:', this.investigationQuestions.length);
        console.log('✅ Calibration (base) questions count:', this.baseQuestions.length);
        console.log('📝 Questions:', this.investigationQuestions);
    }

    generateContextualQuestions(context, subjectName = 'Subject') {
        const questions = [];
        const normalized = (context || '').replace(/\s+/g, ' ').trim();
        const contextLower = normalized.toLowerCase();

        // Determine keywords and entities from incident text
        const timeMatch = normalized.match(/(\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)|\b\d{1,2}:\d{2})/);
        const dateMatch = normalized.match(/\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
        const locationMatch = normalized.match(/(?:at|in|near|outside|inside)\s+([A-Za-z][A-Za-z\s]+?)(?:\.|,|\bwhen\b|\bwhere\b|\bwith\b|\bby\b|$)/i);
        const itemMatch = normalized.match(/(?:stolen|taken|missing|stole|lost|damaged|broken)\s+(?:a\s+)?([A-Za-z\s]+?)(?:\sfrom|\s+on|\s+in|\.|,|$)/i);
        const personMatch = normalized.match(/(?:with|by|from|witnessed by|owner|manager)\s+([A-Za-z][A-Za-z\s]+?)(?:\.|,|\s|$)/i);
        const incidentType = contextLower.includes('theft') ? 'theft' : contextLower.includes('assault') ? 'assault' : contextLower.includes('fraud') ? 'fraud' : 'incident';
        const cctv = contextLower.includes('cctv') || contextLower.includes('camera');
        const staff = contextLower.includes('staff') || contextLower.includes('employee') || contextLower.includes('manager');
        const access = contextLower.includes('access') || contextLower.includes('door') || contextLower.includes('entry');
        const witness = contextLower.includes('witness') || contextLower.includes('seen') || contextLower.includes('saw');

        if (subjectName && subjectName.trim()) {
            questions.push(`What can you tell me about your involvement, ${subjectName.trim()}?`);
        }

        if (dateMatch && timeMatch) {
            questions.push(`Can you describe what you were doing on ${dateMatch[0]} at ${timeMatch[1]} when this ${incidentType} occurred?`);
        } else if (timeMatch) {
            questions.push(`Can you account for your exact whereabouts at ${timeMatch[1]} during this ${incidentType}?`);
        } else if (dateMatch) {
            questions.push(`What were you doing on ${dateMatch[0]} when this ${incidentType} happened?`);
        } else {
            questions.push(`Tell me the exact timeline of events around this ${incidentType}.`);
        }

        if (locationMatch && locationMatch[1].trim()) {
            questions.push(`How does your account match what happened at ${locationMatch[1].trim()}?`);
        } else if (contextLower.includes('store') || contextLower.includes('shop') || contextLower.includes('office') || contextLower.includes('home')) {
            questions.push(`How familiar are you with the location where this ${incidentType} took place?`);
        }

        if (itemMatch && itemMatch[1].trim()) {
            questions.push(`What can you tell me about the ${itemMatch[1].trim()} mentioned in the report?`);
        } else {
            questions.push(`Were any objects taken, damaged, or moved during this ${incidentType}?`);
        }

        if (cctv) {
            questions.push(`Have you seen or are you aware of any camera footage from the scene?`);
        } else if (witness) {
            questions.push(`Who else saw you near the scene of the ${incidentType}?`);
        }

        if (staff || access) {
            questions.push(`Explain why you had access to this area and what you were doing there at the time.`);
        } else {
            questions.push(`How did you enter or leave the area where the incident occurred?`);
        }

        if (personMatch && personMatch[1].trim()) {
            questions.push(`Did ${personMatch[1].trim()} know anything about your presence or actions at that time?`);
        }

        questions.push(`Do you have any additional details that would help explain what happened?`);
        questions.push(`Looking back, is there anything about this ${incidentType} you want to clarify?`);

        // Fill to a minimum of eight questions and avoid duplicates
        const uniqueQuestions = [...new Set(questions)].slice(0, 8);
        while (uniqueQuestions.length < 8) {
            uniqueQuestions.push(`Please provide any further details related to this ${incidentType}.`);
        }

        this.investigationQuestions = uniqueQuestions;
        console.log('✅ Generated', this.investigationQuestions.length, 'contextual questions specific to incident:', this.investigationQuestions);
    }

    getQuestion(isCalibration, index) {
        if (isCalibration) {
            const q = index < this.baseQuestions.length ? this.baseQuestions[index] : null;
            console.log(`📌 getQuestion(calibration=${isCalibration}, index=${index}) = "${q}"`);
            return q;
        } else {
            const q = index < this.investigationQuestions.length ? this.investigationQuestions[index] : null;
            console.log(`📌 getQuestion(calibration=${isCalibration}, index=${index}) = "${q}"`);
            return q;
        }
    }

    calibrateBaseline(pulseBuffer, currentBpm, saccadesPerSec, blinksPerSec = 0) {
        // Average the buffer
        let sum = 0;
        let validPoints = 0;
        for (let p of pulseBuffer) {
            if (p > 0) { sum += p; validPoints++; }
        }
        const avgRaw = validPoints > 0 ? (sum / validPoints) : 0;

        // In a real scenario, baseline logic would run over ~30 seconds.
        this.avgBaselinePulse = currentBpm;
        this.avgBaselineSaccades = saccadesPerSec || 1;
        this.avgBaselineBlinks = blinksPerSec || 0.5; // set baseline blinks if provided
    }

    analyzeRealTme(currentBpm, saccadesPerSec, blinksPerSec = 0) {
        let stressScore = 0;
        this.totalAnalysisTicks++;

        // allow external eye measurements (from backend) to influence scoring
        const ext = this._externalEye || {};
        // override blink rate if backend provided one
        if (ext.blink_rate !== undefined) {
            blinksPerSec = ext.blink_rate;
        }
        // other features (duration, gaze, etc.) could be used to add more stress
        if (ext.blink_duration && ext.blink_duration > 0.3) {
            stressScore += 10; // long blink might indicate hesitation
            if (this.totalAnalysisTicks % 10 === 0) this.rationale.push(`Extended blink (${ext.blink_duration.toFixed(2)}s) observed.`);
        }
        if (ext.gaze_direction) {
            // penalize extreme gaze shifts
            const mag = Math.hypot(ext.gaze_direction.x, ext.gaze_direction.y);
            if (mag > 0.3) {
                stressScore += 10;
                if (this.totalAnalysisTicks % 15 === 0) this.rationale.push(`Looking away detected (gaze vector ${mag.toFixed(2)}).`);
            }
        }
        if (ext.micro_saccade_rate !== undefined) {
            if (ext.micro_saccade_rate > 1.0) {
                stressScore += 15;
                if (this.totalAnalysisTicks % 20 === 0) this.rationale.push(`High micro-saccade activity (${ext.micro_saccade_rate.toFixed(2)}/s).`);
            }
        }


        // 1. Analyze Pulse
        const bpmDiff = currentBpm - this.avgBaselinePulse;
        if (bpmDiff > 15) {
            stressScore += 40; // High sudden spike
            if (this.totalAnalysisTicks % 10 === 0) this.rationale.push(`Sudden cardiovascular spike detected: +${bpmDiff} BPM above baseline.`);
        } else if (bpmDiff > 5) {
            stressScore += 15; // Moderate elevation
        }

        // 2. Analyze Eye Movement (Saccades)
        // High saccades during answering can indicate cognitive load / deception
        if (saccadesPerSec > this.avgBaselineSaccades * 2.5) {
            stressScore += 40;
            if (this.totalAnalysisTicks % 15 === 0) this.rationale.push(`Irregular eye shifts (saccadic rate: ${saccadesPerSec}/sec) indicating high cognitive load.`);
        } else if (saccadesPerSec > this.avgBaselineSaccades * 1.5) {
            stressScore += 20;
        }

        // 3. Analyze Blink Rate
        // Rapid decrease in blink rate (concentration) or sudden spike can indicate stress
        const baselineBlinks = this.avgBaselineBlinks || 0.5; // default small non-zero
        if (baselineBlinks > 0) {
            if (blinksPerSec < baselineBlinks * 0.5) {
                stressScore += 20;
                if (this.totalAnalysisTicks % 12 === 0) this.rationale.push(`Significant blink suppression detected (blinks/sec: ${blinksPerSec}).`);
            } else if (blinksPerSec > baselineBlinks * 2) {
                stressScore += 20;
                if (this.totalAnalysisTicks % 12 === 0) this.rationale.push(`Excessive blinking detected (blinks/sec: ${blinksPerSec}).`);
            }
        }

        // Register anomaly
        if (stressScore > 50) {
            this.anomalyCount++;
        }

        // accumulate stress score for final probability calculation
        this.stressSum += stressScore;

        // Cap stress score for UI
        return Math.min(100, Math.max(0, stressScore));
    }

    processEyeFeatures(features) {
        // Features will be pushed here by tracking.js after backend analysis.
        // We don't recalc everything here, but we can use blink rate etc. to
        // bump initial stress score so analyzeRealTme() can incorporate it.
        if (!this._externalEye) this._externalEye = {};
        this._externalEye = { ...this._externalEye, ...features };
        // if logic.js is currently performing analyzeRealTme it will read this
    }

    calculateFinalProbability() {
        // Use average stress across analysis ticks as a more direct probability proxy
        const avgStress = (this.totalAnalysisTicks > 0) ? (this.stressSum / this.totalAnalysisTicks) : 0;
        // Map avgStress (0-100) directly to probability but dampen extremes
        let prob = Math.min(99.9, Math.max(0.0, avgStress));

        // Ensure unique rationale and cap the number
        this.rationale = [...new Set(this.rationale)].slice(0, 4);

        if (prob > 75) {
            this.rationale.push("Overall biometric profile strongly correlates with deceptive behavior signatures.");
        } else if (prob > 40) {
            this.rationale.push("Inconclusive variations detected. Moderate stress responses observed.");
        } else {
            this.rationale.push("Biometric baseline remained relatively stable.");
        }

        return {
            probability: prob.toFixed(1),
            reasons: this.rationale
        };
    }
}

window.aiEngine = new AIEngine();
