const errorHandler = require('./../helper/errorHandler');
const _ = require('lodash');

module.exports = {
    validate: async (req, res, next) => {
        try {

            var wordLength = 150;
            if (_.has(req.body, 'description')) {
                if (req.body.description.length > wordLength)
                    errorHandler.throwError(
                        400,
                        `can't be greater than ${wordLength} letters`,
                        `Description can not exceed  ${wordLength} letters`
                    );
            }
            next();
        } catch (err) {
            errorHandler.sendError(
                res,
                err.code,
                `${err.message}`,
                `Some validation criteria has been failed please check it and resolve. Possible error is :: ${err.errorType}`,
                req.originalUrl,
                `${__dirname}/${req.originalUrl}`
            );
        }
    }
}