const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const filesToObfuscate = [
  'background.js',
  'popup.js'
];

// Create dist folder
if (!fs.existsSync('dist')) fs.mkdirSync('dist');

// Obfuscate files and write to dist
filesToObfuscate.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    const code = fs.readFileSync(filePath, 'utf8');
    const obfuscated = JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      controlFlowFlattening: true,
      controlFlowFlatteningThreshold: 0.75,
      numbersToExpressions: true,
      simplify: true,
      stringArrayShuffle: true,
      splitStrings: true,
      stringArrayThreshold: 0.75
    });
    fs.writeFileSync(path.join(__dirname, 'dist', file), obfuscated.getObfuscatedCode());
    console.log(`Obfuscated: ${file}`);
  }
});

// Copy static files
fs.copyFileSync('manifest.json', 'dist/manifest.json');
fs.copyFileSync('popup.html', 'dist/popup.html');
fs.copyFileSync('popup.css', 'dist/popup.css');
fs.cpSync('icons', 'dist/icons', { recursive: true });
