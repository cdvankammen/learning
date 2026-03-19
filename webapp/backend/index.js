const express = require('express');
const pkg = require('./package.json');
const app = express();

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: pkg.version });
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`usbip backend listening on ${port}`));
