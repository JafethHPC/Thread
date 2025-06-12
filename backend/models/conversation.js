"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Conversation extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      Conversation.belongsTo(models.User, {
        foreignKey: "userId",
        as: "user",
      });
      Conversation.hasMany(models.Message, {
        foreignKey: "conversationId",
        as: "messages",
        onDelete: "CASCADE",
        hooks: true,
      });
    }
  }
  Conversation.init(
    {
      title: DataTypes.STRING,
      userId: DataTypes.INTEGER,
    },
    {
      sequelize,
      modelName: "Conversation",
    }
  );
  return Conversation;
};
