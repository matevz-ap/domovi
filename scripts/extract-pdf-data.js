import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_URL = "https://servis.ssz-slo.si/porocilo.pdf";
const OPENROUTER_API_KEY = process.env.OPEN_ROUTER;

if (!OPENROUTER_API_KEY) {
  console.error("Error: OPEN_ROUTER environment variable is required");
  process.exit(1);
}

async function extractDataWithOpenRouter() {
  console.log("Extracting data from PDF:", PDF_URL);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract all data from this PDF document and return it as a structured JSON object.

The PDF contains information about student dormitories (domovi) availability in Slovenia.

Return ONLY valid JSON with the following structure:
{
  "extractedAt": "<ISO timestamp>",
  "data": {
    // All extracted information organized logically
  }
}

Be thorough and extract all available information including names, numbers, dates, and any other relevant data.`,
            },
            {
              type: "file",
              file: {
                url: PDF_URL,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log("OpenRouter response received");

  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No content in OpenRouter response");
  }

  // Extract JSON from the response (handle markdown code blocks)
  let jsonStr = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse JSON from response:", content);
    throw new Error(`Failed to parse JSON from OpenRouter response: ${e.message}`);
  }
}

async function main() {
  try {
    const extractedData = await extractDataWithOpenRouter();

    // Add metadata
    const output = {
      ...extractedData,
      _metadata: {
        source: PDF_URL,
        extractedAt: new Date().toISOString(),
        script: "extract-pdf-data.js",
      },
    };

    // Save to src/data
    const outputPath = path.join(__dirname, "..", "src", "data", "porocilo.json");
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log("Data saved to:", outputPath);
    console.log("Extraction complete!");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
