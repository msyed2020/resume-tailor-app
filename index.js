// routing/server u know the drill lol
const axios = require('axios');
const bodyParser = require('body-parser');
const express = require('express');
const pdf = require('html-pdf');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const session = require('express-session');
require('dotenv').config();

const app = express();

// Configure multer for PDF upload
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));
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

// Helper function to extract text from PDF
async function extractTextFromPDF(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF file');
  }
}

app.post('/generate', upload.single('resumeFile'), async (req, res) => {
  let resumeText = req.body.resume;

  // If a PDF file was uploaded, extract text from it
  if (req.file) {
    try {
      resumeText = await extractTextFromPDF(req.file.buffer);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  const { job } = req.body;

  if (!resumeText || !job) {
    return res.status(400).json({ error: 'Both resume and job description are required' });
  }

  const prompt = `
You are an expert resume writer. Please modify the following resume to better fit the job description using relevant keywords and experiences.

Resume:
${resumeText}

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
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'Resume Tailor App'
      }
    });

    if (!response.data || !response.data.choices || !response.data.choices[0]) {
      throw new Error('Invalid response from AI service');
    }

    const tailored = response.data.choices[0].message.content;
    
    // Store the original and tailored resumes in the session
    req.session = req.session || {};
    req.session.originalResume = resumeText;
    req.session.tailoredResume = tailored;

    // Return both versions for comparison
    res.json({
      original: formatResumeForDisplay(resumeText),
      tailored: formatResumeForDisplay(tailored)
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

// New endpoint to handle accepting changes and generating final PDF
app.post('/accept', async (req, res) => {
  if (!req.session || !req.session.tailoredResume) {
    return res.status(400).json({ error: 'No tailored resume found. Please generate one first.' });
  }

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
        <pre style="white-space: pre-wrap;">${req.session.tailoredResume}</pre>
      </body>
    </html>
  `;

  // Generate PDF and stream directly to user
  pdf.create(html, {
    format: 'Letter',
    border: {
      top: '1in',
      right: '1in',
      bottom: '1in',
      left: '1in'
    }
  }).toStream((err, stream) => {
    if (err) {
      console.error('PDF generation error:', err);
      return res.status(500).json({ error: 'Error creating PDF' });
    }

    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=tailored-resume.pdf');
    
    // Pipe the PDF stream directly to the response
    stream.pipe(res);
  });
});

// Helper function to format resume text for display
function formatResumeForDisplay(text) {
  // Convert line breaks to <br> tags
  return text.replace(/\n/g, '<br>');
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 5MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});