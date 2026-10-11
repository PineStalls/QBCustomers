const express = require('express');
const axios = require('axios');
const app = express();

// Mock values - in production, fetch these securely from your DB or token manager
const QBO_ACCESS_TOKEN = 'eyJhbGciOiJkaXIiLCJlbmMiOiJBMTI4Q0JDLUhTMjU2IiwieC5vcmciOiJIMCJ9..xO2vFBOOKaU8cj5X8yadqA.vMrI7Q0Ar-7T2j023TND2jFuPk8ZHJcVCpORrWw5QondbjNT155HPJ_vCI6QB4xxKp_MDrC77rT_0qajdkqeBOJNguyUogzScT00bhEFpmga5Jxz5eQzOBt9RGcDCTXBtibIsq0JpAkx-sjzkxCaaIG9ylK08HLHVoXpLSviVfX-Wg20p_-1t44NB3pxx_48128Ri4u_abjMvYxqIgixE7ETTVU_Ad_efDK_lp24QbMfBU7xXoa7dzvnntcpvm7mW-LonB6mspsLUCbeEKLv4yvrKtkBNXFwF8OraghMFQxPVcNKyJEtzQ-deV7PVVl3AlfNY08k1_k76HnmYd0hGQYAJ0en1jo6Gba_zt2za61OLwS6ErWM9WBCAq_gfkoW5eKWVqaojTzsUU9cpqws9z-jL3plvXjUvPlwH8IGXs5ZXuUDOff6B9Y0J3vtz45o9EhMuclHzMz5vDFA49jR2IJazrkPAWvFNvTytqcl6Cg.sPFEuEpzYRGvHX6B4TBkOw';
const QBO_COMPANY_ID = '9341453660821839'; 

app.get('/api/jotform-customers', async (req, res) => {
    try {
        // QuickBooks Online data Query for Active Customers
        const query = "SELECT DisplayName, Id FROM Customer WHERE Active = true MAXRESULTS 500";
        
        const response = await axios({
            method: 'get',
            url: `https://quickbooks.api.intuit.com/v3/company/${QBO_COMPANY_ID}/query?query=${encodeURIComponent(query)}&minorversion=75`,
            headers: {
         'Authorization': `Bearer ${QBO_ACCESS_TOKEN}`,
         'Accept': 'application/json'
     }
});

        // Safe extraction of customers array
        const qboCustomers = response.data.QueryResponse.Customer || [];

        // Jotform expects an array of objects containing a 'label' and 'value'
        const formattedData = qboCustomers.map(customer => ({
            label: customer.DisplayName, // What the user sees in the dropdown
            value: customer.Id           // The backend ID attached to the submission
        }));

        // Respond back to Jotform's Remote Data Dropdown
        res.setHeader('Access-Control-Allow-Origin', '*'); // Essential for CORS bypass
        res.json(formattedData);

    } catch (error) {
        console.error('Error fetching from QuickBooks:', error.message);
        res.status(500).json({ error: 'Failed to retrieve QuickBooks customers.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
