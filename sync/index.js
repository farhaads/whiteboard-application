"use strict";

const WebSocket = require("ws");
const http = require("http");
const { setupWSConnection } = require("y-websocket/bin/utils");

const wss = new WebSocket.Server({ noServer: true });

wss.on("connection", setupWSConnection);

const host = process.env.HOST || "localhost";
const port = Number(process.env.PORT || 1234);

const server = http.createServer((_request, response) => {
  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("y-websocket sync ok");
});

server.on("upgrade", async (request, socket, head) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
    socket.destroy();
    return;
  }

  let authorized = false;
  try {
    const { jwtVerify } = await import("jose");
    const rawUrl = request.url || "/";
    const pathOnly = rawUrl.split("?")[0];
    const room = pathOnly.startsWith("/") ? pathOnly.slice(1) : pathOnly;
    const q = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?") + 1) : "";
    const token = new URLSearchParams(q).get("token");

    if (token && room && !room.includes("/") && !room.includes("..")) {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      const bid = payload.boardId;
      if (typeof bid === "string" && bid === room) {
        authorized = true;
      }
    }
  } catch {
    authorized = false;
  }

  if (!authorized) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.close(4401, "Unauthorized");
    });
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

server.listen(port, host, () => {
  console.log(`y-websocket listening on ws://${host}:${port}`);
});
