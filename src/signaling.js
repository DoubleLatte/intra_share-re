const io = require("socket.io")(3000, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("signal", (data) => {
    socket.to(data.to).emit("signal", { to: data.to, signal: data.signal });
  });

  socket.on("version-request", (data) => {
    socket.to(data.targetDevice).emit("version-request", data);
  });

  socket.on("version-response", (data) => {
    socket.to(data.requester).emit("version-response", data);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});