const express = require('express');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '../../frontend'))); // serves the UI
app.use('/', routes);

app.use(errorHandler);
module.exports = app;
