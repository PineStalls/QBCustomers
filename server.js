require('dotenv').config();
const express = require('express');
const QuickBooks = require('node-quickbooks');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and allow cross-origin requests from Jotform
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

/**
 * Initialize QuickBooks SDK
 * Note: In a production environment, you should dynamically retrieve these tokens 
 * from your database and handle token refresh logic when they expire.
 */
function getQBOInstance() {
  return new QuickBooks(
    process.env.QBO_CLIENT_ID,
    process.env.QBO_CLIENT_SECRET,
    process.env.QBO_ACCESS_TOKEN,
    false, // No token secret for OAuth 2.0
    process.env.QBO_REALM_ID,
    process.env.NODE_ENV === 'production' ? false : true, // useSandbox flag
    true,  // debugging flag
    '4.0', // Minor version API
    '2.0'  // OAuth version
  );
}

// Endpoint to feed Jotform Remote Data Dropdown
app.get('/api/qbo-customers', (req, res) => {
  // Optional security token check matching what you type into Jotform settings
  const authHeader = req.headers.authorization;
  if (process.env.JOTFORM_SECRET_TOKEN && authHeader !== `Bearer ${process.env.JOTFORM_SECRET_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const qbo = getQBOInstance();
  
  // Capture Jotform's real-time search query parameter if configured
  const searchTerm = req.query.search || '';
  
  // Construct Intuit SQL query (Active Customers only)
  let query = "SELECT Id, DisplayName, PrimaryEmailAddr FROM Customer WHERE Active = true";
  if (searchTerm) {
    // Escape single quotes to prevent injection issues in Intuit SQL
    const safeSearch = searchTerm.replace(/'/g, "\\'");
    query += ` AND DisplayName LIKE '%${safeSearch}%'`;
  }
  query += " MAXRESULTS 50"; // Keeps response quick for the UI dropdown

  // Query QuickBooks Online API
  qbo.findCustomers({ select: query }, (err, data) => {
    if (err) {
      console.error('QuickBooks API Error:', err);
      return res.status(500).json({ error: 'Failed to fetch data from QuickBooks' });
    }

    // Extract the customer array cleanly
    const customers = data.QueryResponse.Customer || [];

    // Map into the exact JSON array expected by Jotform
    const formattedCustomers = customers.map(c => ({
      id: c.Id,
      displayName: c.DisplayName,
      email: c.PrimaryEmailAddr ? c.PrimaryEmailAddr.Address : ''
    }));

    // Wrap the array inside an object matching your "List Path in Response"
    res.json({
      qbo_customers: formattedCustomers
    });
  });
});

app.listen(PORT, () => {
  console.log(`Middleware server running on port ${PORT}`);
});
