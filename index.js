const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors()); 

// 👈 MANUALLY ENTER YOUR INTUIT COPIED STRINGS IN THESE EXACT QUOTES
const CLIENT_ID = 'ABEYdP6kacVC3MUK1LaKJPCsJrP5ugRLdVChCBw7hZaF7PMvsc';
const CLIENT_SECRET = 'A01XqO7KN3CA3yEgz7vHME0LIKQItG7pvAP9PwBu';
const REDIRECT_URI = 'https://qbcustomers.onrender.com';

console.log("Initializing QBO Client using explicit parameters.");

const oauthClient = new OAuthClient({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  environment: 'sandbox', 
  redirectUri: REDIRECT_URI,
});

// ROUTE 1: Explicit login path
app.get('/login', (req, res) => {
  try {
    console.log("Caught request on /login. Generating Intuit URI...");
    const authUri = oauthClient.authorizeUri({
      scope: ['com.intuit.quickbooks.accounting'], // Fixes explicit string array matching
      state: 'intuit-test',
    });
    console.log("Redirecting to Intuit: ", authUri);
    return res.redirect(authUri);
  } catch (error) {
    return res.status(500).send(`Error creating authorization URI: ${error.message}`);
  }
});

// ROUTE 2: Callback route
app.get('/callback', async (req, res) => {
  try {
    await oauthClient.createToken(req.url);
    return res.send('Successfully authenticated with QuickBooks! You can now use Jotform.');
  } catch (e) {
    return res.status(500).send(`Authentication error: ${e.message}`);
  }
});

// ROUTE 3: Jotform Fetch API
app.get('/api/customers', async (req, res) => {
  try {
    const token = oauthClient.getToken();
    if (!token || !token.access_token) {
      return res.status(401).json({ error: "Not authenticated. Please go to /login first." });
    }

    const companyId = token.realmId;
    const url = `https://intuit.com{companyId}/query?query=select * from Customer&minorversion=65`;

    let response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token.access_token}`,
        'Accept': 'application/json',
      }
    });

    if (response.status === 401) {
      await oauthClient.refresh();
      const newToken = oauthClient.getToken();
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${newToken.access_token}`,
          'Accept': 'application/json',
        }
      });
    }

    const data = await response.json();
    const customers = data.QueryResponse?.Customer || [];

    const formattedData = customers.map(cust => ({
      value: cust.Id,
      text: cust.DisplayName
    }));

    return res.json(formattedData);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// ROUTE 4: Home route with a direct clickable link to break browser address-bar caching
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body style="font-family: Arial, sans-serif; text-align: center; margin-top: 50px;">
        <h2>QBO Middleware Server is Live!</h2>
        <p>Do not type into the address bar. Click the button below to connect:</p>
        <a href="/login" style="display: inline-block; padding: 10px 20px; background-color: #2b78c5; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">👉 Click Here to Connect QuickBooks</a>
      </body>
    </html>
  `);
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server executing live on port ${PORT}`));
