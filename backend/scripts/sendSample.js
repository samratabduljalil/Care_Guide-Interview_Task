// Usage: npm run sample   (server must be running)
const data = require('../data/sample.json');

fetch(`http://localhost:${process.env.PORT || 5000}/monitor`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
})
  .then((r) => r.json())
  .then((j) => console.log(JSON.stringify(j, null, 2)))
  .catch((e) => console.error('Failed:', e.message));
