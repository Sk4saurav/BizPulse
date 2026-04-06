require('dotenv').config();
const { Worker } = require('bullmq');
const { buildSummary } = require('./parser');
const { runFullAnalysis } = require('./analysis-runner');
const { generatePDF } = require('./pdf-generator');
const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');
const IORedis = require('ioredis');

const connection = process.env.REDIS_URL 
  ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null, family: 0, tls: { rejectUnauthorized: false } })
  : {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
      maxRetriesPerRequest: null
    };

const worker = new Worker('ReportQueue', async job => {
  const { filePath } = job.data;
  console.log(`[Worker] Starting job ${job.id} for file ${filePath}`);

  try {
    // Stage 1: Parsing Data
    await job.updateProgress({ stage: 'parsing', message: 'Parsing file...' });
    const summary = buildSummary(filePath);

    // Stage 2: AI Analysis
    await job.updateProgress({ stage: 'analyzing', message: 'Analyzing data...' });
    const analysis = await runFullAnalysis(summary);

    // Stage 3: PDF Generation
    await job.updateProgress({ stage: 'rendering', message: 'Generating PDF...' });
    // In production, we'd output to a standard location and upload to Supabase Storage here
    const outputPath = path.join(
      path.dirname(filePath),
      path.basename(filePath, path.extname(filePath)) + '-report.pdf'
    );
    await generatePDF(analysis, outputPath);

    await job.updateProgress({ stage: 'completed', message: 'PDF Ready' });
    console.log(`[Worker] Job ${job.id} completed successfully.`);

    // Upload to Supabase Storage
    const fileBuffer = fs.readFileSync(outputPath);
    const fileName = `${job.id}-report.pdf`;
    
    const { data: storageData, error: storageError } = await supabase.storage
      .from('bizpulse-reports')
      .upload(fileName, fileBuffer, {
        contentType: 'application/pdf',
        upsert: true
      });
      
    if (storageError) throw storageError;

    // Insert into DB
    const { error: dbError } = await supabase
      .from('reports')
      .insert([{ job_id: job.id, pdf_url: fileName }]);
      
    if (dbError) throw dbError;

    // Purge local PDF
    try { fs.unlinkSync(outputPath); } catch(e) {}

    return {
      fileName: fileName,
      overallScore: analysis.overall_score
    };

  } catch (error) {
    console.error(`[Worker] Job ${job.id} failed:`, error);
    throw error;
  } finally {
    try { fs.unlinkSync(filePath); } catch(e) {}
  }
}, { 
  connection,
  concurrency: 1,
  removeOnComplete: { count: 500, age: 60 * 60 * 24 }, // keep 500 jobs or 24hrs
  removeOnFail:    { count: 100 }
});

worker.on('failed', (job, err) => {
  console.log(`[Worker Error] Job ${job.id} has failed with err ${err.message}`);
});

console.log('[Worker] Worker started, listening to ReportQueue...');
