const express=require('express');
const multer=require('multer');
const axios =require('axios');
const pdfParse=require("pdf-parse");
const fs=require("fs");

require("dotenv").config();


const app = express();
const {generateMCQs, validateSession}= require("./request");
const upload = multer({ dest: "uploads/" });

console.log("generateMCQs:", generateMCQs);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessions = {};

app.post("/generate-mcq",upload.single("file"),async(req,res)=>{
const upload = multer();

let text="";

try{

    console.log("📢 Received request to generate MCQs.");
    console.log("🛠️ req.body:", req.body);

if (req.file) {
    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(dataBuffer);
    text = pdfData.text;
} else if (req.body.text) {
    text = req.body.text;

} else {
    return res.status(400).json({ error: "No valid input provided." });
}

console.log("📜 Received text:", text);
let numq=parseInt(req.body.numq,10);
if (isNaN(numq) || numq <= 0) {
    numq = 10;
}
console.log("🔢 Number of MCQs:", numq);


const mcqs = await generateMCQs(numq,text);

const Id=mcqs.Id;
const Pwd=mcqs.Pwd;


let expiryTime = parseInt(req.body.expiry, 10);
if (isNaN(expiryTime) || expiryTime <= 0) {
expiryTime = 180; 
}

const expiresAt=Date.now()+expiryTime*1000;

sessions[Id]={Pwd,mcqs,expiresAt};

res.json({Id,Pwd,expiresAt });




} catch (error) {
res.status(500).json({ error: error.message });
}

});


app.post("/get-mcq", (req, res) => {
    const { Id, Pwd } = req.body;

    const result=validateSession(Id,Pwd,sessions);

    if(result.error){
        return res.status(403).json({error:result.error});
    }

    res.json({ mcqs: result.mcqs });
});

app.post("/replace-q", async (req, res) => {
    try {
        const { Id, index, Pwd } = req.body;

        // Validate session existence
        if (!sessions[Id]) {
            console.log("❌ Invalid session ID:", Id);
            return res.status(400).json({ error: "Invalid session ID" });
        }

        // Validate password
        if (sessions[Id].Pwd && sessions[Id].Pwd !== Pwd) {
            console.log("❌ Incorrect password for ID:", Id);
            return res.status(403).json({ error: "Invalid password" });
        }

        // Ensure MCQs exist
        if (!sessions[Id].mcqs || !Array.isArray(sessions[Id].mcqs.mcqs) || sessions[Id].mcqs.mcqs.length === 0) {
            return res.status(400).json({ error: "MCQ data missing" });
        }

        // Validate index
        if (index < 0 || index >= sessions[Id].mcqs.mcqs.length) {
            return res.status(400).json({ error: "Invalid index" });
        }

        console.log(`🔄 Replacing question at index ${index} for session ${Id}...`);

        const existingMCQs = sessions[Id].mcqs.mcqs.map(mcq => ({
            question: mcq.question.trim().toLowerCase(),
            options: mcq.options.map(opt => opt.trim().toLowerCase()).sort()
        }));

        let newMCQ = null;
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
            const response = await generateMCQs(1, sessions[Id].mcqs.mcqs[index]?.question);

            if (!response || !response.mcqs || response.mcqs.length === 0) {
                console.log("❌ Gemini API did not return a valid MCQ.");
                return res.status(500).json({ error: "Failed to generate a new MCQ" });
            }

            newMCQ = response.mcqs[0];
            const newQuestion = newMCQ.question.trim().toLowerCase();
            const newOptions = newMCQ.options.map(opt => opt.trim().toLowerCase()).sort();

            // Check uniqueness in both question and options
            const isDuplicate = existingMCQs.some(mcq =>
                mcq.question === newQuestion && JSON.stringify(mcq.options) === JSON.stringify(newOptions)
            );

            if (!isDuplicate) break;

            console.log(`⚠️ Duplicate MCQ detected. Retrying... (${attempts + 1}/${maxAttempts})`);
            attempts++;
        }

        if (attempts >= maxAttempts) {
            console.log("❌ Could not generate a fully unique MCQ after multiple attempts.");
            return res.status(500).json({ error: "Failed to generate a unique MCQ" });
        }

        console.log(`✅ Old Question: "${sessions[Id].mcqs.mcqs[index].question}"`);
        console.log(`✅ New Question: "${newMCQ.question}"`);

        sessions[Id].mcqs.mcqs[index] = newMCQ;

        res.json({ mcqs: sessions[Id].mcqs.mcqs });

    } catch (error) {
        console.error("❌ Error replacing MCQ:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

const port=process.env.PORT||8080;
app.listen(port,'0.0.0.0',() =>{ 
    console.log(`Server running on port ${port}`);

});


