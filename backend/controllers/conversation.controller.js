const db = require("../models");
const Conversation = db.Conversation;
const Op = db.Sequelize.Op;

exports.findAll = (req, res) => {
  Conversation.findAll({ where: { userId: req.userId } })
    .then((data) => {
      res.send(data);
    })
    .catch((err) => {
      res.status(500).send({
        message:
          err.message || "Some error occurred while retrieving conversations.",
      });
    });
};

exports.findOne = (req, res) => {
  const id = req.params.id;

  Conversation.findByPk(id)
    .then((data) => {
      if (data.userId !== req.userId) {
        return res.status(403).send({
          message: "You are not authorized to access this conversation.",
        });
      }
      res.send(data);
    })
    .catch((err) => {
      res.status(500).send({
        message: "Error retrieving Conversation with id=" + id,
      });
    });
};
