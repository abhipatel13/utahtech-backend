/* eslint-disable no-restricted-syntax */
const _ = require('lodash');
const models = require('../models');
const  AssetHeirarchy  =models.asset_hierarchy;
const Op = models.Sequelize.Op;
// const logger = require('../configs/logger');
const helper = require('../helper/helper')
const RiskMatrix  =models.risk_matrices;


module.exports.saveAssetHeirarchy = async (req, res) => {
try {
	let newAsset = await AssetHeirarchy.bulkCreate(req.body);
     return res.status(201).send({ status : 200, data: newAsset });
   } catch (err) {
	return res.status(500).send(err);
  }
  }

  module.exports.getDescendants = async (req, res) => {
	try {
		const result = await AssetHeirarchy.findAll({where :{}, attr : ['name', 'id', 'assetId','parent']})
		 var t = {};
		 const root =undefined;
		 result.forEach(o => {
			 Object.assign(t[o.assetId.toString()] = t[o.assetId.toString()] || {}, o.dataValues);
			 let parent = o.parent ? o.parent.toString() : undefined;
			 t[parent] = t[parent] || {};
			 t[parent].children = t[parent].children || [];
			 t[parent].children.push(t[o.assetId.toString()]);
		 });
		  
	   res.status(201).send({ "status": "success", "result": t[root].children });
	   } catch (err) {
		 res.status(500).send(err);
	   }
	}


module.exports.saveRowMatrix = async (req, res) => {
	try {
     if(req.body.matrices.length){
		 let matrices = [];
		let arrMAt = req.body.matrices;
		 for(var i=0; i <arrMAt.length; i++){
		   let item = arrMAt[i];
		   item.user_id = req.body.user_id;
		   item.mat_type = req.body.mat_type;
		   if(item.id){
		   let matrix = 	await RiskMatrix.findOne({where : {id : item.id}});
		   await matrix.update(item);  
		   matrices.push(matrix.dataValues);
	    	}else{
			delete item.id;

			let matrix = await RiskMatrix.create(item);
			matrices.push(matrix.dataValues);
		   }
		}
		return res.status(200).send({status : 200, data : matrices});  

		}else{
			return res.status(500).send({status : 500, message : "Please the matrix data"}); 
		}

		} catch (err) {
		return res.status(500).send(err);
		}
		}



		module.exports.saveRowMatrix = async (req, res) => {
			try {
			 if(req.body.matrices.length){
				 let matrices = [];
				let arrMAt = req.body.matrices;
				 for(var i=0; i <arrMAt.length; i++){
				   let item = arrMAt[i];
				   item.user_id = req.body.user_id;
				   item.mat_type = req.body.mat_type;
				   if(item.id){
				   let matrix = 	await RiskMatrix.findOne({where : {id : item.id}});
				   await matrix.update(item);  
				   matrices.push(matrix.dataValues);
					}else{
					delete item.id;
		
					let matrix = await RiskMatrix.create(item);
					matrices.push(matrix.dataValues);
				   }
				}
				return res.status(200).send({status : 200, data : matrices});  
		
				}else{
					return res.status(500).send({status : 500, message : "Please the matrix data"}); 
				}
		
				} catch (err) {
				return res.status(500).send(err);
				}
				}

		module.exports.getRowMatrix = async (req, res) => {
			try {
				 if(req.body.user_id &&  req.body.mat_type){
					let matrices = 	await RiskMatrix.findAll({where : {user_id : req.body.user_id, mat_type : req.body.mat_type}});
				   if(matrices.length){
			         return res.status(200).send({status : 200, data : matrices});
				   }else{
					return res.status(500).send({status : 500, message : "No Data Found"});
				   }
				}else{
					return res.status(500).send({status : 500, message : "Please send the user id and matrix type"});
				}
				} catch (err) {
				return res.status(500).send(err);
				}
				}
