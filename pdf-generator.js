const fs = require('fs');
const puppeteer = require('puppeteer');

let _browser;
async function getBrowser() {
  if (!_browser || !_browser.connected) {
    _browser = await puppeteer.launch({ 
      headless: "new", 
      executablePath: '/usr/bin/google-chrome-stable',
      timeout: 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--no-zygote',
        '--disable-gpu',
        '--memory-pressure-off',
        '--disable-software-rasterizer',
        '--window-size=1920,1080'
      ] 
    });
  }
  return _browser;
}

function scoreColor(score) {
  if (score >= 75) return '#1D9E75'; // green
  if (score >= 55) return '#BA7517'; // amber
  if (score >= 35) return '#D85A30'; // orange
  return '#E24B4A';                  // red
}

function scoreColorAlpha(score, opacity) {
  if (score >= 75) return `rgba(29,158,117,${opacity})`;
  if (score >= 55) return `rgba(186,117,23,${opacity})`;
  if (score >= 35) return `rgba(216,90,48,${opacity})`;
  return `rgba(226,75,74,${opacity})`;
}

function buildRedFlagsHtml(flags) {
  if (!flags || flags.length === 0) return '';
  const lis = flags.map(f => `<li>${f}</li>`).join('');
  return `
    <div class="red-flag-box">
      <div class="red-flag-title">Critical Risks Detected (Red Flags)</div>
      <ul style="color: #c53030; padding-left: 20px;">
        ${lis}
      </ul>
    </div>
  `;
}

function buildPrioritiesHtml(priorities) {
  if (!priorities || priorities.length === 0) return '';
  return priorities.map(p => `
    <div class="priority-card">
      <div class="priority-rank font-serif">${p.rank}</div>
      <div class="priority-content">
        <h4>${p.title} <span class="badge">${p.impact} impact</span></h4>
        <p><strong>Why now:</strong> ${p.why_now}</p>
      </div>
    </div>
  `).join('');
}

function buildModulesHtml(modules) {
  const titles = {
    pl: "P&L / Profitability",
    customers: "Customer Health",
    suppliers: "Supplier Risk",
    ops: "Operations",
    marketing: "Marketing",
    investment: "Investment Readiness"
  };

  let html = '';
  for (const [key, data] of Object.entries(modules)) {
    const findingsLis = data.findings ? data.findings.map(f => `<li>${f}</li>`).join('') : '';
    const recsLis = data.recommendations ? data.recommendations.map(r => `<li><strong>${r.title}:</strong> ${r.detail}</li>`).join('') : '';
    
    html += `
      <div class="module-card">
        <div class="module-header">
          <div class="module-title font-serif">${titles[key] || key}</div>
          <div class="module-score font-serif">${data.score}</div>
        </div>
        <div class="module-headline">${data.headline}</div>
        
        <div class="list-title">Key Findings</div>
        <div class="module-findings" style="margin-bottom: 20px;">
          <ul>${findingsLis}</ul>
        </div>
        
        <div class="list-title">Recommendations</div>
        <div class="module-recos">
          <ul>${recsLis}</ul>
        </div>
      </div>
    `;
  }
  return html;
}

async function generatePDF(analysisResult, outputPath = 'report.pdf') {
  console.log('[PDF] Generating report PDF...');
  
  // Read template
  let html = fs.readFileSync(__dirname + '/report-template.html', 'utf8');

  // Replace placeholders
  html = html.replace('{{DATE}}', new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric'}));
  html = html.replace('{{OVERALL_SCORE}}', analysisResult.overall_score);
  html = html.replace('{{HEALTH_LABEL}}', analysisResult.health_label);
  html = html.replace('{{EXECUTIVE_SUMMARY}}', analysisResult.executive_summary || '');
  
  const dynamicStyles = `
    <style>
      .score-circle {
        border-color: ${scoreColor(analysisResult.overall_score)};
        background: radial-gradient(circle, ${scoreColorAlpha(analysisResult.overall_score, 0.1)} 0%, transparent 70%);
        box-shadow: 0 0 40px ${scoreColorAlpha(analysisResult.overall_score, 0.2)};
      }
      .score-value {
        color: ${scoreColor(analysisResult.overall_score)};
      }
    </style>
  `;
  html = html.replace('</head>', dynamicStyles + '</head>');

  html = html.replace('{{RED_FLAGS_SECTION}}', buildRedFlagsHtml(analysisResult.all_red_flags));
  html = html.replace('{{PRIORITIES_LIST}}', buildPrioritiesHtml(analysisResult.top_3_priorities));
  html = html.replace('{{MODULES_GRID}}', buildModulesHtml(analysisResult.modules));

  // Launch Puppeteer
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' } // handled in css
  });

  await page.close();
  console.log(`[PDF] Report saved to ${outputPath}`);
}

module.exports = {
  generatePDF
};
