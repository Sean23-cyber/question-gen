const axios = require("axios");
const fs = require("fs");
const path = require("path");
const crypto=require('crypto');

const API_KEY = process.env.GEMINI_API_KEY;

async function generateMCQs(numq,text) {
    // Hardcoded prompt template
    const prompt = `Generate exactly ${numq} multiple-choice questions (MCQs) based on the following text.Strictly follow ${numq}.
Return a properly formatted JSON array with exactly ${numq} MCQs—no more, no less. No explanations.
Each MCQ should:
    1. Be clearly related to key concepts in the text
    2. Have exactly 4 options (A, B, C, D)
    3. Have only one correct answer
    4. Vary in difficulty (easy, medium, hard)

    Format your response as a JSON array with this structure:
    [
      {
        "question": "Question text goes here?",
        "options": {
          "A": "First option",
          "B": "Second option",
          "C": "Third option",
          "D": "Fourth option"
        },
        "correctAnswer": "A"
      }
    ]
    
    Here is the text to analyze:\n\n"${text}"`;

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, 
            {
               
                contents: [{ role: "user", content: prompt }]
                
            },
            {
       headers: {
            "Content-Type": "application/json",
          
        }
            }
    
        );

        // Extract JSON string from response
        const jsonString = response.data.response;
        
        // Check if JSON response exists
        if (!jsonString || typeof jsonString !== "string") {
            throw new Error("Invalid JSON response from LLaMA ");
        }

        const jsonMatch = jsonString.match(/\[\s*{[\s\S]*?}\s*\]/s);
        if (!jsonMatch) {
            console.error("Response received:", jsonString); // Debugging
            throw new Error("JSON format error: Cannot find valid MCQ array.");
        }
        
        const mcqString = jsonMatch[0].trim(); // Ensure no unwanted spaces or characters

        // if (startIndex === -1 || endIndex === 0) {
        //     throw new Error("JSON format error: Cannot find array brackets []");
        // }

        // mcqString = jsonString.substring(startIndex, endIndex);
        
        try {
            const mcqs = JSON.parse(mcqString);

            const Id=crypto.randomBytes(4).toString("hex");
            const Pwd=crypto.randomBytes(2).toString("hex");
            

            const output = {
                Id,
                Pwd,
                mcqs
            };


            // Save to a JSON file
            const fileName=`test_${Id}.json`;
            const filePath=path.join(__dirname, "test",fileName);

            fs.writeFileSync(filePath, JSON.stringify(output, null, 4), "utf8");
            console.log(`✅ MCQs saved to ${filePath}`);


            return output;

        } catch (error) {
            console.error("❌ Error parsing JSON:", error.message);
            return null;
        }

    } catch (error) {
        console.error("❌ API Request Failed:", error.message);
        return null;
    }
}




function validateSession(Id, Pwd, sessions){
if(!Id || !Pwd){
    return {error:"ID and password are requirerred"};

}

const session=sessions[Id];

if(!session){
    return{error:"session is not found"};
}

if(session.Pwd!==Pwd){
    return {error:"Incorrect password"};

}
if(Date.now()>session.expiresAt){
    delete sessions[Id];
    return {error:"Session expired"};
}

return { mcqs: session.mcqs };
}




module.exports = { generateMCQs,validateSession };
