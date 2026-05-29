const OpenAI = require('openai');
const fs = require('fs');
const pdfParse = require('pdf-parse');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Extract skills from a CV file (PDF or DOCX).
 * @param {string} filePath - Absolute path to the uploaded CV file
 * @returns {Promise<string[]>} Array of extracted skill strings
 */
const extractSkills = async (filePath) => {
  try {
    let text = '';
    if (filePath.endsWith('.pdf')) {
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      text = data.text;
    } else {
      // For DOCX: read raw text (basic extraction — install mammoth for richer support)
      text = fs.readFileSync(filePath, 'utf8');
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a CV parser. Extract technical and professional skills from the provided CV text. Return ONLY a JSON array of skill strings, no explanation.'
        },
        {
          role: 'user',
          content: `Extract skills from this CV:\n\n${text.slice(0, 4000)}`
        }
      ],
      temperature: 0.1,
      max_tokens: 500
    });

    const raw = response.choices[0].message.content.trim();
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error('AI skill extraction failed:', err.message);
    return [];
  }
};

/**
 * Compute a match score between extracted skills and job requirements.
 * @param {string[]} extractedSkills - Skills from the CV
 * @param {string[]} jobRequirements - Requirements from the job listing
 * @returns {{ score: number, missingKeywords: string[] }}
 */
const computeMatchScore = (extractedSkills, jobRequirements) => {
  if (!jobRequirements || jobRequirements.length === 0) {
    return { score: 0, missingKeywords: [] };
  }

  const normalizedSkills = extractedSkills.map(s => s.toLowerCase().trim());
  const matched = jobRequirements.filter(req =>
    normalizedSkills.some(skill => skill.includes(req.toLowerCase().trim()))
  );
  const missingKeywords = jobRequirements.filter(req =>
    !normalizedSkills.some(skill => skill.includes(req.toLowerCase().trim()))
  );

  const score = Math.round((matched.length / jobRequirements.length) * 100);
  return { score, missingKeywords };
};

module.exports = { extractSkills, computeMatchScore };
