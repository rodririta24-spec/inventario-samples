export class ValidationError extends Error {
  constructor(errors) {
    super(errors.join('. '));
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class DuplicateSerialError extends Error {
  constructor(existing) {
    super(`Ya existe un equipo con el serial ${existing.serial}`);
    this.name = 'DuplicateSerialError';
    this.existing = existing;
  }
}
