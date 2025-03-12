const jwt = require('jsonwebtoken');

exports.sendError = (res, code, message, description, url, breadCrumb) => {
  res.status(code).json({
    status: code,
    message: message,
    description: description,
    links: {
      url: url,
      breadCrumb: breadCrumb
    }
  });
}

exports.throwError = (code, errorType, errorMessage) => {
  error = new Error(errorMessage || 'Default Error')
  error.code = code
  error.errorType = errorType
  throw error
}

exports.sendSuccess = (res, code, message, description, payload) => {
  res.status(code).json({
    status: code,
    message: message,
    description: description,
    payload: payload
  })
}

exports.emptyError = (message) => {
  throw new Error(message || "Oops! It's look like you are sending empty data");
}