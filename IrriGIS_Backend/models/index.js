const { sequelize, Sequelize } = require('../config/database');
const fs = require('fs');
const path = require('path');

const models = {};

// Load all model files
const modelFiles = fs.readdirSync(__dirname)
  .filter(file => file !== 'index.js' && file.endsWith('.js'));

console.log('Found model files:', modelFiles);

modelFiles.forEach(file => {
  try {
    console.log(`Loading model from file: ${file}`);
    const modelDefiner = require(path.join(__dirname, file));
    
    console.log(`Type of export from ${file}:`, typeof modelDefiner);
    
    if (typeof modelDefiner !== 'function') {
      console.error(`❌ ${file} does not export a function. It exports:`, modelDefiner);
      return;
    }
    
    // Pass both sequelize and Sequelize.DataTypes to ensure compatibility
    const model = modelDefiner(sequelize, Sequelize.DataTypes);
    models[model.name] = model;
    console.log(`✅ Successfully loaded model: ${model.name} from ${file}`);
    
  } catch (error) {
    console.error(`❌ Error loading model from ${file}:`, error.message);
    console.error('Stack:', error.stack);
  }
});

// Set up associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    try {
      models[modelName].associate(models);
      console.log(`✅ Associated model: ${modelName}`);
    } catch (error) {
      console.error(`❌ Error associating model ${modelName}:`, error.message);
      console.error('Stack:', error.stack);
    }
  }
});

console.log('Final models object keys:', Object.keys(models));

module.exports = {
  ...models,
  sequelize,
  Sequelize
};