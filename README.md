# clokr-extension
CLOKR — AI Privacy Shield
Your data never leaves your browser.
CLOKR is a Chrome extension that automatically detects and masks sensitive personal data (PII) before it's sent to AI chatbots like ChatGPT, Claude, Gemini, and Copilot.

The Problem
Every time you chat with an AI, your data is sent to external servers and potentially used for model training. All 6 major AI providers (OpenAI, Google, Meta, Microsoft, Amazon, Anthropic) use chat data for training by default.
76% of AI chatbot users don't understand the privacy risks of their interactions. Meanwhile, 15% of employees paste sensitive data into public LLMs.
CLOKR fixes this.

How It Works
You type: "My tax code is RSSMRA85M01H501Z, email mario.rossi@gmail.com"
                              |
              CLOKR intercepts before sending
                              |
ChatGPT receives: "My tax code is [CF_1], email [EMAIL_1]"
                              |
           ChatGPT responds using placeholders
                              |
     CLOKR de-masks the response for you
All processing happens locally in your browser. Zero data is sent to external servers. Zero telemetry. Zero tracking.

What CLOKR Detects and Masks
Data TypeExampleMasked AsEmailmario.rossi@gmail.com[EMAIL_1]IBANIT60X0542811101000000123456[IBAN_1]Italian Tax Code (CF)RSSMRA85M01H501Z[CF_1]Phone Number+39 333 1234567[PHONE_1]
More data types coming soon: credit cards, addresses, medical data, and more.

Installation
From Source (Developer Mode)

Download or clone this repository:

bash   git clone https://github.com/progetticyber/clokr-extension.git

Open Chrome and go to chrome://extensions/
Enable Developer Mode (toggle in the top-right corner)
Click "Load unpacked"
Select the clokr-extension folder (the one containing manifest.json)
Done — you should see the CLOKR icon in your toolbar

From Chrome Web Store
Coming soon.

Test It
Go to chat.openai.com and try sending this message:

Hi, here are my details: my tax code is BNCMRC90A01F205X, my email is marco.bianchi@gmail.com, my IBAN is IT60X0542811101000000987654 and my phone number is 347 9876543. Can you check if everything is correct?

If CLOKR is working, ChatGPT will receive placeholder tokens instead of your real data.

Project Structure
clokr-extension/
├── manifest.json              # Chrome extension manifest (MV3)
├── background.js              # Service worker
├── icons/                     # Extension icons
│   ├── clokr-icon.svg
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── popup/                     # Extension popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── src/
    ├── content/               # Content scripts (injected into chatbot pages)
    │   ├── main.js
    │   └── chatgpt-adapter.js
    └── utils/                 # Core logic
        ├── pii-detector.js    # PII detection engine (regex patterns)
        └── masker.js          # Masking/de-masking engine

Key Features

100% Local Processing — All PII detection and masking happens in your browser. Nothing is sent to any server.
Real-Time Masking — Data is masked before it reaches the chatbot, not after.
Consistent Placeholders — The same entity always gets the same placeholder within a session (e.g., your email is always [EMAIL_1]).
Open Source — The code is publicly auditable. Trust through transparency, not promises.
GDPR-Compliant by Design — Zero data collection means zero GDPR risk.


Roadmap

 MVP: PII masking on ChatGPT (regex-based)
 Multi-platform support (Claude, Gemini, Copilot)
 NER-based detection (names, locations, organizations)
 Response de-masking (automatic placeholder replacement)
 Firefox support
 User settings (choose which PII types to mask)
 Premium features (advanced detection, unlimited usage)


Contributing
Contributions are welcome. Whether it's reporting bugs, suggesting new PII patterns to detect, adding support for new chatbot platforms, or improving regex accuracy — feel free to open an Issue or submit a Pull Request.

Why CLOKR?
The privacy-preserving AI market is projected to reach $39.93 billion by 2035. Currently, enterprise solutions cost over 100K per year while consumer tools are limited to single platforms with basic regex detection.
CLOKR bridges this gap: enterprise-grade privacy protection, accessible to everyone, for free.

License
This project is licensed under the MIT License.

Author
Built by progetticyber — ITS Cybersecurity student, Italy.

Your data. Your control. Your browser.
If you find this useful, consider starring the repo.
