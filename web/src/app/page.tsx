"use client";

import { useState, useRef, useEffect } from "react";
import Script from "next/script";
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type JobState = "idle" | "uploading" | "queued" | "processing" | "completed" | "failed";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [jobState, setJobState] = useState<JobState>("idle");
  const [progressMsg, setProgressMsg] = useState("");
  const [currentJobId, setCurrentJobId] = useState("");
  const [hasUsedFreeTier, setHasUsedFreeTier] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  useEffect(() => {
    if (localStorage.getItem("bizpulse_free_tier")) {
      setHasUsedFreeTier(true);
    }
  }, []);

  const openRazorpay = () => {
    return new Promise((resolve, reject) => {
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY || "rzp_test_xxxxxxxxxxxx",
        amount: "2899900", // 28,999 INR in paise
        currency: "INR",
        name: "BizPulse Premium",
        description: "Unlimited Analysis",
        handler: function (response: any) {
          resolve(response.razorpay_payment_id);
        },
        theme: { color: "#1D9E75" }
      };
      
      if (!(window as any).Razorpay) return reject("Razorpay not loaded");
      
      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any) {
        reject(response.error.description);
      });
      rzp.open();
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const startAnalysis = async () => {
    if (!file) return;

    if (hasUsedFreeTier) {
      try {
        await openRazorpay();
      } catch (err) {
        setJobState("failed");
        setProgressMsg("Payment required to run further analysis.");
        return;
      }
    }

    setJobState("uploading");
    
    try {
      const formData = new FormData();
      formData.append("file", file);

      // In local dev, Express runs on 3000 but Next is also 3000. 
      // Assuming Express is running on 3001 or using CORS. Let's assume port 3001.
      const res = await fetch(`${API_BASE}/api/jobs`, {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Lock free tier
      localStorage.setItem("bizpulse_free_tier", "used");
      setHasUsedFreeTier(true);
      setCurrentJobId(data.jobId);

      setJobState("queued");
      pollJobStatus(data.jobId);
    } catch (err) {
      console.error(err);
      setJobState("failed");
      setProgressMsg("Failed to upload. Please try again.");
    }
  };

  const pollJobStatus = async (jobId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/jobs/${jobId}/status`);
        const data = await res.json();

        if (data.state === "completed" && data.result?.fileName) {
          setJobState("completed");
          setProgressMsg("Your report is ready!");
          clearInterval(interval);
        } else if (data.state === "failed") {
          setJobState("failed");
          setProgressMsg(data.failedReason || "Analysis failed.");
          clearInterval(interval);
        } else if (data.state === "active") {
          setJobState("processing");
          if (data.progress) {
            setProgressMsg(data.progress.message || "Analyzing data...");
          }
        } else {
          setJobState("queued");
          setProgressMsg("Waiting in queue...");
        }
      } catch (err) {
        // keep polling
      }
    }, 1500);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4 py-20 text-center relative overflow-hidden">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      {/* Background decorations */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald/5 rounded-full blur-[120px] pointer-events-none" />

      <h1 className="font-serif text-6xl md:text-8xl tracking-tight mb-6">
        The McKinsey for <br />
        <span className="text-emerald italic">Indian SMBs.</span>
      </h1>
      
      <p className="text-lg md:text-xl text-gray-400 max-w-2xl mb-12">
        Upload your raw sales data. Get a consultant-grade health report identifying P&L leaks, customer risks, and growth opportunities within 60 seconds.
      </p>

      {/* Main interactive area */}
      <div className="w-full max-w-xl bg-[#111827] border border-gray-800 rounded-3xl p-8 shadow-2xl relative z-10 transition-all">
        {jobState === "idle" && (
          <div 
            className="border-2 border-dashed border-gray-700 rounded-2xl p-12 hover:bg-white/[0.02] hover:border-emerald/50 transition-colors cursor-pointer flex flex-col items-center"
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              className="hidden" 
              accept=".csv,.xlsx,.xls"
              ref={fileInputRef}
              onChange={(e) => e.target.files && setFile(e.target.files[0])}
            />
            
            {file ? (
              <>
                <FileText className="w-12 h-12 text-emerald mb-4" />
                <div className="text-lg font-medium">{file.name}</div>
                <div className="text-sm text-gray-400 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
              </>
            ) : (
              <>
                <UploadCloud className="w-12 h-12 text-emerald mb-4 animate-bounce" />
                <div className="text-lg font-medium">Click or drag your data file here</div>
                <div className="text-sm text-gray-400 mt-2">Supports .CSV, .XLSX (Tally, Zoho exports) max 5MB</div>
              </>
            )}
          </div>
        )}

        {/* Loading / Progress States */}
        {(jobState === "uploading" || jobState === "queued" || jobState === "processing") && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-12 h-12 text-emerald animate-spin mb-6" />
            <div className="text-2xl font-serif mb-2">Analyzing your business</div>
            <div className="text-emerald font-medium animate-pulse">{progressMsg || "Uploading..."}</div>
          </div>
        )}

        {/* Completed State */}
        {jobState === "completed" && (
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="w-16 h-16 text-emerald mb-6" />
            <div className="text-2xl font-serif mb-2">Report Generated</div>
            <div className="text-gray-400 mb-8">Your consultant-grade PDF is ready.</div>
            <button 
              onClick={() => window.open(`${API_BASE}/api/jobs/${currentJobId}/download`, '_blank')}
              className="w-full py-4 rounded-xl bg-emerald hover:bg-emerald-hover text-white font-semibold transition-all">
              Download PDF Report
            </button>
          </div>
        )}

        {/* Failed State */}
        {jobState === "failed" && (
          <div className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="w-16 h-16 text-red-500 mb-6" />
            <div className="text-2xl font-serif mb-2">Analysis Failed</div>
            <div className="text-red-400 mb-8">{progressMsg}</div>
            <button 
              onClick={() => { setFile(null); setJobState("idle"); }}
              className="w-full py-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-white font-semibold transition-all"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Start Button */}
        {jobState === "idle" && (
          <button 
            disabled={!file}
            onClick={startAnalysis}
            className="w-full mt-6 py-4 rounded-xl bg-emerald hover:bg-emerald-hover text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {hasUsedFreeTier ? "Pay ₹28,999 & Generate Report" : "Generate Report (Free Trial)"}
          </button>
        )}
      </div>
      
      <div className="mt-20 text-gray-500 text-sm">
        🔒 All data is heavily encrypted. Files are permanently deleted after 90 seconds. No models are trained on your data.
      </div>
    </main>
  );
}
