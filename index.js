// routing/server u know the drill lol
const axios = require('axios');
const bodyParser = require('body-parser');
const express = require('express');
const pdf = require('html-pdf');

const path = require('path');
const fs = require('fs');

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);
app.set('views', path.join(__dirname, 'views'));

// open ai key by mr daddy


app.get('/', (req, res) => {
    res.render('index');
  });


  app.post('/generate', async (req, res) => {
    const { resume, job } = req.body;
  
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
        model: 'mistral/mistral-7b-instruct',
        messages: [{ role: 'user', content: prompt }],
      }, {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
  
      const tailored = response.data.choices[0].message.content;
      const html = `<html><body><pre style="font-family: Arial; font-size: 14px;">${tailored}</pre></body></html>`;
  
      const pdfPath = path.join(__dirname, 'public', 'resume.pdf');
      pdf.create(html).toFile(pdfPath, (err) => {
        if (err) return res.send('Error creating PDF');
        res.redirect('/resume.pdf');
      });
  
    } catch (error) {
      console.error(error.response?.data || error.message);
      res.status(500).send('AI request failed');
    }
  });
  