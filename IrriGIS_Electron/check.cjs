const fs = require('fs');
const content = fs.readFileSync('./src/pages/Reports.jsx', 'utf8');
let count = 0;
for (let i = 0; i < content.length - 1; i++) {
  if (content[i] === '\\' && content[i+1] === 'n') {
    count++;
    if (count < 10) console.log('Position', i, 'context:', content.substring(i-10, i+15));
  }
}
console.log('Total found:', count);
