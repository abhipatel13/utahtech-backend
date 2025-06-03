module.exports = (sequelize, Sequelize) => {
  const FileUpload = sequelize.define("file_uploads", {
    id: {
      type: Sequelize.UUID,
      defaultValue: Sequelize.UUIDV4,
      primaryKey: true
    },
    fileName: {
      type: Sequelize.STRING,
      allowNull: false
    },
    originalName: {
      type: Sequelize.STRING,
      allowNull: false
    },
    fileType: {
      type: Sequelize.STRING,
      allowNull: false
    },
    fileSize: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    uploadedBy: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    status: {
      type: Sequelize.ENUM('uploading', 'completed', 'error'),
      defaultValue: 'uploading'
    },
    company: {
      type: Sequelize.STRING(150),
      allowNull: false,
      references: {
        model: 'users',
        key: 'company'
      }
    },
    createdAt: {
      field: 'created_at',
      type: Sequelize.DATE,
      allowNull: false
    },
    updatedAt: {
      field: 'updated_at',
      type: Sequelize.DATE,
      allowNull: false
    }
  });

  FileUpload.associate = function(models) {
    FileUpload.belongsTo(models.users, { 
      foreignKey: 'uploadedBy',
      as: 'uploader'
    });
  };

  return FileUpload;
}; 