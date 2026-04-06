const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const MODULE_WEIGHTS = { pl:0.30, customers:0.25, ops:0.15, suppliers:0.10, marketing:0.10, investment:0.10 };

let anthropic;
if (process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.includes('your_api_key_here')) {
  anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}



async function callClaude(module, summaryData) {
  if (!anthropic) {
    throw new Error('ANTHROPIC_API_KEY is missing. Production mode strictly requires a valid key.');
  }

  console.log(`[Claude AI] Running analysis module: ${module}...`);
  const prompt = `You are a McKinsey-level financial consultant analyzing an Indian SMB. 
Based on the following data: ${JSON.stringify(summaryData)}
Analyze the module: ${module}.
Identify key trends, specific numbers, and deep consultative insights.
Return ONLY a valid JSON object matching this spec exactly, with NO markdown formatting:
{
  "score": <0-100 integer>,
  "grade": "<A-F string>",
  "headline": "<A sharp, executive summary string>",
  "findings": ["<finding 1>", "<finding 2>"],
  "recommendations": [{"title": "<Rec 1>", "impact": "<high/medium/low>", "effort": "<high/medium/low>", "detail": "<Actionable detail...>"}],
  "red_flags": ["<Red flag 1 if any>"]
}`;

  const msg = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1500,
    system: "You return only JSON without any markdown formatting or wrapper.",
    messages: [{ role: "user", content: prompt }]
  });

  const responseText = msg.content[0].text.trim();
  const cleanedText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleanedText);
}

// Main safe caller for modules
async function runModuleSafe(module, summary) {
  try {
    return await callClaude(module, summary);
  } catch (err) {
    console.error(`Module ${module} failed:`, err.message);
    return {
      score: 50, grade: "C",
      headline: "Analysis incomplete — insufficient data for this module.",
      findings: ["Data for this section could not be processed.", "Please ensure relevant columns are present.", "Re-upload with complete data for a full score."],
      red_flags: [],
      recommendations: [{ title: "Re-upload with complete data", impact: "high", effort: "low", detail: "Ensure your file contains relevant columns." }]
    };
  }
}

async function callClaudeAggregator(moduleResults) {
  if (!anthropic) {
    throw new Error('ANTHROPIC_API_KEY is missing. Production mode strictly requires a valid key.');
  }

  console.log(`[Claude AI] Aggregating final results...`);
  const prompt = `Based on the following module analyses: ${JSON.stringify(moduleResults)}, provide an executive synthesis.
Return ONLY a valid JSON object matching this spec exactly, with NO markdown formatting:
{
  "executive_summary": "<Overall synthesis...>",
  "biggest_strength": "<The best thing...>",
  "biggest_risk": "<The most dangerous thing...>",
  "top_3_priorities": [
     { "rank": 1, "module": "<module key>", "title": "<title>", "why_now": "<reason>", "impact": "<high/medium/low>", "effort": "<high/medium/low>" }
  ]
}`;

  const msg = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1500,
    system: "You return only JSON without any markdown formatting.",
    messages: [{ role: "user", content: prompt }]
  });

  const responseText = msg.content[0].text.trim();
  const cleanedText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleanedText);
}

async function runAggregator(moduleResults, summary) {
  let weightedScore = 0;
  for (const mod in MODULE_WEIGHTS) {
    weightedScore += (moduleResults[mod]?.score || 50) * MODULE_WEIGHTS[mod];
  }
  
  let overall_score = Math.round(weightedScore);
  let overall_grade = overall_score >= 90 ? "A" : overall_score >= 75 ? "B" : overall_score >= 55 ? "C" : overall_score >= 35 ? "D" : "F";
  let health_label = overall_score >= 90 ? "Exceptional" : overall_score >= 75 ? "Healthy" : overall_score >= 55 ? "Average" : overall_score >= 35 ? "Below Average" : "Critical";

  let aiAggregation = {};
  try {
    aiAggregation = await callClaudeAggregator(moduleResults);
  } catch (err) {
    console.error('Aggregator failed, falling back to basic.', err);
    aiAggregation = {
      executive_summary: "Fallback executive summary due to API failure.",
      biggest_strength: "Unknown",
      biggest_risk: "Unknown",
      top_3_priorities: []
    };
  }

  return {
    overall_score,
    overall_grade,
    health_label,
    executive_summary: aiAggregation.executive_summary,
    biggest_strength: aiAggregation.biggest_strength,
    biggest_risk: aiAggregation.biggest_risk,
    all_red_flags: Object.values(moduleResults)
      .flatMap(m => m.red_flags || [])
      .filter((v, i, a) => a.indexOf(v) === i), // dedupe
    top_3_priorities: aiAggregation.top_3_priorities,
    module_scores: {
      pl: moduleResults.pl?.score || 0,
      customers: moduleResults.customers?.score || 0,
      ops: moduleResults.ops?.score || 0,
      suppliers: moduleResults.suppliers?.score || 0,
      marketing: moduleResults.marketing?.score || 0,
      investment: moduleResults.investment?.score || 0
    }
  };
}

async function runFullAnalysis(summary) {
  const modules = ["pl","customers","suppliers","ops","marketing","investment"];
  
  // Run all 6 modules in parallel
  const results = await Promise.all(
    modules.map(m => runModuleSafe(m, summary))
  );
  const moduleResults = Object.fromEntries(modules.map((m, i) => [m, results[i]]));

  // Run aggregator with all results
  const aggregated = await runAggregator(moduleResults, summary);

  return { ...aggregated, modules: moduleResults };
}

module.exports = {
  runFullAnalysis,
  runModuleSafe, // Exported for unit testing
  runAggregator  // Exported for unit testing
};
