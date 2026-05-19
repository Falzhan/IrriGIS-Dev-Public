const fs = require('fs');
const content = fs.readFileSync('./src/pages/Reports.jsx', 'utf8');
const newContent = content.replace(/\\n/g, '\n');
fs.writeFileSync('./src/pages/Reports.jsx', newContent);
console.log('Done');
