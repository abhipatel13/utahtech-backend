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
    status: {
      type: Sequelize.ENUM('uploading', 'completed', 'error'),
      defaultValue: 'uploading'
    },
    uploader_id: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    // company_id: {
    //   type: Sequelize.INTEGER,
    //   allowNull: false,
    //   references: {
    //     model: 'company',
    //     key: 'id'
    //   }
    // },
  }, {
    tableName: 'file_uploads',
    timestamps: true,
    underscored: true
  });

  FileUpload.associate = function(models) {
    FileUpload.belongsTo(models.users, { 
      foreignKey: "uploader_id",
      as: 'uploadedBy'
    });
  };

  return FileUpload;
}; 