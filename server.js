// 1. MUST BE THE ABSOLUTE FIRST LINES OF CODE IN YOUR ENTIRE FILE
require('dotenv').config();

const express = require('express');
const OAuthClient = require('intuit-oauth');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors()); 

// 2. HARDCODE fallback URLs to bypass Render environment loading bugs completely
const clientId = process.env.QBO_CLIENT_ID;
const clientSecret = process.env.QBO_CLIENT_SECRET;
const redirectUri = process.env.QBO_REDIRECT_URI || "https://onrender.com"; 

console.log("Initializing QBO Client with Redirect URI:", redirectUri);

const oauthClient = new OAuthClient({
  clientId: clientId,
  clientSecret: clientSecret,
  environment: 'sandbox', // Change to 'production' if using live QB keys
  redirectUri: redirectUri,
});

app.get('/', (req, res) => {
  res.send('QBO Middleware is running! Go to /login to authenticate, or /api/customers to fetch data.');
});

app.get('/login', (req, res) => {
  try {
    const authUri = oauthClient.authorizeUri({
      scope: [OAuthClient.scopes.Accounting],
      state: 'intuit-test',
    });
    res.redirect(authUri);
  } catch (error) {
    res.status(500).send(`Error creating authorization URI: ${error.message}`);
  }
});

app.get('/callback', async (req, res) => {
  try {
    const authResponse = await oauthClient.createToken(req.url);
    res.send('Successfully authenticated with QuickBooks! You can now use Jotform.');
  } catch (e) {
    res.status(500).send(`Authentication error: ${e.message}`);
  }
});

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
      console.log("Token expired. Attempting automated refresh...");
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

    res.json(formattedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running smoothly on port ${PORT}`));
