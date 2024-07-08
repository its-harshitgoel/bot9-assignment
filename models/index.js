// models/index.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Conversation = sequelize.define('Conversation', {
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  response: {
    type: DataTypes.TEXT,
    allowNull: false,
  }
});

sequelize.sync();

module.exports = {
  Conversation
};
