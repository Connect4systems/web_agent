const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const OpenAI = require("openai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const INSTRUCTION_PATH = path.join(__dirname, "prompts", "agent-instructions.txt");
const KNOWLEDGE_DIR = path.join(__dirname, "knowledge");

function readTextIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    return "";
  }
}

function readKnowledgeBlocks() {
  try {
    const files = fs
      .readdirSync(KNOWLEDGE_DIR)
      .filter((f) => f.endsWith(".txt"))
      .sort();

    return files
      .map((file) => {
        const content = readTextIfExists(path.join(KNOWLEDGE_DIR, file)).trim();
        return content ? `# ${file}\n${content}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
  } catch (err) {
    return "";
  }
}

function buildSystemPrompt() {
  const instructions = readTextIfExists(INSTRUCTION_PATH).trim();
  const knowledge = readKnowledgeBlocks();

  return `
${instructions}

You have access to knowledge blocks below:
${knowledge || "No knowledge blocks provided."}

Response style:
- concise, helpful, professional.
- if answer is uncertain, say what is known and ask a clarifying question.
- focus on ERPNext v15, Frappe, HRMS, and implementation/service inquiry.
`.trim();
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function buildChatLogText(chatLog = []) {
  if (!Array.isArray(chatLog) || chatLog.length === 0) {
    return "No chat log available.";
  }

  return chatLog
    .map((msg, idx) => {
      const role = msg.role === "assistant" ? "Agent" : "Guest";
      return `${idx + 1}. [${role}] ${msg.content || ""}`;
    })
    .join("\n");
}

app.post("/api/chat", async (req, res) => {
  try {
    const { messages = [] } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is not configured.",
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const systemPrompt = buildSystemPrompt();

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role === "assistant" ? "assistant" : "user",
          content: String(m.content || ""),
        })),
      ],
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || "I could not generate a response.";
    return res.json({ reply: text });
  } catch (error) {
    console.error("Chat API error:", error);
    return res.status(500).json({
      error: "Failed to generate response.",
    });
  }
});

app.post("/api/send-lead", async (req, res) => {
  try {
    const {
      name,
      mobile,
      usersCount,
      companyName,
      companyActivity,
      chatLog = [],
    } = req.body || {};

    if (!name || !mobile || !usersCount || !companyName || !companyActivity) {
      return res.status(400).json({
        error: "Missing required lead fields.",
      });
    }

    const transporter = createTransporter();
    if (!transporter) {
      return res.status(500).json({
        error: "SMTP is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.",
      });
    }

    const toEmail = process.env.LEAD_RECEIVER_EMAIL || process.env.SMTP_USER;
    const fromEmail = process.env.LEAD_SENDER_EMAIL || process.env.SMTP_USER;

    const chatLogText = buildChatLogText(chatLog);

    const subject = `New Inquiry Lead - ${companyName} (${name})`;
    const textBody = `
New guest inquiry captured by AI Agent.

Lead Details:
- Name: ${name}
- Mobile: ${mobile}
- Number of Users: ${usersCount}
- Company Name: ${companyName}
- Company Activity: ${companyActivity}

Chat Log:
${chatLogText}
`.trim();

    await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      subject,
      text: textBody,
    });

    return res.json({ ok: true });
  } catch (error) {
    console.error("Send lead error:", error);
    return res.status(500).json({ error: "Failed to send lead email." });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
