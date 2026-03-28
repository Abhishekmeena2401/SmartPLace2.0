require("dotenv").config();
const express  = require("express");
const mongoose = require("mongoose");
const multer   = require("multer");
const pdfParse = require("pdf-parse");
const axios    = require("axios");
const cors     = require("cors");
const path     = require("path");

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── STATIC FILES ─────────────────────────────────────────────────────────────
// Serves everything inside /public  (dashboard.html, index.html, etc.)
app.use(express.static(path.join(__dirname, "public")));

// ─── ROOT ROUTE ───────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage() });

// ─── MONGODB ──────────────────────────────────────────────────────────────────
// CORRECT URI:  includes /smartplace  database name  +  appName
const MONGO_URI = process.env.MONGO_URI ||
    "mongodb+srv://abhishekrbmeena_db_user:88TETLRJtWhCS7Qg@cluster0.mbrrugu.mongodb.net/smartplace?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected to smartplace"))
    .catch(err => console.error("❌ MongoDB Error:", err.message));

mongoose.connection.on("error", err =>
    console.error("MongoDB runtime error:", err.message)
);

// ─── SCHEMAS ──────────────────────────────────────────────────────────────────
// NOTE: collection name is passed explicitly to match your Atlas collections.
// Your Atlas has:  "companies", "courses", "quetions"  (quetions is a typo in Atlas)
// We map the model to the EXACT Atlas collection name using the 3rd argument.

const Question = mongoose.models.Question || mongoose.model(
    "Question",
    new mongoose.Schema({
        category: { type: String, lowercase: true, trim: true },
        question: String,
        options:  [String],
        answer:   String
    }),
    "quetions"   // ← exact Atlas collection name (has the typo — do NOT change)
);

const Course = mongoose.models.Course || mongoose.model(
    "Course",
    new mongoose.Schema({
        title:    String,
        platform: String,
        price:    String,
        link:     String,
        skill:    String,
        author:   String   // extra field present in your Atlas documents
    }),
    "courses"    // ← exact Atlas collection name
);

const Company = mongoose.models.Company || mongoose.model(
    "Company",
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
    }),
    "companies"  // ← exact Atlas collection name
);

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
    res.json({
        status : "ok",
        db     : mongoose.connection.readyState,
        dbName : mongoose.connection.name || "unknown"
        // db: 1 = connected, 0 = disconnected
    });
});

// ─── COURSES ──────────────────────────────────────────────────────────────────
app.get("/api/courses", async (req, res) => {
    try {
        const data = await Course.find().lean();
        console.log(`✅ Courses fetched: ${data.length}`);
        res.json(data);
    } catch (err) {
        console.error("Courses error:", err.message);
        res.status(500).json({ error: "Failed to fetch courses: " + err.message });
    }
});

// ─── QUIZ QUESTIONS ───────────────────────────────────────────────────────────
app.get("/api/questions/:skill", async (req, res) => {
    try {
        const skill = req.params.skill.trim().toLowerCase();
        console.log(`Fetching questions for skill: "${skill}"`);

        const data = await Question.aggregate([
            { $match:  { category: skill } },
            { $sample: { size: 10 } }
        ]);

        console.log(`Questions found: ${data.length}`);

        if (!data.length) {
            // Return all distinct categories to help debug
            const cats = await Question.distinct("category");
            console.log("Available categories:", cats);
            return res.status(404).json({
                error: `No questions found for "${skill}". Available: ${cats.join(", ")}`
            });
        }

        res.json(data);
    } catch (err) {
        console.error("Questions error:", err.message);
        res.status(500).json({ error: "Failed to fetch questions: " + err.message });
    }
});

// ─── COMPANIES ────────────────────────────────────────────────────────────────
app.get("/api/companies", async (req, res) => {
    try {
        const data = await Company.find().lean();
        console.log(`✅ Companies fetched: ${data.length}`);
        res.json(data);
    } catch (err) {
        console.error("Companies error:", err.message);
        res.status(500).json({ error: "Failed to fetch companies: " + err.message });
    }
});

// ─── RESUME ANALYZER ──────────────────────────────────────────────────────────
app.post("/analyze", upload.single("resume"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        if (!req.file.mimetype.includes("pdf")) {
            return res.status(400).json({ error: "Only PDF files are supported" });
        }

        // pdf-parse v1.x — pdfParse(buffer) is the function
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

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});