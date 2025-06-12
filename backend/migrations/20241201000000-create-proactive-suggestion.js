"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("ProactiveSuggestions", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      type: {
        type: Sequelize.ENUM(
          "follow_up_email",
          "reminder_task_due",
          "schedule_meeting",
          "deadline_reminder",
          "unread_important"
        ),
        allowNull: false,
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      context: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      priority: {
        type: Sequelize.ENUM("high", "medium", "low"),
        allowNull: false,
        defaultValue: "medium",
      },
      status: {
        type: Sequelize.ENUM(
          "active",
          "accepted",
          "dismissed",
          "completed",
          "snoozed"
        ),
        allowNull: false,
        defaultValue: "active",
      },
      sourceData: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      actionData: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      userResponse: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      expiresAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      snoozedUntil: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      completedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    // Add indexes for better query performance
    await queryInterface.addIndex("ProactiveSuggestions", ["userId"]);
    await queryInterface.addIndex("ProactiveSuggestions", ["status"]);
    await queryInterface.addIndex("ProactiveSuggestions", ["priority"]);
    await queryInterface.addIndex("ProactiveSuggestions", ["type"]);
    await queryInterface.addIndex("ProactiveSuggestions", ["expiresAt"]);
    await queryInterface.addIndex("ProactiveSuggestions", ["createdAt"]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("ProactiveSuggestions");
  },
};
