import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { initPeer, sendMessage, receiveData } from "../utils/peer";

function ChatTab({ selectedDevice, settings }) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");

  useEffect(() => {
    const { ipcRenderer } = window.require("electron");
    const peer = initPeer(false, "receiver", { bandwidthLimit: settings.bandwidthLimit });
    receiveData(peer, settings.autoReceive, () => {}, () => {}, () => {}, setMessages, (data) => {
      if (data.type === "message") {
        setMessages((prev) => [...prev, { text: data.text, sender: data.sender, timestamp: new Date() }]);
        if (settings.enableNotifications && settings.notificationEvents.chat) {
          ipcRenderer.send("show-notification", {
            title: t("chat"),
            body: `${data.sender}: ${data.text}`,
            tab: "chat",
            device: selectedDevice,
          });
        }
      }
    });

    ipcRenderer.on("show-message-input", () => {
      document.getElementById("message-input")?.focus();
    });

    return () => {
      peer.destroy();
      ipcRenderer.removeAllListeners("show-message-input");
    };
  }, [settings, selectedDevice]);

  const handleSend = () => {
    if (input.trim() && selectedDevice) {
      const message = { text: input, sender: "You", timestamp: new Date() };
      sendMessage(input, selectedDevice);
      setMessages((prev) => [...prev, message]);
      setInput("");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      className="bg-[#36393F] rounded-lg p-6 h-full flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      <h2 className="text-xl font-bold text-white">{t("chat")}</h2>
      <div className="flex-1 mt-4 overflow-y-auto">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`p-2 my-1 rounded-lg ${
              msg.sender === "You" ? "bg-[#7289DA] text-white ml-auto" : "bg-[#4F545C] text-[#B9BBBE]"
            } max-w-[70%]`}
          >
            <p className="text-sm font-semibold">{msg.sender}</p>
            <p>{msg.text}</p>
            <p className="text-xs text-[#72767D]">{msg.timestamp.toLocaleTimeString()}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex">
        <textarea
          id="message-input"
          className="flex-1 border border-[#72767D] rounded p-2 bg-[#2F3136] text-[#B9BBBE]"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={t("send_message")}
        />
        <motion.button
          className="ml-2 bg-[#7289DA] text-white px-4 py-2 rounded-lg hover:bg-[#677BC4]"
          onClick={handleSend}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {t("send_message")}
        </motion.button>
      </div>
    </motion.div>
  );
}

export default ChatTab;