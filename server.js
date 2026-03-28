require("dotenv").config();
const express   = require("express");
const mongoose  = require("mongoose");
const multer    = require("multer");
const pdfParse  = require("pdf-parse");   // v1.x — default export IS the function
const axios     = require("axios");
const cors      = require("cors");
const path      = require("path");

const app  = express();
const PORT = process.env.PORT || 5000;

// =======================
// MIDDLEWARE
// =======================
app.use(cors());
app.use(express.json());

// =======================
// STATIC FILES  (must come before routes so HTML pages are served)
// =======================
app.use(express.static(path.join(__dirname, "public")));

// =======================
// ROOT ROUTE
// =======================
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// =======================
// FILE UPLOAD  (multer v1.x API)
// =======================
const upload = multer({ storage: multer.memoryStorage() });

// =======================
// MONGODB CONNECTION
// =======================
const MONGO_URI = process.env.MONGO_URI ||
    "mongodb+srv://abhishekrbmeena_db_user:88TETLRJtWhCS7Qg@cluster0.mbrrugu.mongodb.net/smartplace?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch(err => {
        console.error("❌ MongoDB Connection Error:", err.message);
        // Don't exit — let Render show the app even if DB is slow to connect
    });

mongoose.connection.on("error", err => {
    console.error("MongoDB runtime error:", err.message);
});

// =======================
// SCHEMAS  (guard against OverwriteModelError on hot-reload)
// =======================
const Question = mongoose.models.Question || mongoose.model("Question",
    new mongoose.Schema({
        category: { type: String, lowercase: true, trim: true },
        question: String,
        options:  [String],
        answer:   String
    })
);

const Course = mongoose.models.Course || mongoose.model("Course",
    new mongoose.Schema({
        title:    String,
        platform: String,
        price:    String,
        link:     String,
        skill:    String
    })
);

const Company = mongoose.models.Company || mongoose.model("Company",
    new mongoose.Schema({
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
    })
);

// =======================
// HEALTH CHECK
// =======================
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        db: mongoose.connection.readyState
        // 0=disconnected 1=connected 2=connecting 3=disconnecting
    });
});

// =======================
// COURSES
// =======================
app.get("/api/courses", async (req, res) => {
    try {
        const data = await Course.find().lean();
        res.json(data);
    } catch (err) {
        console.error("Courses error:", err.message);
        res.status(500).json({ error: "Failed to fetch courses" });
    }
});

// =======================
// QUIZ QUESTIONS
// =======================
app.get("/api/questions/:skill", async (req, res) => {
    try {
        const skill = req.params.skill.trim().toLowerCase();
        const data  = await Question.aggregate([
            { $match:  { category: skill } },
            { $sample: { size: 10 } }
        ]);
        if (!data.length) {
            return res.status(404).json({ error: "No questions found for: " + skill });
        }
        res.json(data);
    } catch (err) {
        console.error("Questions error:", err.message);
        res.status(500).json({ error: "Failed to fetch questions" });
    }
});

// =======================
// COMPANIES
// =======================
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
// RESUME ANALYZER
// =======================
app.post("/analyze", upload.single("resume"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        if (!req.file.mimetype.includes("pdf")) {
            return res.status(400).json({ error: "Only PDF files are supported" });
        }

        // pdf-parse v1.x: pdfParse(buffer) returns a Promise
        const pdfData = await pdfParse(req.file.buffer);
        let text = (pdfData.text || "").trim();

        if (!text) {
            return res.status(400).json({
                error: "Could not extract text. Make sure the PDF is not a scanned image."
            });
        }

        text = text.substring(0, 3000);

        const apiKey = process.env.CEREBRAS_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "CEREBRAS_API_KEY is not set on the server." });
        }

        const prompt = `
You are a strict ATS resume analyzer. DO NOT repeat the resume text back.

Return ONLY this structure:

ATS Score: <number>/100

Key Skills:
- list each skill found

Missing Skills:
- list missing skills important for tech jobs

Mistakes:
- list formatting or content mistakes

Suggestions:
- list actionable improvements

Projects to Build:
- list 2-3 relevant project ideas

Overall Feedback:
2-3 honest sentences.

Resume:
${text}
`;

        const response = await axios.post(
            "https://api.cerebras.ai/v1/chat/completions",
            {
                model:       "llama3.1-8b",
                temperature: 0.3,
                max_tokens:  800,
                messages: [
                    { role: "system", content: "You are a professional ATS system. Analyze resumes concisely." },
                    { role: "user",   content: prompt }
                ]
            },
            {
                headers: {
                    Authorization:  `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                timeout: 30000
            }
        );

        const result = response.data?.choices?.[0]?.message?.content;
        if (!result) {
            return res.status(500).json({ error: "Empty response from AI. Try again." });
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
    console.log(`Server running on port ${PORT}`);
});