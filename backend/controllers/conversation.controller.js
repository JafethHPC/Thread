const db = require("../models");

// Get all conversations for a user
exports.getConversations = async (req, res) => {
  try {
    const conversations = await db.Conversation.findAll({
      where: { userId: req.userId },
      order: [["updatedAt", "DESC"]],
    });
    res.status(200).json(conversations);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ message: "Error fetching conversations" });
  }
};

// Get a single conversation with all its messages
exports.getConversationById = async (req, res) => {
  try {
    const { id } = req.params;
    const conversation = await db.Conversation.findOne({
      where: { id, userId: req.userId },
      include: [
        {
          model: db.Message,
          as: "messages",
          order: [["createdAt", "ASC"]],
        },
      ],
    });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    res.status(200).json(conversation);
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ message: "Error fetching conversation" });
  }
};

// Delete a conversation
exports.deleteConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const conversation = await db.Conversation.findOne({
      where: { id, userId: req.userId },
    });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    await conversation.destroy();
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting conversation:", error);
    res.status(500).json({ message: "Error deleting conversation" });
  }
};

exports.deleteAllConversations = async (req, res) => {
  try {
    const { userId } = req;
    // fetch ids
    const convs = await db.Conversation.findAll({
      where: { userId },
      attributes: ["id"],
    });
    const ids = convs.map((c) => c.id);
    if (ids.length) {
      await db.Message.destroy({ where: { conversationId: ids } });
      await db.Conversation.destroy({ where: { id: ids } });
    }
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting all conversations:", error);
    res.status(500).json({ message: "Error deleting conversations" });
  }
};
