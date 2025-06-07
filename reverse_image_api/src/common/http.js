export class BaseResponseObject {
  constructor(success, message, data = null) {
    this.success = success;
    this.message = message;
    this.data = data;
  }
}

export class SuccessResponseObject extends BaseResponseObject {
  constructor(message, data) {
    super(true, message, data);
  }
}

export class ErrorResponseObject extends BaseResponseObject {
  constructor(message, data) {
    super(false, message, data);
  }
}
