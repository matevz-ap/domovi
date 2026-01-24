import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PDF_URL = "https://servis.ssz-slo.si/porocilo.pdf";
const MODEL = process.env.MODEL || "anthropic/claude-sonnet-4";
const PROMPT = fs.readFileSync(path.join(__dirname, "prompt.txt"), "utf-8");

if (!process.env.OPEN_ROUTER) {
  console.error("Error: OPEN_ROUTER environment variable is required");
  process.exit(1);
}


async function extractDataWithOpenRouter() {
  console.log("Extracting data from PDF:", PDF_URL);
  console.log("Using model:", MODEL);
const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.OPEN_ROUTER}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          {
            type: "file",
            file: {
              filename: "porocilo.pdf",
              file_data: PDF_URL,
            },
          },
        ],
      },
    ],
    plugins: [
      { id: "file-parser", pdf: { engine: "pdf-text" } },
    ],
    stream: false,
  }),
});

  const result = await resp.json();

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

    const output = {
      ...extractedData,
      _metadata: {
        source: PDF_URL,
        extractedAt: new Date().toISOString(),
        script: "extract-pdf-data.js",
      },
    };

    const today = new Date().toLocaleDateString("en-CA");
    const outputPath = path.join(__dirname, "..", "src", "data", `${today}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log("Data saved to:", outputPath);

    // Update chart data
    const chartPath = path.join(__dirname, "..", "src", "data", "chart.json");
    let chartData = [];
    if (fs.existsSync(chartPath)) {
      chartData = JSON.parse(fs.readFileSync(chartPath, "utf-8"));
    }

    // Check if today's data already exists
    const existingIndex = chartData.findIndex((d) => d.date === today);
    const chartEntry = {
      date: today,
      freeSpots: extractedData.data.grandTotals.allApplications.freeSpots,
      activeApplications: extractedData.data.grandTotals.allApplications.active,
    };

    if (existingIndex >= 0) {
      chartData[existingIndex] = chartEntry;
    } else {
      chartData.push(chartEntry);
    }

    // Keep sorted by date
    chartData.sort((a, b) => a.date.localeCompare(b.date));

    fs.writeFileSync(chartPath, JSON.stringify(chartData, null, 2));
    console.log("Chart data updated:", chartPath);

    console.log("Extraction complete!");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
