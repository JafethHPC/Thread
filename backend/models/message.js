"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Message extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Message.belongsTo(models.Conversation, {
        foreignKey: "conversationId",
        as: "conversation",
        onDelete: "CASCADE",
      });
    }
  }
  Message.init(
    {
      role: DataTypes.STRING,
      content: DataTypes.JSONB,
      type: DataTypes.STRING,
      conversationId: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: "Message",
    }
  );
  return Message;
};
