// gemini-api.js - Google Gemini AI Integration for Dynamic Question Generation

class GeminiAIAgent {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
        this.isReady = !!apiKey;
        this.cachedQuestions = [];
    }

    setApiKey(apiKey) {
        this.apiKey = apiKey;
        this.isReady = !!apiKey;
    }

    async generateInvestigationQuestions(crimeDetails, subjectName = "Subject") {
        try {
            if (this.isReady && this.apiKey && this.apiKey.trim() !== '') {
                console.log('🔍 Using Gemini API to generate smart questions...');
                const result = await this.callGeminiAPI(crimeDetails, subjectName);
                if (result && Array.isArray(result) && result.length > 0) {
                    console.log('✅ Gemini API returned questions:', result.length);
                    return result;
                } else {
                    console.warn('⚠️ Gemini API returned empty/invalid result, using fallback');
                    return this.generateContextualQuestions(crimeDetails, subjectName);
                }
            } else {
                console.log('⚠️ No API key configured - using context-aware fallback questions');
                return this.generateContextualQuestions(crimeDetails, subjectName);
            }
        } catch (error) {
            console.error('❌ Error in question generation:', error.message);
            console.log('📋 Falling back to contextual questions...');
            return this.generateContextualQuestions(crimeDetails, subjectName);
        }
    }

    async callGeminiAPI(crimeDetails, subjectName) {
        const prompt = `You are an expert criminal investigator conducting a polygraph examination. A subject named "${subjectName}" is being questioned about the following incident:

INCIDENT DETAILS:
${crimeDetails}

Generate exactly 6 specific, targeted interrogation questions that:
1. Are directly relevant to the crime details provided
2. Mention specific details from the incident (people, places, objects, times)
3. Follow a logical progression from general context to specific details
4. Are designed to detect inconsistencies or deceptive responses
5. Are appropriate for a polygraph/lie detector examination
6. Require detailed answers (not simple yes/no)

YOU MUST Format your response as a valid JSON array with 6 questions. Example:
["Question 1?", "Question 2?", "Question 3?", "Question 4?", "Question 5?", "Question 6?"]

Output ONLY the JSON array, no other text, no markdown, no explanation.`;

        try {
            const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API Error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid API response structure');
            }

            const textContent = data.candidates[0].content.parts[0].text;
            console.log('📝 Raw API Response:', textContent);
            
            // Parse JSON from response - handle various formats
            let jsonArray = null;
            
            // Try direct JSON parse first
            try {
                jsonArray = JSON.parse(textContent);
            } catch (e) {
                // Try to extract JSON array from the text
                const jsonMatch = textContent.match(/\[\s*"[\s\S]*?"\s*\]/);
                if (jsonMatch) {
                    jsonArray = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error('Could not extract JSON array from response');
                }
            }

            if (!Array.isArray(jsonArray) || jsonArray.length === 0) {
                throw new Error('Response is not a valid array of questions');
            }

            // Ensure we have exactly 6 questions
            this.cachedQuestions = jsonArray.slice(0, 6);
            console.log('✅ Successfully generated', this.cachedQuestions.length, 'smart questions from Gemini');
            return this.cachedQuestions;

        } catch (error) {
            console.error('❌ Gemini API call failed:', error.message);
            throw error;
        }
    }

    generateContextualQuestions(crimeDetails, subjectName = "Subject") {
        // Enhanced fallback that creates context-specific questions
        console.log('🎯 Generating context-aware questions based on crime details...');
        
        const details = crimeDetails.toLowerCase();
        const contextQuestions = [];

        // Start with basic questions
        contextQuestions.push(`Where were you when the incident described in the details occurred?`);

        // Detect crime type keywords and add specific questions
        if (details.includes('robbery') || details.includes('theft') || details.includes('stolen')) {
            contextQuestions.push(`Have you ever stolen anything or been convicted of theft in the past?`);
            contextQuestions.push(`Do you know who committed this robbery/theft?`);
        }
        
        if (details.includes('murder') || details.includes('kill') || details.includes('death')) {
            contextQuestions.push(`Did you cause the death of the victim?`);
            contextQuestions.push(`Were you present at the location when the incident occurred?`);
        }
        
        if (details.includes('assault') || details.includes('attack') || details.includes('hit') || details.includes('beat')) {
            contextQuestions.push(`Did you physically harm the victim?`);
            contextQuestions.push(`What is your relationship to the victim?`);
        }
        
        if (details.includes('fraud') || details.includes('forgery') || details.includes('fake') || details.includes('deceive')) {
            contextQuestions.push(`Did you intentionally deceive anyone for financial gain?`);
            contextQuestions.push(`Are you responsible for the fraudulent transactions?`);
        }
        
        if (details.includes('drug') || details.includes('cocaine') || details.includes('heroin') || details.includes('meth')) {
            contextQuestions.push(`Do you use illegal drugs?`);
            contextQuestions.push(`Do you know who supplied these drugs?`);
        }

        // Add vehicle-related questions if mentioned
        if (details.includes('car') || details.includes('vehicle') || details.includes('sedan') || details.includes('truck') || details.includes('motorcycle')) {
            const vehicleMatch = details.match(/(white|black|blue|red|green|silver|gray|gold)\s+(car|sedan|truck|vehicle|motorcycle|suv|truck|bike)/i);
            if (vehicleMatch) {
                contextQuestions.push(`Do you own or have access to a ${vehicleMatch[1]} ${vehicleMatch[2]}?`);
            } else {
                contextQuestions.push(`Do you own or have access to any vehicles?`);
            }
        }

        // Extract specific names/locations if mentioned
        if (details.match(/[A-Z][a-z]+\s+(Street|Avenue|Road|Plaza|Park|Store|Bank|Station)/)) {
            const location = details.match(/[A-Z][a-z]+\s+(Street|Avenue|Road|Plaza|Park|Store|Bank|Station)/)[0];
            contextQuestions.push(`Have you ever been to ${location}?`);
        }

        // Final accusatory question
        contextQuestions.push(`Look directly at the camera and tell me: Are you being completely honest about your involvement in this incident?`);

        // Return first 6 questions
        const result = contextQuestions.slice(0, 6);
        
        // Pad with generic questions if needed
        while (result.length < 6) {
            result.push(`Can you provide more information about your activities related to this incident?`);
        }

        console.log('📋 Generated', result.length, 'contextual questions');
        return result;
    }

    async generateFollowUpQuestion(crimeDetails, previousAnswers, currentContext) {
        if (!this.isReady) {
            return this.getDefaultFollowUp(crimeDetails);
        }

        try {
            const answersText = previousAnswers.map((a, i) => `Q${i + 1}: ${a.question}\nA: ${a.answer}`).join('\n\n');
            
            const prompt = `You are an expert criminal investigator conducting a polygraph interview.

CASE DETAILS:
${crimeDetails}

CONVERSATION SO FAR:
${answersText}

CURRENT CONTEXT: ${currentContext}

Generate ONE follow-up question that:
1. Probes deeper into inconsistencies or suspicious answers
2. Is specific and targeted
3. Addresses the most important gaps in the subject's testimony
4. Is natural and flows from the conversation

Respond with ONLY the question, nothing else.`;

            const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt
                                }
                            ]
                        }
                    ]
                })
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.statusCode}`);
            }

            const data = await response.json();
            return data.candidates[0].content.parts[0].text.trim();

        } catch (error) {
            console.error('Error generating follow-up question:', error);
            return "Can you tell us more about your involvement in the incident?";
        }
    }

    getDefaultQuestions(context) {
        // This is deprecated - use generateContextualQuestions instead
        return this.generateContextualQuestions(context);
    }

    getDefaultFollowUp(context) {
        return "Can you provide more specific details about what you just mentioned?";
    }

    getCachedQuestions() {
        return this.cachedQuestions;
    }

    clearCache() {
        this.cachedQuestions = [];
    }
}

// Initialize global instance
window.geminiAgent = null;

// Function to initialize with API key
window.initializeGeminiAgent = function(apiKey) {
    if (!window.geminiAgent) {
        window.geminiAgent = new GeminiAIAgent(apiKey);
    } else {
        window.geminiAgent.setApiKey(apiKey);
    }
    return window.geminiAgent;
};
1       