// routing/server u know the drill lol
const axios = require('axios');
const bodyParser = require('body-parser');
const express = require('express');
const pdf = require('html-pdf');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);
app.set('views', path.join(__dirname, 'views'));

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// make sure the api key is set
if (!OPENROUTER_API_KEY) {
  console.error('Error: OPENROUTER_API_KEY environment variable is not set');
  process.exit(1);
}

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.post('/generate', async (req, res) => {
  const { resume, job } = req.body;

  if (!resume || !job) {
    return res.status(400).json({ error: 'Both resume and job description are required' });
  }

  const prompt = `
You are an expert resume writer. Please modify the following resume to better fit the job description using relevant keywords and experiences.

Resume:
${resume}

Job Description:
${job}

Return the improved resume in professional formatting (bullet points, spacing, etc).
`;

  try {
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'mistralai/mistral-7b-instruct:free',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2000
    }, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000', // Required by OpenRouter
        'X-Title': 'Resume Tailor App' // Optional but recommended
      }
    });

    if (!response.data || !response.data.choices || !response.data.choices[0]) {
      throw new Error('Invalid response from AI service');
    }

    const tailored = response.data.choices[0].message.content;
    const html = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; padding: 2rem; }
            h1, h2, h3 { color: #2d3748; }
            ul { margin: 1rem 0; }
            li { margin: 0.5rem 0; }
          </style>
        </head>
        <body>
          <pre style="white-space: pre-wrap;">${tailored}</pre>
        </body>
      </html>
    `;

    const pdfPath = path.join(__dirname, 'public', 'resume.pdf');
    
    pdf.create(html, {
      format: 'Letter',
      border: {
        top: '1in',
        right: '1in',
        bottom: '1in',
        left: '1in'
      }
    }).toFile(pdfPath, (err) => {
      if (err) {
        console.error('PDF generation error:', err);
        return res.status(500).json({ error: 'Error creating PDF' });
      }
      res.json({ success: true, pdfUrl: '/resume.pdf' });
    });

  } catch (error) {
    console.error('AI request error:', error.response?.data || error.message);
    let errorMessage = 'Failed to generate tailored resume. ';
    
    if (error.response?.data?.error) {
      errorMessage += error.response.data.error;
    } else if (error.response?.status === 401) {
      errorMessage += 'Authentication failed. Please check your API key.';
    } else if (error.response?.status === 429) {
      errorMessage += 'Rate limit exceeded. Please try again later.';
    } else {
      errorMessage += 'Please try again later.';
    }
    
    res.status(500).json({ error: errorMessage });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});