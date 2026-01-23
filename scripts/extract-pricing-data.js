import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OPENROUTER_API_KEY = process.env.OPEN_ROUTER;
const MODEL = process.env.MODEL || "anthropic/claude-sonnet-4";
const PROMPT = fs.readFileSync(path.join(__dirname, "pricing-prompt.txt"), "utf-8");
const CENIKI = JSON.parse(fs.readFileSync(path.join(__dirname, "pricing-urls.json"), "utf-8"));

if (!OPENROUTER_API_KEY) {
  console.error("Error: OPEN_ROUTER environment variable is required");
  process.exit(1);
}

const SCHEMA = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description: "Full official name of the facility",
    },
    address: {
      type: "object",
      properties: {
        street: { type: "string", description: "The name of the street" },
        number: { type: "string", description: "The building or house number" },
        post_code: { type: "string", description: "The postal/zip code" },
        city: { type: "string", description: "The city or settlement name" },
      },
      required: ["street", "number", "post_code", "city"],
    },
    effective_date: {
      type: "string",
      description: "The date the price list becomes valid (ISO format YYYY-MM-DD)",
    },
    room_pricing: {
      type: "array",
      items: {
        type: "object",
        properties: {
          room_type: {
            type: "string",
            description: "Description of the room type and its features",
          },
          daily_rate: {
            type: "number",
            description: "The price per day in EUR",
          },
          monthly_rate: {
            type: "number",
            description: "The average monthly price (based on 30.417 days)",
          },
        },
        required: ["room_type", "daily_rate", "monthly_rate"],
      },
      description: "A list of available room configurations and their total costs",
    },
    absence_deduction_daily: {
      type: "number",
      description: "The daily credit/discount for announced absence",
    },
  },
  required: ["name", "address", "effective_date", "room_pricing", "absence_deduction_daily"],
};

async function extractPricingFromPdf(fileUrl) {
  console.log("Extracting pricing from:", fileUrl);

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "eldercare_pricing",
          schema: SCHEMA,
          strict: true,
        },
      },
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the pricing data from this PDF." },
            {
              type: "file",
              file: {
                filename: "cenik.pdf",
                file_data: fileUrl,
              },
            },
          ],
        },
      ],
      plugins: [
        { id: "file-parser", pdf: { engine: "pdf-text" } },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("No content in OpenRouter response");
  }

  // Parse JSON from response
  let parsed;
  if (typeof content === "string") {
    // Handle markdown code blocks
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    parsed = JSON.parse(jsonStr);
  } else {
    parsed = content;
  }

  return parsed;
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const pricingDir = path.join(__dirname, "..", "src", "data", "pricing");

  // Ensure directory exists
  if (!fs.existsSync(pricingDir)) {
    fs.mkdirSync(pricingDir, { recursive: true });
  }

  for (const url of CENIKI) {
    try {
      const pricing = await extractPricingFromPdf(url);

      const output = {
        ...pricing,
        _metadata: {
          source: url,
          extractedAt: new Date().toISOString(),
          script: "extract-pricing-data.js",
        },
      };

      // Save with slugified name
      const filename = `${slugify(pricing.name)}.json`;
      const outputPath = path.join(pricingDir, filename);
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
      console.log("Saved:", outputPath);
    } catch (error) {
      console.error(`Error extracting from ${url}:`, error.message);
    }
  }

  console.log("Pricing extraction complete!");
}

main();
