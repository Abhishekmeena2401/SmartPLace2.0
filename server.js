require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const axios = require("axios");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// =======================
// MIDDLEWARE
// =======================
app.use(cors());
app.use(express.json());

// =======================
// ROOT ROUTE
// =======================
app.get("/", (req, res) => {
    res.redirect("/dashboard.html");
});

// =======================
// STATIC FILES
// =======================
app.use(express.static(path.join(__dirname, "public")));

// =======================
// FILE UPLOAD
// =======================
const upload = multer({ storage: multer.memoryStorage() });

// =======================
// MONGODB CONNECTION (FIXED URL)
// =======================
const MONGO_URI = process.env.MONGO_URI ||
    "mongodb+srv://abhishekrbmeena_db_user:88TETLRJtWhCS7Qg@cluster0.mbrrugu.mongodb.net/smartplace?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => {
        console.error("❌ MongoDB Error:", err.message);
        process.exit(1);
    });

// =======================
// SCHEMAS
// =======================
const questionSchema = new mongoose.Schema({
    category: { type: String, required: true, lowercase: true },
    question: { type: String, required: true },
    options:  { type: [String], required: true },
    answer:   { type: String, required: true }
});

const courseSchema = new mongoose.Schema({
    title:    String,
    platform: String,
    price:    String,
    link:     String,
    skill:    String
});

const companySchema = new mongoose.Schema({
    name:        String,
    summary:     String,
    description: String,
    cgpa:        String,
    package:     String,
    location:    String,
    difficulty:  String,
    roles:       [String],
    skills:      [String],
    rounds:      [String],
    eligibility: String,
    apply:       String
});

// Prevent OverwriteModelError on hot-reload
const Question = mongoose.models.Question || mongoose.model("Question", questionSchema);
const Course   = mongoose.models.Course   || mongoose.model("Course",   courseSchema);
const Company  = mongoose.models.Company  || mongoose.model("Company",  companySchema);

// =======================
// API ROUTES
// =======================

// Health check
app.get("/api/health", (req, res) => {
    res.json({ status: "ok", dbState: mongoose.connection.readyState });
});

// Courses
app.get("/api/courses", async (req, res) => {
    try {
        const data = await Course.find().lean();
        console.log("Courses fetched:", data.length);
        res.json(data);
    } catch (err) {
        console.error("Courses error:", err.message);
        res.status(500).json({ error: "Failed to fetch courses" });
    }
});

// Quiz questions by skill
app.get("/api/questions/:skill", async (req, res) => {
    try {
        const skill = req.params.skill.trim().toLowerCase();
        const data = await Question.aggregate([
            { $match: { category: skill } },
            { $sample: { size: 10 } }
        ]);
        if (!data.length) {
            return res.status(404).json({ error: `No questions found for skill: ${skill}` });
        }
        res.json(data);
    } catch (err) {
        console.error("Questions error:", err.message);
        res.status(500).json({ error: "Failed to fetch questions" });
    }
});

// Companies
app.get("/api/companies", async (req, res) => {
    try {
        const data = await Company.find().lean();
        res.json(data);
    } catch (err) {
        console.error("Companies error:", err.message);
        res.status(500).json({ error: "Failed to fetch companies" });
    }
});

// =======================
// RESUME ANALYZER (FIXED)
// =======================
app.post("/analyze", upload.single("resume"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        // Support PDF only; reject others early
        if (req.file.mimetype !== "application/pdf") {
            return res.status(400).json({ error: "Only PDF files are supported" });
        }

        const pdfData = await pdfParse(req.file.buffer);
        let text = (pdfData.text || "").trim();

        if (!text) {
            return res.status(400).json({ error: "Could not extract text from PDF. Ensure it is not a scanned image." });
        }

        // Limit tokens sent to API
        text = text.substring(0, 3000);

        const prompt = `
You are a strict ATS resume analyzer. DO NOT repeat the resume text back.

Return ONLY this structure:

ATS Score: <number>/100

Key Skills:
- list each skill

Missing Skills:
- list missing skills important for tech jobs

Mistakes:
- list formatting/content mistakes

Suggestions:
- list actionable improvements

Projects to Build:
- list 2-3 relevant project ideas

Overall Feedback:
Write 2-3 sentences of honest feedback.

Resume text:
${text}
`;

        const apiKey = process.env.CEREBRAS_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "CEREBRAS_API_KEY not set in environment" });
        }

        const response = await axios.post(
            "https://api.cerebras.ai/v1/chat/completions",
            {
                model: "llama3.1-8b",
                temperature: 0.3,
                max_tokens: 800,
                messages: [
                    { role: "system", content: "You are a professional ATS system. Analyze resumes concisely." },
                    { role: "user", content: prompt }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                timeout: 30000
            }
        );

        const result = response.data?.choices?.[0]?.message?.content;
        if (!result) {
            return res.status(500).json({ error: "Empty response from AI API" });
        }

        res.json({ result });

    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        console.error("Resume analysis error:", msg);
        res.status(500).json({ error: "Resume analysis failed: " + msg });
    }
});

// =======================
// START SERVER
// =======================
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
