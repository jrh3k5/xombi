// MovieAlreadyRequestedError expresses that a movie was already requested.
export class MovieAlreadyRequestedError extends Error {
  constructor(message: string) {
    super(message);
  }
}

// NoOmbiResponseError expresses that the Ombi API did not return a response.
export class NoOmbiResponseError extends Error {
  constructor(message: string) {
    super(message);
  }
}

// ShowAlreadyRequestedError expresses that a show was already requested.
export class ShowAlreadyRequestedError extends Error {
  constructor(message: string) {
    super(message);
  }
}

// NoRequestPermissions expresses that the user does not have permission to request media.
export class NoRequestPermissions extends Error {
  constructor(message: string) {
    super(message);
  }
}

// UnresolvableAddressError expresses that the given address could not be resolved.
export class UnresolvableAddressError extends Error {
  constructor(address: `0x${string}`) {
    super(`Unable to resolve address ${address}`);
  }
}
