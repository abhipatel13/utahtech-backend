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
        type: DataTypes.ENUM('uploading', 'completed', 'error'),
        defaultValue: 'uploading'
      },
      uploader_id: {
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
    this.belongsTo(models.user, { 
      foreignKey: "uploader_id",
      as: 'uploadedBy'
    });
  }
}

module.exports = FileUpload;