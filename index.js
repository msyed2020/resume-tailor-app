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
