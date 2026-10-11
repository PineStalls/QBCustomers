require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors()); // Jotform needs this
app.use(express.json());

const {
  QB_CLIENT_ID,
  QB_CLIENT_SECRET,
  QB_REFRESH_TOKEN,
  QB_REALM_ID,
  QB_ENVIRONMENT = 'production', // or 'sandbox'
  API_SECRET          // optional simple protection key
} = process.env;

const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const BASE_URL = QB_ENVIRONMENT === 'sandbox'
  ? 'https://sandbox-quickbooks.api.intuit.com'
  : 'https://quickbooks.api.intuit.com';

let cachedAccessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const auth = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64');

  const { data } = await axios.post(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: QB_REFRESH_TOKEN
    }),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      }
    }
  );

  // IMPORTANT: Intuit rotates the refresh token
  if (data.refresh_token) {
    console.log('New refresh token received – update your Render env var!');
    // In production you should persist the new refresh_token
  }

  cachedAccessToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in * 1000);
  return cachedAccessToken;
}

app.get('/customers', async (req, res) => {
  try {
    // Optional simple protection
    if (API_SECRET && req.headers.authorization !== `Bearer ${API_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const accessToken = await getAccessToken();

    // Query active customers (adjust MAXRESULTS as needed)
    const query = encodeURIComponent(
      `SELECT Id, DisplayName, CompanyName, PrimaryEmailAddr FROM Customer WHERE Active = true MAXRESULTS 1000`
    );

    const { data } = await axios.get(
      `${BASE_URL}/v3/company/${QB_REALM_ID}/query?query=${query}&minorversion=75`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        }
      }
    );

    const customers = data.QueryResponse?.Customer || [];

    // Format expected by Jotform Remote Data Dropdown
    const options = customers.map(c => ({
      id: c.Id,
      name: c.DisplayName || c.CompanyName || 'Unnamed',
      // you can add more fields if needed
      email: c.PrimaryEmailAddr?.Address || ''
    }));

    res.json(options);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
