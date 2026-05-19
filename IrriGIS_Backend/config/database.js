const { Sequelize } = require('sequelize');

const config = {
  database: process.env.DB_NAME || 'irrigis',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'REDACTED_DB_PASSWORD_LOCAL',
  host: process.env.DB_HOST || 'localhost',
  dialect: 'postgres',
  port: process.env.DB_PORT || 5432,
  define: {
    underscored: true,
    paranoid: true
  }
};


const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  dialect: config.dialect,
  port: config.port,
  define: config.define
});

module.exports = {
  sequelize,
  Sequelize,
  config
};
