const models = require('../models');
const User = models.users;
const Op = models.Sequelize.Op;


module.exports.getAllUser = async (req, res) => {
  try {
    const result = await User.findAll({attributes: ['id', 'email', 'name', 'phone_no', 'profile_pic']})
   
    if(result.length){
       return res.status(201).send({status : 201, data : result });
    }else{
        return res.status(401).send({status : 401, message : "User not Found"});
    }
   
  } catch (err) {
   return res.status(500).send(err);
    }
    }


    module.exports.updateUser = async (req, res) => {
        try {
            if (req.body && req.params.id) {
              let userId = req.params.id;
              let UserSet = req.body;
               let user = await User.findOne({ where:{id :userId} });
                  // Check if record exists in db
                  if (user) {
                   var edited = await  user.update(UserSet);
                  }
            
                if (edited) {
                  res.send(edited);
                } else {
                  res.status(500).send({status: 500, data: null, message: "User not  found"}).end()
                }
      
              }
         
        } catch (err) {
         return  res.status(500).send(err);
          }
    }


    module.exports.getUserById=  async function (req, res) {
        try {
          var userId = req.params.id
          let user = await User.findOne({where : {id: userId}, include:['supervisor']});
          if (user) {
            res.status(200).send({ status: 200, data: user }).end()
          } else {
            res.status(500).send({ status: 500, data: null, message: "User not  found" }).end()
          }
        }
        catch (e) {
         return res.status(500).send(e);
        }
      }


