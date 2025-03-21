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

        // Validate password (corrected)
        if (sessions[Id].Pwd && sessions[Id].Pwd !== Pwd) {
            console.log("❌ Incorrect password for ID:", Id);
            return res.status(403).json({ error: "Invalid password" });
        }

        // Ensure MCQs exist (corrected)
        if (!sessions[Id].mcqs || !Array.isArray(sessions[Id].mcqs.mcqs) || sessions[Id].mcqs.mcqs.length === 0) {
            return res.status(400).json({ error: "MCQ data missing" });
        }

        // Validate index
        if (index < 0 || index >= sessions[Id].mcqs.mcqs.length) {
            return res.status(400).json({ error: "Invalid index" });
        }

        console.log(`Replacing question at index ${index} for session ${Id}...`);

        // Request new question from Gemini (corrected)
        const response = await generateMCQs(1, sessions[Id].mcqs.mcqs[index]?.question);
        
        // Validate response
        if (!response || !response.mcqs || response.mcqs.length === 0) {
            console.log("❌ Gemini API did not return a valid MCQ.");
            return res.status(500).json({ error: "Failed to generate a new MCQ" });
        }

        // Replace the old question (corrected)
        sessions[Id].mcqs.mcqs[index] = response.mcqs[0];
        console.log("✅ Question replaced successfully.");

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


