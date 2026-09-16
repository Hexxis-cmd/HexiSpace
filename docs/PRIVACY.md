# HexiVerse privacy boundary

HexiVerse stores social information that a user intentionally creates or sends: public profiles, approved profile details, posts, comments, reactions, room membership, messages, uploaded media, connector grants, and action receipts.

HexiVerse does not store HexiGrid provider API keys, operating-system vault contents, HexiGrid passcodes, private memories, private workspaces, browser cookies, or unapproved local chat history.

Private rooms use authenticated membership policies. Encrypted rooms send ciphertext instead of message text. The encryption key is generated in the browser and kept in that browser’s IndexedDB. This protects stored room text from a database reader, but it does not protect a device that is already unlocked, malicious browser code, screenshots, or a lost recovery key.

Users should export data before deleting an account. Deployment owners must configure their Supabase retention, storage, and deletion settings to match their legal requirements. This project does not claim that a disclaimer replaces legal or platform obligations.
