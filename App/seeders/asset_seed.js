module.exports = {
  up: async (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert('asset_heirarchies', [
      {
        id: 1,
        name: 'Asset 1',
        parent: null,
        assetId: 101,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 2,
        name: 'Asset 2',
        parent: null,
        assetId: 102,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: 3,
        name: 'Asset 3',
        parent: 1,
        assetId: 103,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('asset_heirarchies', null, {});
  }
}; 