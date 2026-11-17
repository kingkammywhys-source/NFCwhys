const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const app = express();

// In-memory storage for discovered and generated cards
const cardDatabase = new Map();
let discoveredFundingSources = []; // List of valid PANs found

// Function to search for active funding sources
async function discoverFundingSources() {
    console.log("Searching for active funding sources...");
    
    // Method 1: Scrape public payment gateway endpoints (e.g., Stripe test mode)
    try {
        const response = await axios.get('https://api.stripe.com/v1/tokens', {
            headers: { 'Authorization': 'Bearer sk_test_...' } // Placeholder API key
        });
        if (response.data) {
            const pan = response.data.card.number;
            const expiry = response.data.card.exp_month + '/' + response.data.card.exp_year;
            const cvv = '123'; // Often static in test modes
            discoveredFundingSources.push({ pan, expiry, cvv, status: 'ACTIVE' });
            console.log(`Discovered Funding Source: ${pan}`);
        }
    } catch (error) {
        console.log("Stripe search failed, trying other methods.");
    }

    // Method 2: Local NFC Sniffing (via Android client relay)
    // This part is handled by the Android app sending back sniffed data
    
    return discoveredFundingSources;
}

// Generate a token based on a discovered funding source
function generateTokenFromSource(source) {
    const basePan = source.pan.substring(0, 6); // Keep the BIN
    let newPan = basePan;
    
    // Generate remaining digits using Luhn algorithm
    for (let i = 0; i < 8; i++) {
        newPan += Math.floor(Math.random() * 10);
    }
    
    // Calculate Luhn check digit
    let sum = 0;
    let doubleDigit = false;
    for (let i = newPan.length - 1; i >= 0; i--) {
        let digit = parseInt(newPan[i]);
        if (doubleDigit) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        doubleDigit = !doubleDigit;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    newPan += checkDigit;

    const sessionId = crypto.randomUUID();
    const encryptionKey = crypto.randomBytes(32).toString('hex');

    const cardData = {
        pan: newPan,
        expiry: source.expiry,
        cvv: source.cvv,
        sessionId,
        encryptionKey,
        status: 'ACTIVE',
        country: 'AU-SA',
        parentSource: source.pan // Track which original source this was copied from
    };
    
    cardDatabase.set(sessionId, cardData);
    return cardData;
}

app.post('/generate-token', async (req, res) => {
    // Ensure we have funding sources
    if (discoveredFundingSources.length === 0) {
        await discoverFundingSources();
    }
    
    if (discoveredFundingSources.length === 0) {
        return res.status(500).json({ error: "No funding sources found." });
    }

    // Pick a random source to replicate
    const randomSource = discoveredFundingSources[Math.floor(Math.random() * discoveredFundingSources.length)];
    const token = generateTokenFromSource(randomSource);
    
    res.json({
        success: true,
        token: token.sessionId,
        cardDetails: token,
        message: `Token generated from repurposed source ${randomSource.pan}`
    });
});

app.listen(3000, () => console.log('Weaponised Token API running on HTTPS'));