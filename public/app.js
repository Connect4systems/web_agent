const chatWindow = document.getElementById("chat-window");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

const state = {
  messages: [],
  lead: {
    name: "",
    mobile: "",
    usersCount: "",
    companyName: "",
    companyActivity: "",
  },
  leadFlowStarted: false,
  leadSubmitted: false,
};

const LEAD_QUESTIONS = [
  { key: "name", label: "Name", question: "May I have your name?" },
  { key: "mobile", label: "Mobile", question: "Please share your mobile number." },
  { key: "usersCount", label: "No of user", question: "How many users will use the system?" },
  { key: "companyName", label: "Company name", question: "What is your company name?" },
  { key: "companyActivity", label: "Company activity", question: "What is your company activity/business line?" },
];

function pushMessage(role, content) {
  state.messages.push({ role, content });
  renderMessage(role, content);
}

function renderMessage(role, content) {
  const div = document.createElement("div");
  div.className = `message ${role === "assistant" ? "agent" : "user"}`;
  div.textContent = content;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function findNextMissingLeadField() {
  return LEAD_QUESTIONS.find((q) => !String(state.lead[q.key] || "").trim()) || null;
}

function updateLeadFromUserMessage(userText) {
  const missing = findNextMissingLeadField();
  if (missing) {
    state.lead[missing.key] = userText.trim();
  }
}

function shouldStartLeadFlow(text) {
  const t = text.toLowerCase();
  return (
    t.includes("quote") ||
    t.includes("pricing") ||
    t.includes("implement") ||
    t.includes("demo") ||
    t.includes("contact") ||
    t.includes("consult")
  );
}

async function callChatApi() {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: state.messages }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to get assistant response.");
  }
  return data.reply;
}

async function sendLead() {
  const payload = {
    ...state.lead,
    chatLog: state.messages,
  };

  const response = await fetch("/api/send-lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Failed to send lead.");
  }
  return data;
}

function greet() {
  pushMessage(
    "assistant",
    "Hello, I’m your ERPNext/Frappe inquiry assistant. Ask me anything about ERPNext v15, HRMS, implementation, or integrations."
  );
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = "";
  pushMessage("user", text);

  try {
    if (!state.leadSubmitted) {
      if (state.leadFlowStarted) {
        updateLeadFromUserMessage(text);
        const nextField = findNextMissingLeadField();

        if (nextField) {
          pushMessage("assistant", nextField.question);
          return;
        }

        await sendLead();
        state.leadSubmitted = true;
        pushMessage(
          "assistant",
          "Thanks. I’ve captured your details and shared the full inquiry with our team. They will contact you shortly."
        );
        return;
      }

      if (shouldStartLeadFlow(text)) {
        state.leadFlowStarted = true;
        const firstMissing = findNextMissingLeadField();
        if (firstMissing) {
          pushMessage(
            "assistant",
            `I can help with that. To proceed, I need a few details.\n${firstMissing.question}`
          );
          return;
        }
      }
    }

    pushMessage("assistant", "Typing...");
    const typingNode = chatWindow.lastChild;

    const reply = await callChatApi();

    if (typingNode && typingNode.textContent === "Typing...") {
      typingNode.remove();
    }

    pushMessage("assistant", reply);

    if (!state.leadFlowStarted && shouldStartLeadFlow(text)) {
      state.leadFlowStarted = true;
      const firstMissing = findNextMissingLeadField();
      if (firstMissing) {
        pushMessage("assistant", firstMissing.question);
      }
    }
  } catch (error) {
    const last = chatWindow.lastChild;
    if (last && last.textContent === "Typing...") {
      last.remove();
    }
    pushMessage("assistant", `Error: ${error.message}`);
  }
});

greet();
