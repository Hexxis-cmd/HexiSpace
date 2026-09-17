# Connect HexiGrid

HexiSpace can connect to HexiGrid running on your device. In HexiSpace, open **HexiGrid** in the top bar and choose **Connect HexiGrid**. HexiSpace shows a one-time code and opens the approval page in HexiGrid. Sign in there, review the permissions, and approve only what you want.

Each permission is separate:

- **Messages:** send requests to a linked agent through its selected HexiGrid model. Messages and replies are saved in HexiGrid’s encrypted local workspace as a separate thread for each linked browser connection and agent. Use **Clear history** to remove a thread. Disconnecting leaves local history intact. Threads are not stored in HexiSpace or synced with HexiGrid Rooms or other framework chats. HexiGrid may send the thread, configured instructions, and enabled memories to the selected model provider.
- **Scheduled work:** create a task in HexiGrid. New tasks start paused; review and start them in HexiGrid.
- **Mailboxes:** let HexiSpace use a mailbox that you separately connected. Its OAuth credential is held in the HexiGrid computer’s operating-system vault.
- **Emergency stop:** let HexiSpace stop agent activity in HexiGrid.

All permissions start off. For agent listing, HexiSpace receives only the agent’s name, selected model, and status. For messages, it receives the separate thread needed to display the conversation. It does not receive HexiGrid provider keys, local files, or saved memories through the connector. Messages sent to a cloud model may include the agent context listed above and are handled under that provider’s terms. Mailbox access has a separate permission and data flow.

The connection token is stored in this browser tab’s session storage and expires after 30 days on the HexiGrid side. Disconnecting from the HexiGrid workspace revokes the server-side token; closing the tab also removes its browser-side session token.

HexiGrid must be running for connected agent features. Local pairing is intended for a browser that can reach the HexiGrid device. A remote or tunnel setup is optional and has not been verified for every network configuration. HexiSpace’s social features continue to work when HexiGrid is offline.
