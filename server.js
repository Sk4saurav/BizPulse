const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Queue } = require('bullmq');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const supabase = require('./supabase');
const IORedis = require('ioredis');

const app = express();
app.use(cors());

// Phase 5: Razorpay Webhook Listener
app.post('/api/webhooks/razorpay', express.raw({type: 'application/json'}), (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());
    console.log(`[Razorpay Webhook] Received Event: ${event.event}`);

    // In production, verify razorpay signature using crypto
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '').update(req.body).digest('hex');
    const receivedSignature = req.headers['x-razorpay-signature'];
    if (expectedSignature !== receivedSignature) {
      console.error('[Razorpay Webhook] Invalid webhook signature detected. Potential abuse.');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    
    switch(event.event) {
      case 'subscription.activated':
        console.log(`Unlock access for subscription: ${event.payload.subscription.entity.id}`);
        // e.g. update profiles set subscription_status = 'active'
        break;
      case 'subscription.halted':
        console.log(`Lock access (grace period over) for subscription: ${event.payload.subscription.entity.id}`);
        // e.g. update profiles set subscription_status = 'halted'
        break;
      case 'subscription.cancelled':
        console.log(`Cancel access for subscription: ${event.payload.subscription.entity.id}`);
        // e.g. update profiles set subscription_status = 'cancelled'
        break;
      default:
        console.log(`Unhandled event type: ${event.event}`);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('Webhook Error');
  }
});

app.use(express.json());

// Set up Redis connection
const connection = process.env.REDIS_URL 
  ? new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null, family: 0, tls: { rejectUnauthorized: false } })
  : {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
      maxRetriesPerRequest: null
    };

// Set up BullMQ queue
const reportQueue = new Queue('ReportQueue', { connection });

// Set up file storage for Multer
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['.xlsx', '.xls', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Only Excel and CSV files are allowed.'));
  }
});

// Endpoint: Upload file and queue job
app.post('/api/jobs', (req, res, next) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    try {
      // Enqueue the job referencing the uploaded file path
      const job = await reportQueue.add('generate-report', {
        filePath: req.file.path,
        originalName: req.file.originalname
      });

      res.json({
        message: 'Job enqueued successfully',
        jobId: job.id
      });
    } catch (error) {
      console.error('Job enqueue error:', error);
      res.status(500).json({ error: 'Failed to enqueue job' });
    }
  });
});

// Endpoint: Poll job status
app.get('/api/jobs/:id/status', async (req, res) => {
  try {
    const job = await reportQueue.getJob(req.params.id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();
    const progress = job.progress;
    
    // In production, we'd fetch the pdf_url from a Supabase db
    // Here we can return the result if completed
    const result = job.returnvalue; 

    res.json({
      id: job.id,
      state, // 'waiting', 'active', 'completed', 'failed'
      progress,
      result: state === 'completed' ? result : null,
      failedReason: job.failedReason
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching job status' });
  }
});

// Endpoint: Download job PDF
app.get('/api/jobs/:id/download', async (req, res) => {
  try {
    const jobId = req.params.id;
    // Query Supabase for the generated report
    const { data: report, error } = await supabase
      .from('reports')
      .select('pdf_url')
      .eq('job_id', jobId)
      .single();

    if (error || !report) {
      return res.status(404).json({ error: 'Report not found or not ready.' });
    }

    // Return the signed URL from Supabase Storage
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('bizpulse-reports')
      .createSignedUrl(report.pdf_url, 3600); // 1 hour expiry

    if (signedUrlError || !signedUrlData) {
      return res.status(500).json({ error: 'Could not generate download link' });
    }

    res.redirect(signedUrlData.signedUrl);
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

// Basic Admin Endpoint to check queue depth
app.get('/admin', (req, res, next) => {
  const b64 = (req.headers.authorization || '').split(' ')[1] || '';
  const [u, p] = Buffer.from(b64, 'base64').toString().split(':');
  if (u === process.env.ADMIN_USER && p === process.env.ADMIN_PASS)
    return next();
  res.set('WWW-Authenticate','Basic realm="BizPulse Admin"');
  res.status(401).send('Unauthorized');
}, async (req, res) => {
  // Hardcoded basic auth could go here
  const [waiting, active, completed, failed] = await Promise.all([
    reportQueue.getWaitingCount(),
    reportQueue.getActiveCount(),
    reportQueue.getCompletedCount(),
    reportQueue.getFailedCount()
  ]);

  res.send(`
    <html>
      <head><title>Admin Panel - BizPulse Queue</title></head>
      <body style="font-family: sans-serif; padding: 20px;">
        <h2>Queue Diagnostics</h2>
        <ul>
          <li>Waiting: <b>${waiting}</b></li>
          <li>Active: <b>${active}</b></li>
          <li>Completed: <b>${completed}</b></li>
          <li>Failed: <b>${failed}</b></li>
        </ul>
      </body>
    </html>
  `);
});

// (Webhook moved to the top of the file)

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`[Server] BizPulse API running on port ${PORT}`);
});
