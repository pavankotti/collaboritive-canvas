# 🖌️ collaborative canvas

a realtime collaborative drawing web app built using **vanilla typescript**, **html5 canvas**, and **socket.io**.  
multiple users can draw together, see live cursors, and perform **per-user undo/redo** actions in sync.

---

## ⚙️ setup instructions (works with `npm install && npm start`)

### 🧩 requirements
- node.js 18+
- npm (or pnpm / yarn)

### 🧠 local development setup
```bash
# clone repo
git clone https://github.com/pavankotti/collaborative-canvas.git
cd collaborative-canvas

# install dependencies for both client and server
npm install

# start both (client + server)
npm start

```

## 👥 how to test with multiple users

1. open the deployed app (or `http://localhost:5173`) in **two tabs** or different browsers.  
2. draw in **tab a** — strokes instantly appear in **tab b**.  
3. switch to **eraser mode** and erase a few lines — see them reflected across both tabs.  
4. click **undo / redo** — only your own strokes are affected, but both tabs update since the server re-syncs visible operations.  
5. close one tab — the **users list** in the other automatically updates to show who left.  
6. reopen the closed tab — it receives a complete **sync** of all currently visible drawing data.

---

## 🪲 known limitations / bugs

| limitation | explanation |
|-------------|-------------|
| **persistence** | drawings are reset when the server restarts (no database) |
| **authentication** | none — users are identified using a UUID |
| **cold starts** | render’s free tier can delay websocket connections on first load |
| **conflicts** | “last draw wins” since canvas rendering is raster-based |
| **performance** | optimized for small–medium sessions (~10k points total) |

---

## ⏱️ time spent on the project

| phase | duration |
|--------|-----------|
| planning & setup | ~1 hr |
| canvas rendering (draw + erase) | ~2 hrs |
| socket.io integration | ~2 hrs |
| undo/redo logic | ~1 hr |
| presence & cursors | ~1 hr |
| docs & polish | ~1 hr |
| **total** | **~7–8 hrs** |

---