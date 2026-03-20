# CLOKR — AI Privacy Shield: Privacy Policy

CLOKR is a browser extension designed to help users protect their privacy when using AI chat tools.

## Data processing

- CLOKR analyzes the text typed by the user in AI chat input fields in order to detect patterns that look like:
  - email addresses
  - IBAN numbers
  - Italian tax codes (Codice Fiscale)
  - phone numbers

- This processing happens **only locally in the user's browser**.  
- CLOKR **does not send** any of this text, or any other user data, to external servers controlled by the developer or by third parties.

## Data collection and sharing

- CLOKR **does not collect, store, or log** user data on external servers.
- The extension **does not sell or share** user data with third parties.
- Any mapping between placeholders (for example `[EMAIL_1]`) and original values is kept in the browser only for the duration needed to display the chatbot response.

## Permissions

CLOKR uses browser permissions (such as access to active tabs, storage and specific hosts) only to:

- detect when the user is on a page that contains an AI chat tool,
- scan the text in the input field,
- temporarily store the placeholder mapping inside the browser.

These permissions are **not** used to track users or to build profiles.

## Contact

For questions about this extension or this policy, please open an issue on GitHub:

https://github.com/progetticyber/clokr-extension/issues
