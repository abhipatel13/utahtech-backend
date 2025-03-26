// const User = require('./../models/warehouse'); //Model
// const Suspend = require('./../models/suspend_user'); //Model

var authenticate = (req, res, next) => {
//   var token = req.header('x-auth');
// // console.log(token);
//   User.findByToken(token).then((user) => {
//     console.log(user)
//     if (!user) {
//       return Promise.reject();
//     }
//     req.user = user;
//     req.token = token;
//     next();
//     // Suspend.findOne({suspendAll:true}).then(responce => {
//     //   if(responce) return res.json({
//     //     message: "Your account is on hold. Please contact Admin at ezride.sg@gmail.com",
//     //     status: 0
//     //   });
//     //   next();
//     // }).catch(err => {
//     //   console.log(err.message);
//     // });
//   }).catch((e) => {
//     res.status(401).send({status:0, message:"Invalid Token", tokenValid:0});
  // });
};

module.exports = {authenticate};
