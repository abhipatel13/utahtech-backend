const { Sequelize } = require('sequelize');

class FileUpload extends Sequelize.Model {
  static init(sequelize, DataTypes) {
    return super.init({
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      fileName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      originalName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      fileType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      fileSize: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      status: {
        type: DataTypes.ENUM('uploading', 'processing', 'completed', 'error'),
        defaultValue: 'uploading'
      },
      errorMessage: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      companyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'company',
          key: 'id'
        }
      },
      uploaderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      }
    }, {
      sequelize,
      modelName: 'file_uploads',
      tableName: 'file_uploads',
      timestamps: true,
      underscored: true,
      paranoid: true
    });
  }

  static associate(models) {
    this.belongsTo(models.company, { 
      foreignKey: "companyId",
      as: 'company'
    });
    
    this.belongsTo(models.user, { 
      foreignKey: "uploaderId",
      as: 'uploadedBy'
    });
  }
}

module.exports = FileUpload;